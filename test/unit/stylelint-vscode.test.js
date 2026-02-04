'use strict';

const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const { TextDocument } = require('vscode-languageserver');

describe('stylelintVSCode', () => {
  let stylelintVSCode;
  let loadStylelintStub;
  let lintStub;

  beforeEach(() => {
    lintStub = sinon.stub().resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }]
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
      }]
    });

    const diagnostics = await stylelintVSCode(document);
    assert.lengthOf(diagnostics, 1);
    assert.equal(diagnostics[0].message, 'bar');

    lintStub.resetBehavior();
    lintStub.resolves({ results: [] });

    const emptyDiagnostics = await stylelintVSCode(document);
    assert.deepEqual(emptyDiagnostics, []);
  });

  it('should throw if invalidOptionWarnings are present', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    lintStub.resolves({
      results: [{
        invalidOptionWarnings: [{ text: 'Invalid option' }],
        warnings: []
      }]
    });

    try {
      await stylelintVSCode(document);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, SyntaxError);
      assert.equal(err.message, 'Invalid option');
    }
  });

  it('should handle fix options and path-based linting', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    await stylelintVSCode(document, { fix: true });

    const lintArgs = lintStub.firstCall.args[0];
    assert.deepEqual(lintArgs.files, ['/test.css']);
    assert.equal(lintArgs.allowEmptyInput, true);
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

  it('should fallback to css syntax check on No configuration provided error', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const error = new Error('No configuration provided for /test.css');
    lintStub.onFirstCall().rejects(error);
    lintStub.onSecondCall().resolves({
      results: [{
        invalidOptionWarnings: [],
        warnings: []
      }]
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
});
