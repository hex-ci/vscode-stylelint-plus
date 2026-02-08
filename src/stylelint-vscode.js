'use strict';

const path = require('path');
const arrayToError = require('array-to-error');
const isPlainObject = require('lodash/isPlainObject');
const map = require('lodash/map');
const stubString = require('lodash/stubString');
const {TextDocument} = require('vscode-languageserver');
const inspectWithKind = require('inspect-with-kind');
const parseUri = require('vscode-uri').URI.parse;
const stylelintWarningToVscodeDiagnostic = require('./diagnostic');
const loadStylelint = require('./load-stylelint');
const { MAX_FILE_SIZE } = require('./constants');

module.exports = async function stylelintVSCode(textDocument, options = {}) {
  if (!TextDocument.is(textDocument)) {
    throw new TypeError(`Expected a TextDocument https://code.visualstudio.com/docs/extensionAPI/vscode-api#TextDocument, but got ${
      inspectWithKind(textDocument)
    }.`);
  }

  if (!isPlainObject(options)) {
    throw new TypeError(`Expected an object containing stylelint API options, but got ${
      inspectWithKind(options)
    }.`);
  }

  // Skip validation for files exceeding size limit
  const text = textDocument.getText();

  if (text.length > MAX_FILE_SIZE) {
    return { diagnostics: [], ruleMetadata: {}, fixedCode: null };
  }

  const priorOptions = {
    formatter: stubString,
    code: text
  };
  const codeFilename = parseUri(textDocument.uri).fsPath;
  const isAbsolutePath = codeFilename && path.isAbsolute(codeFilename);

  if (isAbsolutePath) {
    priorOptions.codeFilename = codeFilename;
  }

  const stylelintModule = await loadStylelint(options.path);
  const { lint } = stylelintModule;

  const lintResult = await lint({
    ...options,
    ...priorOptions,
    quietDeprecationWarnings: true
  });

  // Extract results
  const results = (lintResult && Array.isArray(lintResult.results))
    ? lintResult.results
    : [];
  const firstResult = results[0];
  const ruleMetadata = (lintResult && lintResult.ruleMetadata)
    ? lintResult.ruleMetadata
    : (firstResult && firstResult._postcssResult && firstResult._postcssResult.stylelint
      ? firstResult._postcssResult.stylelint.ruleMetadata
      : null);

  // Extract fixed code when fix mode is active
  // - v16+: result.code contains the fixed code
  // - v14/v15: result.output is overwritten with fixed code by standalone.js
  // - || null handles v14/v15 no-fix case where output is "" (empty string from stubString formatter)
  let fixedCode = null;

  if (options.fix && lintResult) {
    fixedCode = lintResult.code ?? (lintResult.output || null);
  }

  if (results.length === 0) {
    return {
      diagnostics: [],
      ruleMetadata: {},
      fixedCode
    };
  }

  const [{invalidOptionWarnings = [], warnings = []}] = results;

  if (invalidOptionWarnings.length !== 0) {
    throw arrayToError(map(invalidOptionWarnings, 'text'), SyntaxError);
  }

  return {
    diagnostics: warnings.map(stylelintWarningToVscodeDiagnostic),
    ruleMetadata: ruleMetadata || {},
    fixedCode
  };
};
