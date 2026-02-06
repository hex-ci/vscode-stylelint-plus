'use strict';

const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const { TextDocument } = require('vscode-languageserver');

function buildRuleMetadata() {
  return {
    'length-zero-no-unit': { fixable: true },
    'color-no-invalid-hex': { fixable: false }
  };
}

describe('stylelintVSCode', () => {
  let stylelintVSCode;
  let loadStylelintStub;
  let lintStub;

  beforeEach(() => {
    lintStub = sinon.stub().resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata()
    });

    loadStylelintStub = sinon.stub().resolves({
      lint: lintStub
    });

    stylelintVSCode = proxyquire('../../src/stylelint-vscode', {
      './load-stylelint': loadStylelintStub
    });
  });

  it('should lint documents and apply options', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    await stylelintVSCode(document);

    const optionsDocument = TextDocument.create('file:///test2.css', 'css', 1, 'body {}');
    const options = { configFile: '.stylelintrc' };
    await stylelintVSCode(optionsDocument, options);

    sinon.assert.calledTwice(loadStylelintStub);
    sinon.assert.calledTwice(lintStub);

    const firstLintArgs = lintStub.firstCall.args[0];
    assert.equal(firstLintArgs.code, 'body {}');
    assert.equal(firstLintArgs.codeFilename, '/test.css');

    const secondLintArgs = lintStub.secondCall.args[0];
    assert.equal(secondLintArgs.configFile, '.stylelintrc');
    assert.equal(secondLintArgs.codeFilename, '/test2.css');
  });

  it('should validate arguments and options', async () => {
    try {
      await stylelintVSCode();
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, TypeError);
      assert.include(err.message, 'Expected a TextDocument');
    }

    try {
      await stylelintVSCode({});
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, TypeError);
      assert.include(err.message, 'Expected a TextDocument');
    }

    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    try {
      await stylelintVSCode(document, 123);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, TypeError);
      assert.include(err.message, 'Expected an object containing stylelint API options');
    }
  });

  it('should handle diagnostics and empty results', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: [{
          line: 1,
          column: 1,
          rule: 'foo',
          severity: 'error',
          text: 'bar'
        }]
      }],
      ruleMetadata: buildRuleMetadata()
    });

    const { diagnostics, ruleMetadata } = await stylelintVSCode(document);
    assert.lengthOf(diagnostics, 1);
    assert.equal(diagnostics[0].message, 'bar');
    assert.deepEqual(ruleMetadata, buildRuleMetadata());

    lintStub.resetBehavior();
    lintStub.resolves({});

    const emptyResult = await stylelintVSCode(document);
    assert.deepEqual(emptyResult, { diagnostics: [], ruleMetadata: {}, fixedCode: null });

    lintStub.resetBehavior();
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: [],
        _postcssResult: {
          stylelint: {
            ruleMetadata: buildRuleMetadata()
          }
        }
      }]
    });

    const fallbackResult = await stylelintVSCode(document);
    assert.deepEqual(fallbackResult, { diagnostics: [], ruleMetadata: buildRuleMetadata(), fixedCode: null });

    // Test with missing invalidOptionWarnings and warnings properties
    lintStub.resetBehavior();
    lintStub.resolves({
      results: [{}]
    });

    const missingPropsResult = await stylelintVSCode(document);
    assert.deepEqual(missingPropsResult.diagnostics, []);
  });

  it('should return empty object when ruleMetadata is null', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    // Simulate case where ruleMetadata is null (not undefined)
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: [],
        _postcssResult: {
          stylelint: {
            ruleMetadata: null
          }
        }
      }]
    });

    const result = await stylelintVSCode(document);
    // Should return {} instead of null to prevent null[rule] access errors
    assert.deepEqual(result.ruleMetadata, {});
  });

  it('should throw if invalidOptionWarnings are present', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [{ text: 'Invalid option' }],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata()
    });

    try {
      await stylelintVSCode(document);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, SyntaxError);
      assert.equal(err.message, 'Invalid option');
    }
  });

  it('should always use code mode for fix (not files mode)', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata(),
      code: 'body { }'
    });

    const result = await stylelintVSCode(document, { fix: true });

    const lintArgs = lintStub.firstCall.args[0];
    // Should use code + codeFilename, NOT files
    assert.equal(lintArgs.code, 'body {}');
    assert.equal(lintArgs.codeFilename, '/test.css');
    assert.isUndefined(lintArgs.files);
    assert.isTrue(lintArgs.fix);
    // Should return fixedCode from result.code (v16+)
    assert.equal(result.fixedCode, 'body { }');
  });

  it('should extract fixedCode from result.output for v15 compat', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    // v15: no result.code, but result.output is overwritten with fixed code
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata(),
      output: 'body { }'
    });

    const result = await stylelintVSCode(document, { fix: true });

    assert.equal(result.fixedCode, 'body { }');
  });

  it('should return fixedCode as null when fix not requested', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata(),
      code: 'body { }'
    });

    const result = await stylelintVSCode(document);

    // fix not requested, so fixedCode should be null even though result.code exists
    assert.isNull(result.fixedCode);
  });

  it('should return fixedCode as null for v15 no-fix case (empty output)', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    // v15 no-fix: output is "" (empty string from stubString formatter)
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata(),
      output: ''
    });

    const result = await stylelintVSCode(document, { fix: true });

    // Empty string from stubString formatter should be treated as null
    assert.isNull(result.fixedCode);
  });

  it('should return fixedCode in no-config fallback path', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const error = new Error('No configuration provided for /test.css');
    lintStub.onFirstCall().rejects(error);
    lintStub.onSecondCall().resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata(),
      code: 'body { }'
    });

    const result = await stylelintVSCode(document, { fix: true });

    assert.equal(result.fixedCode, 'body { }');
  });

  it('should handle untitled defaults, syntax inference, and config', async () => {
    const untitledCss = TextDocument.create('untitled:', 'css', 1, 'body {}');
    await stylelintVSCode(untitledCss);

    const firstCallArgs = lintStub.firstCall.args[0];
    assert.equal(firstCallArgs.code, 'body {}');
    assert.isUndefined(firstCallArgs.codeFilename);
    assert.deepEqual(firstCallArgs.config, { rules: {} });

    const untitledScss = TextDocument.create('untitled:', 'scss', 1, 'body {}');
    await stylelintVSCode(untitledScss);
    assert.equal(lintStub.secondCall.args[0].syntax, 'scss');

    const untitledJs = TextDocument.create('untitled:', 'javascript', 1, 'const style = css`...`');
    await stylelintVSCode(untitledJs);
    assert.equal(lintStub.getCall(2).args[0].syntax, 'css-in-js');

    const untitledWithSyntax = TextDocument.create('untitled:', 'css', 1, 'body {}');
    await stylelintVSCode(untitledWithSyntax, { syntax: 'scss' });
    assert.equal(lintStub.getCall(3).args[0].syntax, 'scss');

    const config = { rules: { 'color-no-invalid-hex': true } };
    const untitledWithConfig = TextDocument.create('untitled:', 'css', 1, 'body {}');
    await stylelintVSCode(untitledWithConfig, { config });
    assert.deepEqual(lintStub.getCall(4).args[0].config, config);
  });

  it('should handle untitled document with relative path (e.g., Untitled-1)', async () => {
    // This simulates the actual VS Code behavior where untitled documents have relative paths
    const untitledDoc = TextDocument.create('untitled:Untitled-1', 'css', 1, 'body {}');
    await stylelintVSCode(untitledDoc);

    const callArgs = lintStub.firstCall.args[0];
    assert.equal(callArgs.code, 'body {}');
    // Should NOT set codeFilename for relative paths (would cause stylelint error)
    assert.isUndefined(callArgs.codeFilename);
    // Without cwd, should use empty config
    assert.deepEqual(callArgs.config, { rules: {} });
  });

  it('should use config file lookup when cwd is provided for untitled document', async () => {
    const untitledDoc = TextDocument.create('untitled:Untitled-1', 'css', 1, 'body {}');
    // When cwd is provided, stylelint can find config files, so don't force empty config
    await stylelintVSCode(untitledDoc, { cwd: '/workspace' });

    const callArgs = lintStub.firstCall.args[0];
    assert.equal(callArgs.code, 'body {}');
    assert.equal(callArgs.cwd, '/workspace');
    // Should NOT have empty config forced - let stylelint find config from cwd
    assert.isUndefined(callArgs.config);
  });

  it('should fallback to css syntax check on No configuration provided error', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const error = new Error('No configuration provided for /test.css');
    lintStub.onFirstCall().rejects(error);
    lintStub.onSecondCall().resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata()
    });

    await stylelintVSCode(document);

    assert.isTrue(lintStub.calledTwice);
    const secondCallArgs = lintStub.secondCall.args[0];
    assert.deepEqual(secondCallArgs.config, { rules: {} });
  });

  it('should rethrow other errors', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const error = new Error('Other error');
    lintStub.rejects(error);

    try {
      await stylelintVSCode(document);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.message, 'Other error');
    }
  });

  it('should rethrow errors without message property', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const error = { code: 'UNKNOWN' }; // Error without message
    lintStub.rejects(error);

    try {
      await stylelintVSCode(document);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.code, 'UNKNOWN');
    }
  });

  it('should skip validation for files exceeding size limit', async () => {
    const largeContent = 'a'.repeat(1024 * 1024 * 5 + 1);
    const document = TextDocument.create('file:///large.css', 'css', 1, largeContent);

    const result = await stylelintVSCode(document);

    assert.deepEqual(result, { diagnostics: [], ruleMetadata: {}, fixedCode: null });
    assert.isFalse(lintStub.called);
  });
});
