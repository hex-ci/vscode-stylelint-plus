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

    stylelintVSCode = proxyquire('../../src/server/stylelint-vscode', {
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

  it('should return fixedCode as null when both code and output are undefined (v17 fix:false fallback)', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata()
      // no code, no output (v17 with fix:true but no result fields)
    });

    const result = await stylelintVSCode(document, { fix: true });

    assert.isNull(result.fixedCode);
  });

  it('should preserve empty string fixedCode for v15 fix:true (not convert to null)', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');

    // v14/v15 fix:true: output is always the code text (original or fixed),
    // never the stub formatter result. An empty output means empty file content.
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }],
      ruleMetadata: buildRuleMetadata(),
      output: ''
    });

    const result = await stylelintVSCode(document, { fix: true });

    // Empty string is a valid fix result, should not be converted to null
    assert.strictEqual(result.fixedCode, '');
  });

  it('should not set config for untitled documents (no cwd)', async () => {
    // Untitled documents have relative paths — stylelint-vscode should NOT
    // pre-set config:{rules:{}}; let the error propagate to server.js
    const untitledDoc = TextDocument.create('untitled:Untitled-1', 'css', 1, 'body {}');
    await stylelintVSCode(untitledDoc);

    const callArgs = lintStub.firstCall.args[0];
    assert.equal(callArgs.code, 'body {}');
    // Should NOT set codeFilename for relative paths
    assert.isUndefined(callArgs.codeFilename);
    // Should NOT force empty config — let stylelint handle config lookup
    assert.isUndefined(callArgs.config);
  });

  it('should not set config for untitled documents when cwd is provided', async () => {
    const untitledDoc = TextDocument.create('untitled:Untitled-1', 'css', 1, 'body {}');
    await stylelintVSCode(untitledDoc, { cwd: '/workspace' });

    const callArgs = lintStub.firstCall.args[0];
    assert.equal(callArgs.code, 'body {}');
    assert.equal(callArgs.cwd, '/workspace');
    // Should NOT have config forced
    assert.isUndefined(callArgs.config);
  });

  it('should propagate No configuration provided error to caller', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const error = new Error('No configuration provided for /test.css');
    lintStub.rejects(error);

    try {
      await stylelintVSCode(document);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.message, 'No configuration provided for /test.css');
    }

    // Should only call lint once — no retry
    assert.isTrue(lintStub.calledOnce);
  });

  it('should propagate No configuration provided error for non-CSS files', async () => {
    const scssDoc = TextDocument.create('file:///test.scss', 'scss', 1, '$color: red;');
    const error = new Error('No configuration provided for /test.scss');
    lintStub.rejects(error);

    try {
      await stylelintVSCode(scssDoc);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.message, 'No configuration provided for /test.scss');
    }

    assert.isTrue(lintStub.calledOnce);
  });

  it('should propagate No rules found error', async () => {
    const lessDoc = TextDocument.create('file:///test.less', 'less', 1, '@color: red;');
    const error = new Error('No rules found within configuration');
    lintStub.rejects(error);

    try {
      await stylelintVSCode(lessDoc);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.message, 'No rules found within configuration');
    }

    assert.isTrue(lintStub.calledOnce);
  });

  it('should propagate No configuration provided error for vue files', async () => {
    const vueDoc = TextDocument.create('file:///App.vue', 'vue', 1, '<style>.a{}</style>');
    const error = new Error('No configuration provided for /App.vue');
    lintStub.rejects(error);

    try {
      await stylelintVSCode(vueDoc);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.message, 'No configuration provided for /App.vue');
    }

    assert.isTrue(lintStub.calledOnce);
  });

  it('should not pass internal path option to stylelint lint()', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    await stylelintVSCode(document, { path: '/some/local/stylelint' });

    // path should be used to load the module
    sinon.assert.calledWith(loadStylelintStub, '/some/local/stylelint');

    // path should NOT be passed to lint()
    const lintArgs = lintStub.firstCall.args[0];
    assert.isUndefined(lintArgs.path);
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
