'use strict';

const arrayToError = require('array-to-error');
const {at, has, isPlainObject, map, stubString} = require('lodash');
const {TextDocument} = require('vscode-languageserver');
const inspectWithKind = require('inspect-with-kind');
const parseUri = require('vscode-uri').URI.parse;
const stylelintWarningToVscodeDiagnostic = require('./diagnostic');
const loadStylelint = require('./load-stylelint');

// https://github.com/stylelint/stylelint/blob/10.0.1/lib/getPostcssResult.js#L69-L81
const SUPPORTED_SYNTAXES = new Set([
  'css-in-js',
  'html',
  'less',
  'markdown',
  'sass',
  'scss',
  'sugarss'
]);

const LANGUAGE_EXTENSION_EXCEPTION_PAIRS = new Map([
  ['javascript', 'css-in-js'],
  ['javascriptreact', 'css-in-js'],
  ['source.css.styled', 'css-in-js'],
  ['source.markdown.math', 'markdown'],
  ['styled-css', 'css-in-js'],
  ['svelte', 'html'],
  ['typescript', 'css-in-js'],
  ['typescriptreact', 'css-in-js'],
  ['vue-html', 'html'],
  ['xml', 'html'],
  ['xsl', 'html']
]);

function processResults({results}) {
  // https://github.com/stylelint/stylelint/blob/10.0.1/lib/standalone.js#L114-L122
  if (results.length === 0) {
    return [];
  }

  const [{invalidOptionWarnings, warnings}] = results;

  if (invalidOptionWarnings.length !== 0) {
    throw arrayToError(map(invalidOptionWarnings, 'text'), SyntaxError);
  }

  return warnings.map(stylelintWarningToVscodeDiagnostic);
}

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

  const priorOptions = {
    formatter: stubString
  };
  const codeFilename = parseUri(textDocument.uri).fsPath;
  let resultContainer;

  if (codeFilename) {
    if (options.fix) {
      priorOptions.files = [codeFilename];
      priorOptions.allowEmptyInput = true;
    }
    else {
      priorOptions.code = textDocument.getText();
      priorOptions.codeFilename = codeFilename;
    }
  }
  else {
    priorOptions.code = textDocument.getText();

    if (!has(options, 'syntax')) {
      if (SUPPORTED_SYNTAXES.has(textDocument.languageId)) {
        priorOptions.syntax = textDocument.languageId;
      }
      else {
        const syntax = LANGUAGE_EXTENSION_EXCEPTION_PAIRS.get(textDocument.languageId);

        if (syntax) {
          priorOptions.syntax = syntax;
        }
      }
    }

    if (!at(options, 'config.rules')[0]) {
      priorOptions.config = {rules: {}};
    }
  }

  const stylelintModule = await loadStylelint(options.path);
  const { lint } = stylelintModule;

  try {
    resultContainer = await lint({
      ...options,
      ...priorOptions,
      quietDeprecationWarnings: true
    });
  }
  catch (err) {
    if (
      err.message.startsWith('No configuration provided for') ||
      err.message.includes('No rules found within configuration')
    ) {
      // Check only CSS syntax errors without applying any stylelint rules
      return processResults(await lint({
        ...options,
        ...priorOptions,
        config: {
          rules: {}
        }
      }));
    }

    throw err;
  }

  return processResults(resultContainer);
};
