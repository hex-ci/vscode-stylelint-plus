'use strict';

const fsPromises = require('fs').promises;
const {
  join,
  parse,
  resolve,
  dirname
} = require('path');
const {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  CodeActionKind
} = require('vscode-languageserver');
const findPkgDir = require('find-pkg-dir');
const parseUri = require('vscode-uri').URI.parse;
const stylelintVSCode = require('./stylelint-vscode');
const loadStylelint = require('./load-stylelint');
const { isRangeOverlap, generateTextEdits, generateTempFilename, getExtensionFromLanguageId } = require('./utils');
const LRUCache = require('./lru-cache');
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
  TEMP_FILE_MAX_RETRIES,
  TEMP_FILE_RETRY_DELAY_MS
} = require('./constants');

/**
 * Stylelint Language Server
 * Provides linting and auto-fix capabilities for CSS/SCSS/Less files
 */
class StylelintServer {
  /**
   * Create a new StylelintServer instance
   * @param {Object} connection - VSCode language server connection
   * @param {TextDocuments} documents - Text documents manager
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

    // State
    this.detectedStylelintVersion = null;
    this.isUsingLocal = false;
    this.isShuttingDown = false;

    // Caches
    this.versionCache = new LRUCache(MAX_VERSION_CACHE_SIZE);
    this.workspaceCache = null;
    this.workspaceCacheTime = 0;

    // Validation tokens for cancellation
    this.validationTokens = new Map();

    // Debounced validation timers
    this.validateDebouncers = new Map();

    // Failed temp file cleanup list
    this.failedTempFiles = [];

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
   */
  handleStylelintError(err, context) {
    const stack = err?.stack || String(err);

    this.connection.console.log(`stylelint ${context} error: ${stack}`);
    this.safeNotification('setStatusBarError');

    if (this.disableErrorMessage) {
      return;
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
   * Get workspace folder for a document
   * @param {string} documentUri - Document URI
   * @param {Array} folders - Workspace folders
   * @returns {Object|undefined} Workspace folder or undefined
   */
  getWorkspaceForDocument(documentUri, folders) {
    if (!folders) {
      return undefined;
    }

    const docUri = parseUri(documentUri);
    const docUriStr = docUri.toString();

    return folders
      .filter(folder => {
        const folderUriStr = parseUri(folder.uri).toString();
        // Ensure folder URI ends with / for proper prefix matching
        const folderPrefix = folderUriStr.endsWith('/') ? folderUriStr : folderUriStr + '/';

        return docUriStr === folderUriStr || docUriStr.startsWith(folderPrefix);
      })
      .sort((a, b) => b.uri.length - a.uri.length)[0];
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
        const bundledPkg = require('../package.json');
        version = bundledPkg.dependencies.stylelint.replace(/[\^~]/, '');
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
   * Resolve stylelint options for a document
   * @param {string} documentUri - Document URI
   * @returns {Promise<Object>} Stylelint options
   */
  async resolveStylelintOptions(documentUri) {
    let stopPath = null;
    const documentPath = parseUri(documentUri).fsPath;

    const folders = await this.getWorkspaceFolders();

    const workspace = this.getWorkspaceForDocument(documentUri, folders);

    if (workspace) {
      stopPath = parseUri(workspace.uri).fsPath;
    }

    if (!stopPath) {
      stopPath = findPkgDir(documentPath) || parse(documentPath).root;
    }

    const normalizedStopPath = stopPath.replace(/[\/\\]+$/, '');
    const normalizedDocDir = parse(documentPath).dir.replace(/[\/\\]+$/, '');

    // Look for closest .stylelintignore up to stopPath
    let dir = normalizedDocDir;
    let ignorePath = join(normalizedStopPath, '.stylelintignore');

    while (dir && dir !== normalizedStopPath) {
      const candidate = join(dir, '.stylelintignore');

      try {
        await fsPromises.access(candidate);
        ignorePath = candidate;
        break;
      }
      catch {
        // File doesn't exist, continue to parent
      }

      const parentDir = parse(dir).dir;

      if (parentDir === dir) {
        break;
      }

      dir = parentDir;
    }

    const result = {ignorePath};

    if (this.useLocal) {
      let localDir;
      let startDir = documentPath;

      while ((localDir = findPkgDir(startDir))) {
        const localPath = join(localDir, 'node_modules', 'stylelint');

        try {
          await fsPromises.access(localPath);
          result.path = localPath;
          break;
        }
        catch {
          // Path doesn't exist, continue to parent
        }

        /* istanbul ignore next */
        startDir = resolve(localDir, '..');
      }
    }

    return result;
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
   * @param {boolean} [isAutoFixOnSave=false] - Whether this is auto-fix on save
   */
  validateDebounced(document, isAutoFixOnSave = false) {
    const uri = document.uri;

    // Clear existing debounce timer
    this.clearDebouncer(uri);

    // Set new debounce timer
    const timeoutId = setTimeout(() => {
      this.validateDebouncers.delete(uri);

      const currentDoc = this.documents.get(uri);

      if (currentDoc) {
        this.validate(currentDoc, isAutoFixOnSave);
      }
    }, VALIDATION_DEBOUNCE_MS);

    this.validateDebouncers.set(uri, timeoutId);
  }

  /**
   * Validate a document using stylelint
   * @param {Object} document - Text document
   * @param {boolean} [isAutoFixOnSave=false] - Whether this is auto-fix on save
   * @returns {Promise<void>}
   */
  async validate(document, isAutoFixOnSave = false) {
    // Cancel any existing validation for this document
    const existingToken = this.validationTokens.get(document.uri);
    if (existingToken) {
      existingToken.cancelled = true;
    }

    const token = {cancelled: false};
    this.validationTokens.set(document.uri, token);

    try {
      const options = {
        fix: isAutoFixOnSave
      };

      if (this.config) {
        options.config = this.config;
      }

      const documentPath = parseUri(document.uri).fsPath;
      const isAbsolutePath = documentPath && require('path').isAbsolute(documentPath);

      if (isAbsolutePath) {
        const folders = await this.getWorkspaceFolders();

        const workspace = this.getWorkspaceForDocument(document.uri, folders);

        if (workspace) {
          options.cwd = parseUri(workspace.uri).fsPath;
        }
        else {
          options.cwd = dirname(documentPath);
        }

        const {ignorePath, path: stylelintPath} = await this.resolveStylelintOptions(document.uri);

        options.ignorePath = ignorePath;

        if (this.useLocal) {
          if (!stylelintPath) {
            this.connection.console.log('Local stylelint not found.');
            this.safeNotification('setStatusBarError');

            return;
          }

          options.path = stylelintPath;

          const versionInfo = await this.getVersionInfo(stylelintPath);
          this.detectedStylelintVersion = versionInfo.version;
          this.isUsingLocal = versionInfo.isLocal;
        }
        else {
          this.safeNotification('setStatusBarOk');
          const versionInfo = await this.getVersionInfo(null);
          this.detectedStylelintVersion = versionInfo.version;
          this.isUsingLocal = versionInfo.isLocal;
        }
      }
      else {
        // Untitled document: try to use workspace as cwd for config lookup
        const folders = await this.getWorkspaceFolders();

        if (folders && folders.length > 0) {
          options.cwd = parseUri(folders[0].uri).fsPath;

          if (this.useLocal) {
            const localPath = join(options.cwd, 'node_modules', 'stylelint');

            try {
              await fsPromises.access(localPath);
              options.path = localPath;

              const versionInfo = await this.getVersionInfo(localPath);
              this.detectedStylelintVersion = versionInfo.version;
              this.isUsingLocal = true;
            }
            catch {
              const versionInfo = await this.getVersionInfo(null);
              this.detectedStylelintVersion = versionInfo.version;
              this.isUsingLocal = false;
            }
          }
          else {
            const versionInfo = await this.getVersionInfo(null);
            this.detectedStylelintVersion = versionInfo.version;
            this.isUsingLocal = false;
          }
        }
        else {
          // No workspace: use bundled stylelint
          const versionInfo = await this.getVersionInfo(null);
          this.detectedStylelintVersion = versionInfo.version;
          this.isUsingLocal = false;
        }

        this.safeNotification('setStatusBarOk');
      }

      // Check if cancelled before proceeding
      if (token.cancelled) {
        return;
      }

      this.safeNotification('stylelint/versionDetected', {
        version: this.detectedStylelintVersion,
        isLocal: this.isUsingLocal
      });

      const {diagnostics, ruleMetadata} = await stylelintVSCode(document, options);

      // Check if cancelled before sending diagnostics
      if (token.cancelled) {
        return;
      }

      // Use batcher for efficient sending
      this.diagnosticsBatcher.add(document.uri, diagnostics);
      this.documentDiagnostics.set(document.uri, {diagnostics, ruleMetadata});

      this.safeNotification('setStatusBarOk');
    }
    catch (err) {
      this.handleStylelintError(err, 'validation');
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
    const documents = this.documents.all();

    // Process in batches to limit concurrency
    const batches = [];
    for (let i = 0; i < documents.length; i += MAX_CONCURRENT_VALIDATIONS) {
      batches.push(documents.slice(i, i + MAX_CONCURRENT_VALIDATIONS));
    }

    for (const batch of batches) {
      await Promise.all(batch.map(doc => this.validate(doc)));
    }
  }

  /**
   * Safely unlink a file with retry logic
   * @param {string} filePath - Path to file
   * @param {number} [maxRetries=3] - Maximum retry attempts
   * @returns {Promise<boolean>} Whether deletion succeeded
   * @private
   */
  async safeUnlink(filePath, maxRetries = TEMP_FILE_MAX_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fsPromises.unlink(filePath);
        return true;
      }
      catch (err) {
        if (i === maxRetries - 1) {
          this.connection.console.log(`Failed to delete temp file ${filePath} after ${maxRetries} attempts: ${err?.message || String(err)}`);
          this.failedTempFiles.push(filePath);
          return false;
        }
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, TEMP_FILE_RETRY_DELAY_MS * (i + 1)));
      }
    }

    return false;
  }

  /**
   * Retry cleanup of previously failed temp files
   * @private
   */
  async retryFailedTempFiles() {
    const files = this.failedTempFiles.splice(0);
    for (const file of files) {
      try {
        await fsPromises.unlink(file);
      }
      catch {
        // Still failed, will be cleaned up on next dispose
      }
    }
  }

  /**
   * Execute auto-fix for a document
   * @param {string} uri - Document URI
   * @param {Object} [diagnostic=null] - Specific diagnostic to fix
   * @returns {Promise<void>}
   */
  async executeAutofix(uri, diagnostic = null) {
    const document = this.documents.get(uri);

    if (!document) {
      this.connection.console.log(`Document not found for URI: ${uri}`);

      return;
    }

    try {
      const documentPath = parseUri(document.uri).fsPath;
      const isAbsolutePath = documentPath && require('path').isAbsolute(documentPath);
      const options = {};

      if (this.config) {
        options.config = this.config;
      }

      if (isAbsolutePath) {
        const {ignorePath, path: stylelintPath} = await this.resolveStylelintOptions(document.uri);

        options.ignorePath = ignorePath;

        if (this.useLocal) {
          if (!stylelintPath) {
            this.connection.console.log('Local stylelint not found.');
            this.safeNotification('setStatusBarError');

            return;
          }
          options.path = stylelintPath;
        }
      }
      else {
        // Untitled document: try to use workspace for config lookup and local stylelint
        const folders = await this.getWorkspaceFolders();

        if (folders && folders.length > 0) {
          options.cwd = parseUri(folders[0].uri).fsPath;

          if (this.useLocal) {
            const localPath = join(options.cwd, 'node_modules', 'stylelint');

            try {
              await fsPromises.access(localPath);
              options.path = localPath;
            }
            catch {
              // Local stylelint not found, use bundled
            }
          }
        }
      }

      const originalText = document.getText();

      const stylelintModule = await loadStylelint(options.path, {fallbackToBundled: true});
      const {lint} = stylelintModule;

      // Generate temp file path
      let tempFile;

      if (isAbsolutePath) {
        tempFile = generateTempFilename(documentPath);
      }
      else {
        // Untitled document: use workspace or system temp directory
        const folders = await this.getWorkspaceFolders();
        const baseDir = (folders && folders.length > 0)
          ? parseUri(folders[0].uri).fsPath
          : require('os').tmpdir();
        const ext = getExtensionFromLanguageId(document.languageId);

        tempFile = generateTempFilename(join(baseDir, `untitled${ext}`));
      }

      let output;

      try {
        await fsPromises.writeFile(tempFile, originalText, 'utf8');

        const fixOptions = {
          ...options,
          files: [tempFile],
          fix: true,
          quietDeprecationWarnings: true
        };

        delete fixOptions.path;
        delete fixOptions.code;
        delete fixOptions.codeFilename;

        await lint(fixOptions);

        output = await fsPromises.readFile(tempFile, 'utf8');
      }
      catch (err) {
        this.connection.console.log(`Temp file strategy failed: ${err?.message || String(err)}`);
        throw err;
      }
      finally {
        await this.safeUnlink(tempFile);
      }

      if (!output) {
        return;
      }

      if (output === originalText) {
        return;
      }

      let edit;

      if (diagnostic) {
        const allEdits = generateTextEdits(document, originalText, output);

        const targetEdits = allEdits.filter((editItem) =>
          isRangeOverlap(editItem.range, diagnostic.range, DIAGNOSTIC_OVERLAP_LINE_THRESHOLD, DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD)
        );

        if (targetEdits.length === 0) {
          // No edits found for this specific diagnostic, skip
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
              newText: output
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
      this.handleStylelintError(err, 'autofix');
    }
  }

  /**
   * Dispose and clean up all resources
   */
  dispose() {
    // Clear all debounce timers
    for (const timeoutId of this.validateDebouncers.values()) {
      clearTimeout(timeoutId);
    }
    this.validateDebouncers.clear();

    // Clear validation tokens
    this.validationTokens.clear();

    // Dispose managers
    this.documentDiagnostics.dispose();
    this.diagnosticsBatcher.dispose();

    // Clear caches
    this.versionCache.clear();
    this.workspaceCache = null;
    this.workspaceCacheTime = 0;

    // Remove global error handlers
    if (this.boundUnhandledRejection) {
      process.removeListener('unhandledRejection', this.boundUnhandledRejection);
    }
    if (this.boundUncaughtException) {
      process.removeListener('uncaughtException', this.boundUncaughtException);
    }

    // Final cleanup of failed temp files
    this.retryFailedTempFiles();
  }
}

/**
 * Start the language server
 * @returns {StylelintServer} The server instance
 */
function startServer() {
  // Create connection and documents
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments();
  const server = new StylelintServer(connection, documents);

  // Code action handler
  connection.onCodeAction(async (params) => {
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

    const { ruleMetadata = {} } = server.documentDiagnostics.get(textDocument.uri) || {};

    const fixableDiagnostics = stylelintDiagnostics.filter(diagnostic => {
      const rule = diagnostic.code;

      if (rule && ruleMetadata[rule]) {
        return ruleMetadata[rule].fixable === true;
      }
      else {
        return false;
      }
    });

    if (fixableDiagnostics.length === 0) {
      return [];
    }

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

    return codeActions;
  });

  // Execute autofix handler
  connection.onRequest('stylelint/executeAutofix', async (params) => {
    const {uri, diagnostic} = params || {};

    if (!uri || typeof uri !== 'string') {
      const errorMsg = 'Cannot execute autofix: Invalid document reference. Please ensure a valid file is open.';

      connection.console.log(`[executeAutofix] ${errorMsg} (received: ${JSON.stringify(uri)})`);
      connection.window.showErrorMessage(errorMsg);

      return;
    }

    await server.executeAutofix(uri, diagnostic);
  });

  // Initialize handler
  connection.onInitialize(() => {
    server.validateAll();

    return {
      capabilities: {
        textDocumentSync: documents.syncKind,
        codeActionProvider: true
      }
    };
  });

  // Configuration change handler
  connection.onDidChangeConfiguration((params) => {
    const settings = params?.settings;
    const stylelintSettings = settings?.stylelint || {};

    server.config = stylelintSettings.config;
    server.autoFixOnSave = stylelintSettings.autoFixOnSave;
    server.useLocal = stylelintSettings.useLocal;
    server.disableErrorMessage = stylelintSettings.disableErrorMessage;

    server.validateAll();
  });

  // Watched files change handler
  connection.onDidChangeWatchedFiles(() => {
    server.validateAll();
  });

  // Shutdown handler
  connection.onShutdown(() => {
    server.isShuttingDown = true;
    server.dispose();
  });

  // Document change handler with debouncing
  documents.onDidChangeContent(({document}) => {
    server.validateDebounced(document);
  });

  // Document close handler
  documents.onDidClose(({document}) => {
    // Clear debouncer for closed document
    server.clearDebouncer(document.uri);

    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: []
    });
    server.documentDiagnostics.delete(document.uri);
  });

  // Document save handler
  documents.onDidSave(({document}) => {
    if (server.autoFixOnSave) {
      server.clearDebouncer(document.uri);
      server.validate(document, true);
    }
  });

  // Start listening
  documents.listen(connection);
  connection.listen();

  return server;
}

// Only start the server if this file is being run directly (not required as a module)
if (require.main === module) {
  /* istanbul ignore next */
  startServer();
}

// Export for testing
module.exports = {StylelintServer, startServer};
