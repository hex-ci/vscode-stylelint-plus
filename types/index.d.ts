/**
 * Type definitions for vscode-stylelint-plus
 */

import { TextDocument, Diagnostic, Range, Position } from 'vscode-languageserver-types';

export interface StylelintOptions {
  /** Whether to apply auto-fixes */
  fix?: boolean;
  /** Stylelint configuration object */
  config?: Record<string, unknown>;
  /** Configuration overrides */
  configOverrides?: Record<string, unknown>;
  /** Current working directory */
  cwd?: string;
  /** Path to ignore file */
  ignorePath?: string;
  /** Path to stylelint module */
  path?: string;
  /** Code to lint */
  code?: string;
  /** Filename for code */
  codeFilename?: string;
  /** Files to lint */
  files?: string[];
  /** Allow empty input */
  allowEmptyInput?: boolean;
  /** Syntax type */
  syntax?: string;
  /** Suppress deprecation warnings */
  quietDeprecationWarnings?: boolean;
}

export interface StylelintWarning {
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Rule name */
  rule: string;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Warning message */
  text: string;
}

export interface StylelintResult {
  /** Array of results */
  results: Array<{
    /** Invalid option warnings */
    invalidOptionWarnings: Array<{ text: string }>;
    /** Stylelint warnings */
    warnings: StylelintWarning[];
  }>;
}

export interface VersionInfo {
  /** Stylelint version */
  version: string;
  /** Whether using local stylelint */
  isLocal: boolean;
}

export interface WorkspaceFolder {
  /** Workspace URI */
  uri: string;
  /** Workspace name */
  name: string;
}

/**
 * Run stylelint on a text document
 * @param textDocument - The document to lint
 * @param options - Stylelint options
 * @returns Promise resolving to array of diagnostics
 */
export function stylelintVSCode(
  textDocument: TextDocument,
  options?: StylelintOptions
): Promise<Diagnostic[]>;

/**
 * Load stylelint module from specified path or bundled version
 * @param modulePath - Path to stylelint module
 * @param options - Loading options
 * @returns Promise resolving to stylelint module
 */
export function loadStylelint(
  modulePath?: string,
  options?: { fallbackToBundled?: boolean }
): Promise<{ lint: (options: StylelintOptions) => Promise<StylelintResult> }>;

/**
 * Convert stylelint warning to VSCode diagnostic
 * @param warning - Stylelint warning object
 * @returns VSCode diagnostic
 */
export function stylelintWarningToVscodeDiagnostic(warning: StylelintWarning): Diagnostic;

/**
 * Check if two ranges overlap
 * @param r1 - First range
 * @param r2 - Second range
 * @param lineThreshold - Line threshold for overlap
 * @param charThreshold - Character threshold for overlap
 * @returns Whether ranges overlap
 */
export function isRangeOverlap(
  r1: Range,
  r2: Range,
  lineThreshold?: number,
  charThreshold?: number
): boolean;

/**
 * Generate text edits from original to fixed text
 * @param document - Text document
 * @param originalText - Original text
 * @param fixedText - Fixed text
 * @returns Array of text edits
 */
export function generateTextEdits(
  document: TextDocument,
  originalText: string,
  fixedText: string
): Array<{ range: Range; newText: string }>;

/**
 * Generate temporary filename for auto-fix
 * @param originalPath - Original file path
 * @returns Temporary filename
 */
export function generateTempFilename(originalPath: string): string;

/**
 * LRU Cache implementation
 */
export class LRUCache<T> {
  constructor(maxSize: number);
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
}

/**
 * Document diagnostics manager with automatic cleanup
 */
export class DocumentDiagnosticsManager {
  constructor();
  set(uri: string, diagnostics: Diagnostic[]): void;
  get(uri: string): Diagnostic[] | undefined;
  has(uri: string): boolean;
  delete(uri: string): boolean;
  keys(): IterableIterator<string>;
  dispose(): void;
}

/**
 * Diagnostics batcher for efficient batch sending
 */
export class DiagnosticsBatcher {
  constructor(connection: any, batchInterval?: number);
  add(uri: string, diagnostics: Diagnostic[]): void;
  flush(): void;
  dispose(): void;
}

/**
 * Stylelint Language Server
 */
export class StylelintServer {
  constructor(connection: any, documents: any);

  /** Document diagnostics manager */
  readonly documentDiagnostics: DocumentDiagnosticsManager;
  /** Diagnostics batcher */
  readonly diagnosticsBatcher: DiagnosticsBatcher;

  /** Configuration */
  config: Record<string, unknown> | null;
  configOverrides: Record<string, unknown> | null;
  autoFixOnSave: boolean;
  useLocal: boolean;
  disableErrorMessage: boolean;

  /** State */
  detectedStylelintVersion: string | null;
  isUsingLocal: boolean;
  isShuttingDown: boolean;

  /** Get workspace folder for a document */
  getWorkspaceForDocument(documentUri: string, folders: WorkspaceFolder[]): WorkspaceFolder | undefined;

  /** Get workspace folders with caching */
  getWorkspaceFolders(): Promise<WorkspaceFolder[]>;

  /** Get version info for stylelint */
  getVersionInfo(stylelintPath?: string): Promise<VersionInfo>;

  /** Resolve stylelint options for a document */
  resolveStylelintOptions(documentUri: string): Promise<{ ignorePath: string; path?: string }>;

  /** Clear debounce timer for a document */
  clearDebouncer(uri: string): void;

  /** Validate a document with debouncing */
  validateDebounced(document: TextDocument, isAutoFixOnSave?: boolean): void;

  /** Validate a document */
  validate(document: TextDocument, isAutoFixOnSave?: boolean): Promise<void>;

  /** Validate all open documents */
  validateAll(): Promise<void>;

  /** Execute auto-fix for a document */
  executeAutofix(uri: string, diagnostic?: Diagnostic): Promise<void>;

  /** Dispose and clean up resources */
  dispose(): void;
}

/**
 * Constants
 */
export const constants: {
  STYLELINT_ERROR_CODE_CONFIG: number;
  DIAGNOSTIC_OVERLAP_LINE_THRESHOLD: number;
  DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD: number;
  VERSION_CACHE_TTL: number;
  WORKSPACE_CACHE_TTL: number;
  VALIDATION_DEBOUNCE_MS: number;
  MAX_CONCURRENT_VALIDATIONS: number;
  MAX_VERSION_CACHE_SIZE: number;
  DIAGNOSTICS_CLEANUP_INTERVAL_MS: number;
  DIAGNOSTICS_MAX_AGE_MS: number;
  TEMP_FILE_MAX_RETRIES: number;
  TEMP_FILE_RETRY_DELAY_MS: number;
  BATCH_DIAGNOSTICS_INTERVAL_MS: number;
};
