'use strict';

const fs = require('fs');
const {join} = require('path');
const arrayToError = require('array-to-error');
const arrayToSentence = require('array-to-sentence');
const {at, has, intersection, isPlainObject, map, stubString} = require('lodash');
const {Files, TextDocument} = require('vscode-languageserver');
const inspectWithKind = require('inspect-with-kind');
const stylelintWarningToVscodeDiagnostic = require('./diagnostic');

async function loadStylelint(modulePath) {
  if (!modulePath) {
    return require('stylelint');
  }

  const pkgJsonPath = join(modulePath, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`Cannot find package.json at ${pkgJsonPath}`);
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const majorVersion = parseInt(pkgJson.version.split('.')[0]);

  if (majorVersion >= 17) {
    let entryPoint;

    if (pkgJson.exports) {
      if (typeof pkgJson.exports === 'string') {
        entryPoint = join(modulePath, pkgJson.exports);
      }
      else if (pkgJson.exports['.']) {
        const dotExport = pkgJson.exports['.'];

        if (typeof dotExport === 'string') {
          entryPoint = join(modulePath, dotExport);
        }
        else if (dotExport.import) {
          entryPoint = join(modulePath, dotExport.import);
        }
        else if (dotExport.default) {
          entryPoint = join(modulePath, dotExport.default);
        }
      }
    }

    if (!entryPoint) {
      entryPoint = join(modulePath, pkgJson.module || pkgJson.main || 'index.js');
    }

    const fileUrl = `file://${entryPoint}`;
    const esmModule = await import(fileUrl);

    return esmModule.default || esmModule;
  }

  return require(modulePath);
}

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

const UNSUPPORTED_OPTIONS = [
  'code',
  'codeFilename',
  'files',
  'formatter'
];

function quote(str) {
  return `\`${str}\``;
}

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

module.exports = async function stylelintVSCode(...args) {
  const argLen = args.length;

  if (argLen !== 1 && argLen !== 2) {
    throw new RangeError(`Expected 1 or 2 arguments (<TextDocument>[, <Object>]), but got ${
      argLen === 0 ? 'no' : argLen
    } arguments.`);
  }

  const [textDocument, options = {}] = args;

  if (!TextDocument.is(textDocument)) {
    throw new TypeError(`Expected a TextDocument https://code.visualstudio.com/docs/extensionAPI/vscode-api#TextDocument, but got ${
      inspectWithKind(textDocument)
    }.`);
  }

  if (argLen === 2) {
    if (!isPlainObject(options)) {
      throw new TypeError(`Expected an object containing stylelint API options, but got ${
        inspectWithKind(options)
      }.`);
    }

    const providedUnsupportedOptions = intersection(Object.keys(options), UNSUPPORTED_OPTIONS);

    if (providedUnsupportedOptions.length !== 0) {
      throw new TypeError(`${
        arrayToSentence(map(UNSUPPORTED_OPTIONS, quote))
      } options are not supported because they will be derived from a document and there is no need to set them manually, but ${
        arrayToSentence(map(providedUnsupportedOptions, quote))
      } was provided.`);
    }
  }

  const priorOptions = {
    formatter: stubString
  };
  const codeFilename = Files.uriToFilePath(textDocument.uri);
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
