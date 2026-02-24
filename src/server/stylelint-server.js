'use strict';

const fsPromises = require('fs').promises;
const {
  join,
  dirname,
  isAbsolute
} = require('path');
const {
  TextDocument,
  CodeActionKind
} = require('vscode-languageserver');
const parseUri = require('vscode-uri').URI.parse;
const { pathToFileURL } = require('url');
const findPkgDir = require('find-pkg-dir');
const stylelintVSCode = require('./stylelint-vscode');
const { isRangeOverlap, generateTextEdits, isNodeModulesPath, getWorkspaceForDocument } = require('../shared/utils');
const resolveStylelintOptions = require('./options-resolver');
const LRUCache = require('../shared/lru-cache');
const DocumentDiagnosticsManager = require('./document-diagnostics-manager');
const DiagnosticsBatcher = require('./diagnostics-batcher');
const {
  STYLELINT_ERROR_CODE_CONFIG,
  DIAGNOSTIC_OVERLAP_LINE_THRESHOLD,
  DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD,
  VERSION_CACHE_TTL,
  WORKSPACE_CACHE_TTL,
  VALIDATION_DEBOUNCE_MS,
  MAX_CONCURRENT_VALIDATIONS,
  MAX_VERSION_CACHE_SIZE,
  MAX_FILE_SIZE
} = require('../shared/constants');

/**
 * Stylelint Language Server
 * Provides linting and auto-fix capabilities for CSS/SCSS/Less files
 */
class StylelintServer {
  /**
   * Create a new StylelintServer instance
   * @param {Object} connection - VSCode language server connection
   * @param {Object} documents - Text documents manager
   */
  constructor(connection, documents) {
    this.connection = connection;
    this.documents = documents;
    this.documentDiagnostics = new DocumentDiagnosticsManager();
    this.diagnosticsBatcher = new DiagnosticsBatcher(connection);

    // Configuration
    this.config = null;
    this.autoFixOnSave = false;
    this.useLocal = false;
    this.disableErrorMessage = false;
    this.runMode = 'onType';
    this.configFile = '';
    this.ignorePath = '';
    this.ignoreNodeModules = true;
    this.ruleCustomizations = [];
    this.disableRuleCommentLocation = 'separateLine';

    // Track whether we've received the first configuration push
    this._initialConfigReceived = false;

    // State
    this.detectedStylelintVersion = null;
    this.isUsingLocal = false;
    this.isShuttingDown = false;

    // Error deduplication: tracks reported errors to avoid duplicate popups
    // Key: "uri|errorType", cleared on config file changes (validateAll)
    this.reportedErrors = new Map();

    // Caches
    this.versionCache = new LRUCache(MAX_VERSION_CACHE_SIZE);
    this.workspaceCache = null;
    this.workspaceCacheTime = 0;

    // Resolution cache: avoids repeated filesystem traversal for stylelint path + ignorePath
    // Key: workspace folder URI or '__untitled__'; Value: { path, ignorePath, localNotFound }
    this.resolutionCache = new Map();

    // Validation tokens for cancellation
    this.validationTokens = new Map();

    // Debounced validation timers
    this.validateDebouncers = new Map();

    // URIs that received diagnostics from lintWorkspace (not open in editor)
    // Used to clear stale diagnostics on next lintWorkspace or dispose
    this.workspaceLintUris = new Set();

    // Bound error handlers for cleanup
    this.boundUnhandledRejection = null;
    this.boundUncaughtException = null;

    // Setup global error handlers
    this.setupErrorHandlers();
  }

  /**
   * Setup global error handlers for uncaught exceptions
   * @private
   */
  setupErrorHandlers() {
    this.boundUnhandledRejection = (reason, promise) => {
      this.connection.console.log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    };

    this.boundUncaughtException = (error) => {
      this.connection.console.log(`Uncaught Exception: ${error?.stack || String(error)}`);
      this.isShuttingDown = true;
      this.dispose();
    };

    process.on('unhandledRejection', this.boundUnhandledRejection);
    process.on('uncaughtException', this.boundUncaughtException);
  }

  /**
   * Safely send a notification to the client
   * @param {string} method - Notification method
   * @param {any} [params] - Notification parameters
   */
  safeNotification(method, params) {
    if (this.isShuttingDown) {
      return;
    }

    if (!this.connection) {
      return;
    }

    try {
      this.connection.sendNotification(method, params);
    }
    catch (err) {
      // Silently handle connection errors
      console.error(`Failed to send notification ${method}:`, err);
    }
  }

  /**
   * Handle stylelint errors with proper user feedback
   * @param {Error} err - Error object
   * @param {string} context - Error context (e.g., 'validation', 'autofix')
   * @param {string} [documentUri] - Document URI for error deduplication
   */
  handleStylelintError(err, context, documentUri) {
    const stack = err?.stack || String(err);

    this.connection.console.log(`stylelint ${context} error: ${stack}`);

    if (this.detectedStylelintVersion) {
      this.connection.console.log(
        `stylelint version: ${this.detectedStylelintVersion} (${this.isUsingLocal ? 'local' : 'bundled'})`
      );
    }

    if (this.disableErrorMessage) {
      return;
    }

    // Deduplicate error messages per document + error type
    if (documentUri) {
      const errorKey = `${documentUri}|${err.code || err.message || 'unknown'}`;

      if (this.reportedErrors.has(errorKey)) {
        return;
      }

      this.reportedErrors.set(errorKey, true);
    }

    if (err.reasons) {
      for (const reason of err.reasons) {
        this.connection.window.showErrorMessage(`stylelint: ${reason}`);
      }
      return;
    }

    if (err.code === STYLELINT_ERROR_CODE_CONFIG) {
      this.connection.window.showErrorMessage(`stylelint: ${err.message || 'Configuration error'}`);
      return;
    }

    this.connection.window.showErrorMessage(stack.replace(/\n/ug, ' '));
  }

  /**
   * Get workspace folder for a document — delegates to utils
   * Kept as instance method for test seam compatibility.
   * @param {string} documentUri - Document URI
   * @param {Array} folders - Workspace folders
   * @returns {Object|undefined} Workspace folder or undefined
   */
  getWorkspaceForDocument(documentUri, folders) {
    return getWorkspaceForDocument(documentUri, folders);
  }

  /**
   * Check if a URI is inside node_modules — delegates to utils
   * Kept as instance method for test seam compatibility.
   * @param {string} uri - Document URI
   * @returns {boolean} True if path is inside node_modules
   */
  isNodeModulesPath(uri) {
    return isNodeModulesPath(uri);
  }

  /**
   * Get workspace folders with caching
   * @returns {Promise<Array>} Workspace folders
   */
  async getWorkspaceFolders() {
    const now = Date.now();

    if (this.workspaceCache && (now - this.workspaceCacheTime) < WORKSPACE_CACHE_TTL) {
      return this.workspaceCache;
    }

    const folders = await this.connection.workspace.getWorkspaceFolders();
    this.workspaceCache = folders;
    this.workspaceCacheTime = now;

    return folders;
  }

  /**
   * Get version info for stylelint with caching
   * @param {string} [stylelintPath] - Path to stylelint module
   * @returns {Promise<Object>} Version info {version, isLocal}
   */
  async getVersionInfo(stylelintPath) {
    const cacheKey = stylelintPath || '__bundled__';
    const cached = this.versionCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < VERSION_CACHE_TTL) {
      return {
        version: cached.version,
        isLocal: cached.isLocal
      };
    }

    let version;
    let isLocal;

    if (stylelintPath) {
      try {
        const pkgPath = join(stylelintPath, 'package.json');
        const pkgContent = await fsPromises.readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent);
        version = pkg.version;
        isLocal = true;
      }
      catch (_err) {
        version = 'unknown';
        isLocal = true;
      }
    }
    else {
      try {
        const bundledPkg = require('stylelint/package.json');
        version = bundledPkg.version;
        isLocal = false;
      }
      catch (_err) {
        version = '15.x';
        isLocal = false;
      }
    }

    this.versionCache.set(cacheKey, {
      version,
      isLocal,
      timestamp: now
    });

    return { version, isLocal };
  }

  /**
   * Resolve stylelint options for a document — delegates to options-resolver module.
   * Kept as an instance method to serve as a test seam (50+ unit tests stub this).
   * @param {string} documentUri - Document URI
   * @returns {Promise<Object>} Stylelint options
   */
  resolveStylelintOptions(documentUri) {
    return resolveStylelintOptions(documentUri, {
      getWorkspaceFolders: () => this.getWorkspaceFolders(),
      getWorkspaceForDocument: (uri, folders) => this.getWorkspaceForDocument(uri, folders),
      useLocal: this.useLocal
    });
  }

  /**
   * Build stylelint options for a document, resolving workspace, cwd, ignorePath, and local path.
   * Shared by validate(), executeAutofix(), and onWillSaveWaitUntil.
   *
   * @param {Object} document - Text document
   * @param {Object} [extraOptions={}] - Additional options to merge (e.g., {fix: true})
   * @returns {Promise<{options: Object, localNotFound: boolean}>}
   *   - options: The resolved stylelint options
   *   - localNotFound: true if useLocal is enabled but local stylelint was not found (absolute path only)
   */
  async buildStylelintOptions(document, extraOptions = {}) {
    const options = {...extraOptions};

    // configFile takes precedence over inline config
    if (this.configFile) {
      options.configFile = this.configFile;
    }
    else if (this.config) {
      options.config = this.config;
    }

    const documentPath = parseUri(document.uri).fsPath;
    const isAbsPath = documentPath && isAbsolute(documentPath);

    if (isAbsPath) {
      const folders = await this.getWorkspaceFolders();
      const workspace = this.getWorkspaceForDocument(document.uri, folders);

      if (workspace) {
        options.cwd = parseUri(workspace.uri).fsPath;
      }
      else {
        options.cwd = dirname(documentPath);
      }

      // Resolve configFile relative path
      if (options.configFile && !isAbsolute(options.configFile) && options.cwd) {
        options.configFile = join(options.cwd, options.configFile);
      }

      // Cache by package root to avoid cross-package leakage in monorepos
      // findPkgDir returns the closest directory containing package.json
      const pkgRoot = findPkgDir(documentPath) || dirname(documentPath);
      const workspaceKey = workspace ? workspace.uri : '__no_workspace__';
      const cacheKey = `${workspaceKey}|${pkgRoot}`;
      const cached = this.resolutionCache.get(cacheKey);

      let ignorePath;
      let stylelintPath;

      if (cached) {
        ignorePath = cached.ignorePath;
        stylelintPath = cached.path;
      }
      else {
        const resolved = await this.resolveStylelintOptions(document.uri);

        ignorePath = resolved.ignorePath;
        stylelintPath = resolved.path;

        this.resolutionCache.set(cacheKey, {
          ignorePath,
          path: stylelintPath
        });
      }

      // User-specified ignorePath takes precedence over auto-discovered
      if (this.ignorePath) {
        options.ignorePath = isAbsolute(this.ignorePath)
          ? this.ignorePath
          : join(options.cwd, this.ignorePath);
      }
      else if (ignorePath) {
        options.ignorePath = ignorePath;
      }

      if (this.useLocal) {
        if (!stylelintPath) {
          return {options, localNotFound: true};
        }

        options.path = stylelintPath;
      }
    }
    else {
      // Untitled document: try to use workspace as cwd for config lookup
      const folders = await this.getWorkspaceFolders();

      if (folders && folders.length > 0) {
        options.cwd = parseUri(folders[0].uri).fsPath;

        if (this.useLocal) {
          const cacheKey = '__untitled__';
          const cached = this.resolutionCache.get(cacheKey);

          if (cached) {
            if (cached.path) {
              options.path = cached.path;
            }
            else {
              return {options, localNotFound: true};
            }
          }
          else {
            const localPath = join(options.cwd, 'node_modules', 'stylelint');

            try {
              await fsPromises.access(localPath);
              options.path = localPath;
              this.resolutionCache.set(cacheKey, {path: localPath});
            }
            catch {
              // Local stylelint not found in workspace, will fallback to bundled
              this.resolutionCache.set(cacheKey, {path: null});

              return {options, localNotFound: true};
            }
          }
        }
      }
    }

    return {options, localNotFound: false};
  }

  /**
   * Apply rule severity customizations to diagnostics
   * @param {Array} diagnostics - Array of LSP Diagnostic objects
   * @returns {Array} Diagnostics with customized severities (filtered if 'off')
   */
  applyRuleCustomizations(diagnostics) {
    if (!this.ruleCustomizations || this.ruleCustomizations.length === 0) {
      return diagnostics;
    }

    // Build a lookup map for quick access
    const customMap = new Map();

    for (const {rule, severity} of this.ruleCustomizations) {
      if (rule && severity) {
        customMap.set(rule, severity);
      }
    }

    if (customMap.size === 0) {
      return diagnostics;
    }

    // DiagnosticSeverity: Error=1, Warning=2, Information=3, Hint=4
    const severityMap = {
      error: 1,
      warning: 2,
      information: 3,
      hint: 4
    };

    return diagnostics
      .filter(d => {
        const custom = customMap.get(d.code);

        return custom !== 'off';
      })
      .map(d => {
        const custom = customMap.get(d.code);

        if (custom && severityMap[custom]) {
          return {...d, severity: severityMap[custom]};
        }

        return d;
      });
  }

  /**
   * Clear debounce timer for a document
   * @param {string} uri - Document URI
   * @private
   */
  clearDebouncer(uri) {
    if (this.validateDebouncers.has(uri)) {
      clearTimeout(this.validateDebouncers.get(uri));
      this.validateDebouncers.delete(uri);
    }
  }

  /**
   * Validate a document with debouncing
   * @param {Object} document - Text document
   */
  validateDebounced(document) {
    const uri = document.uri;

    // Clear existing debounce timer
    this.clearDebouncer(uri);

    // Set new debounce timer
    const timeoutId = setTimeout(() => {
      this.validateDebouncers.delete(uri);

      const currentDoc = this.documents.get(uri);

      if (currentDoc) {
        this.validate(currentDoc);
      }
    }, VALIDATION_DEBOUNCE_MS);

    this.validateDebouncers.set(uri, timeoutId);
  }

  /**
   * Validate a document using stylelint
   * @param {Object} document - Text document
   * @returns {Promise<void>}
   */
  async validate(document) {
    // Skip node_modules files
    if (this.ignoreNodeModules && this.isNodeModulesPath(document.uri)) {
      this.diagnosticsBatcher.add(document.uri, []);
      this.documentDiagnostics.set(document.uri, {diagnostics: [], ruleMetadata: {}});

      return;
    }

    // Cancel any existing validation for this document
    const existingToken = this.validationTokens.get(document.uri);
    if (existingToken) {
      existingToken.cancelled = true;
    }

    const token = {cancelled: false};
    this.validationTokens.set(document.uri, token);

    try {
      const {options, localNotFound} = await this.buildStylelintOptions(document);

      if (localNotFound) {
        this.connection.console.log(
          'Local stylelint not found, falling back to bundled version.'
        );
        // Remove path so loadStylelint uses the bundled version
        delete options.path;
      }

      // Version tracking (validate-specific)
      const stylelintPath = options.path || null;
      const versionInfo = await this.getVersionInfo(stylelintPath);
      this.detectedStylelintVersion = versionInfo.version;
      this.isUsingLocal = stylelintPath ? versionInfo.isLocal : false;

      // Check if cancelled before proceeding
      if (token.cancelled) {
        return;
      }

      this.safeNotification('stylelint/versionDetected', {
        version: this.detectedStylelintVersion,
        isLocal: this.isUsingLocal,
        isFallback: localNotFound
      });

      const {diagnostics, ruleMetadata} = await stylelintVSCode(document, options);

      // Check if cancelled before sending diagnostics
      if (token.cancelled) {
        return;
      }

      // Apply rule customizations
      const finalDiagnostics = this.applyRuleCustomizations(diagnostics);

      // Use batcher for efficient sending
      this.diagnosticsBatcher.add(document.uri, finalDiagnostics);
      this.documentDiagnostics.set(document.uri, {diagnostics, ruleMetadata});
    }
    catch (err) {
      const message = err?.message || '';
      const isNoConfig =
        message.startsWith('No configuration provided') ||
        message.includes('No rules found within configuration');
      const isConfigError =
        isNoConfig ||
        err.code === STYLELINT_ERROR_CODE_CONFIG ||
        err.name === 'JSONError' ||
        (err.reasons && err.reasons.length > 0);

      if (isConfigError) {
        if (!isNoConfig) {
          this.handleStylelintError(err, 'validation', document.uri);
        }

        if (document.languageId === 'css') {
          try {
            const {options: fallbackOptions} = await this.buildStylelintOptions(document);

            delete fallbackOptions.path;
            fallbackOptions.config = {rules: {}};

            const {diagnostics, ruleMetadata} = await stylelintVSCode(document, fallbackOptions);

            if (!token.cancelled) {
              const finalDiagnostics = this.applyRuleCustomizations(diagnostics);

              this.diagnosticsBatcher.add(document.uri, finalDiagnostics);
              this.documentDiagnostics.set(document.uri, {diagnostics, ruleMetadata});
            }
          }
          catch (_fallbackErr) {
            // Fallback also failed, silently ignore
          }
        }
        else {
          if (!token.cancelled) {
            this.diagnosticsBatcher.add(document.uri, []);
            this.documentDiagnostics.set(document.uri, {diagnostics: [], ruleMetadata: {}});
          }
        }

        return;
      }

      this.handleStylelintError(err, 'validation', document.uri);
    }
    finally {
      if (this.validationTokens.get(document.uri) === token) {
        this.validationTokens.delete(document.uri);
      }
    }
  }

  /**
   * Validate all open documents
   * @returns {Promise<void>}
   */
  async validateAll() {
    this.reportedErrors.clear();

    const documents = this.documents.all();

    const batches = [];
    for (let i = 0; i < documents.length; i += MAX_CONCURRENT_VALIDATIONS) {
      batches.push(documents.slice(i, i + MAX_CONCURRENT_VALIDATIONS));
    }

    for (const batch of batches) {
      await Promise.all(batch.map(doc => this.validate(doc)));
    }
  }

  /**
   * Execute auto-fix for a document
   * @param {string} uri - Document URI
   * @param {Object} [diagnostic=null] - Specific diagnostic to fix
   * @returns {Promise<void>}
   */
  async executeAutofix(uri, diagnostic = null) {
    if (this.ignoreNodeModules && this.isNodeModulesPath(uri)) {
      return;
    }

    const document = this.documents.get(uri);

    if (!document) {
      this.connection.console.log(`Document not found for URI: ${uri}`);

      return;
    }

    try {
      const {options, localNotFound} = await this.buildStylelintOptions(document, {fix: true});

      if (localNotFound) {
        this.connection.console.log(
          'Local stylelint not found, falling back to bundled version for autofix.'
        );
        delete options.path;

        const versionInfo = await this.getVersionInfo(null);

        this.safeNotification('stylelint/versionDetected', {
          version: versionInfo.version,
          isLocal: false,
          isFallback: true
        });
      }

      const originalText = document.getText();

      const {fixedCode} = await stylelintVSCode(document, options);

      if (fixedCode == null || fixedCode === originalText || (fixedCode === '' && originalText !== '')) {
        return;
      }

      let edit;

      if (diagnostic) {
        const allEdits = generateTextEdits(document, originalText, fixedCode);

        const targetEdits = allEdits.filter((editItem) =>
          isRangeOverlap(editItem.range, diagnostic.range, DIAGNOSTIC_OVERLAP_LINE_THRESHOLD, DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD)
        );

        if (targetEdits.length === 0) {
          return;
        }

        edit = {
          changes: {
            [uri]: targetEdits
          }
        };
      }
      else {
        const lines = originalText.split('\n');
        const lastLine = lines.length - 1;
        const lastChar = lines[lastLine].length;

        edit = {
          changes: {
            [uri]: [{
              range: {
                start: {line: 0, character: 0},
                end: {line: lastLine, character: lastChar}
              },
              newText: fixedCode
            }]
          }
        };
      }

      const applyResult = await this.connection.workspace.applyEdit(edit);

      if (!applyResult?.applied) {
        throw new Error('Failed to apply workspace edit');
      }
    }
    catch (err) {
      this.handleStylelintError(err, 'autofix', uri);
    }
  }

  /**
   * Clear the resolution cache, forcing re-lookup of local stylelint and ignorePath
   * on the next validation. Called on config changes and manual refresh.
   */
  clearResolutionCache() {
    this.resolutionCache.clear();
  }

  /**
   * Clear all diagnostics for open documents.
   * Used when switching to onSave/manual mode so stale diagnostics don't linger.
   */
  clearAllDiagnostics() {
    const documents = this.documents.all();

    for (const document of documents) {
      try {
        this.connection.sendDiagnostics({
          uri: document.uri,
          diagnostics: []
        });
      }
      catch {
      }

      this.documentDiagnostics.set(document.uri, {diagnostics: [], ruleMetadata: {}});
    }
  }

  /**
   * Clear diagnostics for files that were linted by lintWorkspace but are not open in the editor.
   * Sends empty diagnostics to the client so they are removed from the Problems panel.
   */
  clearWorkspaceLintDiagnostics() {
    for (const uri of this.workspaceLintUris) {
      try {
        this.connection.sendDiagnostics({uri, diagnostics: []});
      }
      catch {
      }

      this.documentDiagnostics.delete(uri);
    }

    this.workspaceLintUris.clear();
  }

  /**
   * Get auto-fix text edits for a document (used by onWillSaveWaitUntil)
   * @param {Object} document - Text document
   * @returns {Promise<Array>} Array of TextEdits, or empty array if no fixes
   */
  async getAutoFixEdits(document) {
    if (!this.autoFixOnSave) {
      return [];
    }

    if (this.ignoreNodeModules && this.isNodeModulesPath(document.uri)) {
      return [];
    }

    try {
      const {options, localNotFound} = await this.buildStylelintOptions(document, {fix: true});

      if (localNotFound) {
        delete options.path;

        const versionInfo = await this.getVersionInfo(null);

        this.safeNotification('stylelint/versionDetected', {
          version: versionInfo.version,
          isLocal: false,
          isFallback: true
        });
      }

      const {fixedCode} = await stylelintVSCode(document, options);

      const originalText = document.getText();

      if (fixedCode == null || fixedCode === originalText || (fixedCode === '' && originalText !== '')) {
        return [];
      }

      const lines = originalText.split('\n');
      const lastLine = lines.length - 1;
      const lastChar = lines[lastLine].length;

      return [{
        range: {
          start: {line: 0, character: 0},
          end: {line: lastLine, character: lastChar}
        },
        newText: fixedCode
      }];
    }
    catch (err) {
      this.handleStylelintError(err, 'autofix-on-save', document.uri);

      return [];
    }
  }

  /**
   * Handle executeAutofix request with URI validation
   * @param {Object} params - Request params {uri, diagnostic}
   * @returns {Promise<void>}
   */
  async handleAutofixRequest(params) {
    const {uri, diagnostic} = params || {};

    if (!uri || typeof uri !== 'string') {
      const errorMsg = 'Cannot execute autofix: Invalid document reference. Please ensure a valid file is open.';

      this.connection.console.log(`[executeAutofix] ${errorMsg} (received: ${JSON.stringify(uri)})`);
      this.connection.window.showErrorMessage(errorMsg);

      return;
    }

    await this.executeAutofix(uri, diagnostic);
  }

  /**
   * Handle validateNow request — validate a specific document or all
   * @param {Object} params - Request params {uri}
   * @returns {Promise<void>}
   */
  async handleValidateNow(params) {
    const {uri} = params || {};

    if (uri) {
      const document = this.documents.get(uri);

      if (document) {
        await this.validate(document);
      }
    }
    else {
      await this.validateAll();
    }
  }

  /**
   * Handle configuration change — update settings and re-validate or clear
   * @param {Object} params - Configuration change params
   */
  handleConfigurationChange(params) {
    const settings = params?.settings;
    const stylelintSettings = settings?.stylelint || {};

    this.config = stylelintSettings.config;
    this.autoFixOnSave = stylelintSettings.autoFixOnSave;
    this.useLocal = stylelintSettings.useLocal;
    this.disableErrorMessage = stylelintSettings.disableErrorMessage;
    this.runMode = stylelintSettings.run || 'onType';
    this.configFile = stylelintSettings.configFile || '';
    this.ignorePath = stylelintSettings.ignorePath || '';
    this.ignoreNodeModules = stylelintSettings.ignoreNodeModules !== false;
    this.ruleCustomizations = Array.isArray(stylelintSettings.rules?.customizations)
      ? stylelintSettings.rules.customizations
      : [];
    this.disableRuleCommentLocation =
      stylelintSettings.codeAction?.disableRuleComment?.location || 'separateLine';

    this.clearResolutionCache();

    // On first config push, always validate if runMode allows (fixes startup with correct runMode).
    // On subsequent changes, re-validate or clear as appropriate.
    if (!this._initialConfigReceived) {
      this._initialConfigReceived = true;

      if (this.runMode === 'onType') {
        this.validateAll();
      }
    }
    else if (this.runMode === 'onType') {
      this.validateAll();
    }
    else {
      this.clearAllDiagnostics();
    }
  }

  /**
   * Lint all matching files in the workspace
   * @param {Object} [params] - Request params (may include custom extensions list)
   * @returns {Promise<{filesScanned: number, totalFiles: number}>}
   */
  async lintWorkspace(params) {
    this.clearWorkspaceLintDiagnostics();

    const folders = await this.getWorkspaceFolders();

    if (!folders || folders.length === 0) {
      return {filesScanned: 0};
    }

    const extensions = params?.extensions || [
      '.css', '.scss', '.less', '.sass', '.sss',
      '.vue', '.svelte', '.html', '.xml', '.xsl',
      '.md', '.markdown'
    ];

    const files = new Set();
    const visitedDirs = new Set();

    async function walkDir(dir) {
      if (visitedDirs.has(dir)) {
        return;
      }
      visitedDirs.add(dir);

      let entries;

      try {
        entries = await fsPromises.readdir(dir, {withFileTypes: true});
      }
      catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' ||
              entry.name === 'dist' || entry.name === 'build' ||
              entry.name === 'coverage' || entry.name === '.next' ||
              entry.name === '.nuxt') {
            continue;
          }

          await walkDir(fullPath);
        }
        else if (entry.isFile()) {
          const ext = fullPath.substring(fullPath.lastIndexOf('.'));

          if (extensions.includes(ext)) {
            files.add(fullPath);
          }
        }
      }
    }

    for (const folder of folders) {
      const rootPath = parseUri(folder.uri).fsPath;
      await walkDir(rootPath);
    }

    const uniqueFiles = [...files];
    let scanned = 0;

    for (let i = 0; i < uniqueFiles.length; i += MAX_CONCURRENT_VALIDATIONS) {
      const batch = uniqueFiles.slice(i, i + MAX_CONCURRENT_VALIDATIONS);

      await Promise.all(batch.map(async (filePath) => {
        try {
          const uri = parseUri(pathToFileURL(filePath).href).toString();
          const openDoc = this.documents.get(uri);
          let doc;

          if (openDoc) {
            doc = openDoc;
          }
          else {
            const content = await fsPromises.readFile(filePath, 'utf8');

            if (content.length > MAX_FILE_SIZE) {
              return;
            }

            const ext = filePath.substring(filePath.lastIndexOf('.'));
            const langMap = {
              '.css': 'css', '.scss': 'scss', '.less': 'less',
              '.sass': 'sass', '.sss': 'sugarss', '.vue': 'vue',
              '.svelte': 'svelte', '.html': 'html', '.xml': 'xml',
              '.xsl': 'xsl', '.md': 'markdown', '.markdown': 'markdown'
            };
            const languageId = langMap[ext] || 'css';

            doc = TextDocument.create(uri, languageId, 1, content);
          }

          const {options, localNotFound} = await this.buildStylelintOptions(doc);

          if (localNotFound) {
            delete options.path;
          }

          const {diagnostics, ruleMetadata} = await stylelintVSCode(doc, options);
          const finalDiagnostics = this.applyRuleCustomizations(diagnostics);

          // Cancel any in-flight real-time validation for this URI
          const existingToken = this.validationTokens.get(uri);

          if (existingToken) {
            existingToken.cancelled = true;
          }

          // Use batcher for consistent sending (matches validate() behavior)
          this.diagnosticsBatcher.add(uri, finalDiagnostics);

          // Store original diagnostics (before customization) for consistent code action behavior
          this.documentDiagnostics.set(uri, {diagnostics, ruleMetadata});

          // Track URIs for files not open in editor so we can clear them later
          if (!this.documents.get(uri)) {
            this.workspaceLintUris.add(uri);
          }

          scanned++;
        }
        catch (_err) {
          // Skip files that fail to lint
        }
      }));

      this.safeNotification('stylelint/lintProgress', {
        current: Math.min(i + MAX_CONCURRENT_VALIDATIONS, uniqueFiles.length),
        total: uniqueFiles.length
      });
    }

    return {filesScanned: scanned, totalFiles: uniqueFiles.length};
  }

  /**
   * Build code actions for stylelint diagnostics
   * @param {Object} params - Code action request params
   * @returns {Array} Code actions
   */
  getCodeActions(params) {
    const {textDocument, context} = params || {};

    if (!textDocument || !context) {
      return [];
    }

    const diagnostics = context.diagnostics || [];
    const codeActions = [];

    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');

    if (stylelintDiagnostics.length === 0) {
      return [];
    }

    const { ruleMetadata = {} } = this.documentDiagnostics.get(textDocument.uri) || {};
    const document = this.documents.get(textDocument.uri);

    // Quick fix actions for fixable diagnostics
    const fixableDiagnostics = stylelintDiagnostics.filter(diagnostic => {
      const rule = diagnostic.code;

      if (rule && ruleMetadata[rule]) {
        return ruleMetadata[rule].fixable === true;
      }
      else {
        return false;
      }
    });

    for (const diagnostic of fixableDiagnostics) {
      codeActions.push({
        title: `Fix: ${diagnostic.message}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: {
          command: 'stylelint.executeAutofix',
          title: 'Fix this stylelint problem',
          arguments: [textDocument.uri, diagnostic]
        }
      });
    }

    // Disable rule comment actions for all stylelint diagnostics with a rule code
    for (const diagnostic of stylelintDiagnostics) {
      const rule = diagnostic.code;

      if (!rule || typeof rule !== 'string') {
        continue;
      }

      if (!document) {
        continue;
      }

      const line = diagnostic.range.start.line;

      let codeActionEdit;

      if (this.disableRuleCommentLocation === 'sameLine') {
        const lineText = document.getText({
          start: {line, character: 0},
          end: {line, character: Number.MAX_SAFE_INTEGER}
        });
        const lineEnd = lineText.length;

        codeActionEdit = {
          changes: {
            [textDocument.uri]: [{
              range: {
                start: {line, character: lineEnd},
                end: {line, character: lineEnd}
              },
              newText: ` /* stylelint-disable-line ${rule} */`
            }]
          }
        };
      }
      else {
        const lineText = document.getText({
          start: {line, character: 0},
          end: {line, character: Number.MAX_SAFE_INTEGER}
        });

        const indent = lineText.match(/^(\s*)/)[1];

        codeActionEdit = {
          changes: {
            [textDocument.uri]: [{
              range: {
                start: {line, character: 0},
                end: {line, character: 0}
              },
              newText: `${indent}/* stylelint-disable-next-line ${rule} */\n`
            }]
          }
        };
      }

      codeActions.push({
        title: `Disable ${rule} for this line`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: codeActionEdit
      });
    }

    return codeActions;
  }

  /**
   * Dispose and clean up all resources
   */
  dispose() {
    for (const timeoutId of this.validateDebouncers.values()) {
      clearTimeout(timeoutId);
    }

    this.validateDebouncers.clear();
    this.validationTokens.clear();
    this.clearWorkspaceLintDiagnostics();
    this.documentDiagnostics.dispose();
    this.diagnosticsBatcher.dispose();
    this.versionCache.clear();
    this.resolutionCache.clear();
    this.workspaceCache = null;
    this.workspaceCacheTime = 0;
    this.reportedErrors.clear();

    if (this.boundUnhandledRejection) {
      process.removeListener('unhandledRejection', this.boundUnhandledRejection);
    }

    if (this.boundUncaughtException) {
      process.removeListener('uncaughtException', this.boundUncaughtException);
    }
  }
}

module.exports = StylelintServer;
