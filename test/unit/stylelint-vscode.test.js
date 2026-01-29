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

  it('should lint a document', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    await stylelintVSCode(document);

    sinon.assert.calledOnce(loadStylelintStub);
    sinon.assert.calledOnce(lintStub);

    const lintArgs = lintStub.firstCall.args[0];
    assert.equal(lintArgs.code, 'body {}');
    assert.equal(lintArgs.codeFilename, '/test.css');
  });

  it('should handle options', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    const options = { configFile: '.stylelintrc' };

    await stylelintVSCode(document, options);

    const lintArgs = lintStub.firstCall.args[0];
    assert.equal(lintArgs.configFile, '.stylelintrc');
  });

  it('should throw if invalid arguments', async () => {
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
  });

  it('should throw if document is not a TextDocument', async () => {
    try {
      await stylelintVSCode({});
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, TypeError);
      assert.include(err.message, 'Expected a TextDocument');
    }
  });

  it('should handle stylelint errors', async () => {
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
  });

  it('should return empty array if results is empty', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    lintStub.resolves({
      results: []
    });

    const diagnostics = await stylelintVSCode(document);
    assert.deepEqual(diagnostics, []);
  });

  it('should throw if options is not a plain object', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    try {
      await stylelintVSCode(document, 123);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.instanceOf(err, TypeError);
      assert.include(err.message, 'Expected an object containing stylelint API options');
    }
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

  it('should handle fix: true', async () => {
    const document = TextDocument.create('file:///test.css', 'css', 1, 'body {}');
    await stylelintVSCode(document, { fix: true });

    const lintArgs = lintStub.firstCall.args[0];
    assert.deepEqual(lintArgs.files, ['/test.css']);
    assert.equal(lintArgs.allowEmptyInput, true);
  });

  it('should handle untitled document', async () => {
    const document = TextDocument.create('untitled:', 'css', 1, 'body {}');
    await stylelintVSCode(document);

    const lintArgs = lintStub.firstCall.args[0];
    assert.equal(lintArgs.code, 'body {}');
    assert.isUndefined(lintArgs.codeFilename);
  });

  it('should infer syntax from languageId', async () => {
    const document = TextDocument.create('untitled:', 'scss', 1, 'body {}');
    await stylelintVSCode(document);

    const lintArgs = lintStub.firstCall.args[0];
    assert.equal(lintArgs.syntax, 'scss');
  });

  it('should infer syntax from exception languageId', async () => {
    const document = TextDocument.create('untitled:', 'javascript', 1, 'const style = css`...`');
    await stylelintVSCode(document);

    const lintArgs = lintStub.firstCall.args[0];
    assert.equal(lintArgs.syntax, 'css-in-js');
  });

  it('should respect provided syntax for untitled document', async () => {
    const document = TextDocument.create('untitled:', 'css', 1, 'body {}');
    await stylelintVSCode(document, { syntax: 'scss' });

    const lintArgs = lintStub.firstCall.args[0];
    assert.equal(lintArgs.syntax, 'scss');
  });

  it('should provide default config if none provided for untitled document', async () => {
    const document = TextDocument.create('untitled:', 'css', 1, 'body {}');
    await stylelintVSCode(document);

    const lintArgs = lintStub.firstCall.args[0];
    assert.deepEqual(lintArgs.config, { rules: {} });
  });

  it('should respect provided config.rules for untitled document', async () => {
    const document = TextDocument.create('untitled:', 'css', 1, 'body {}');
    const config = { rules: { 'color-no-invalid-hex': true } };
    await stylelintVSCode(document, { config });

    const lintArgs = lintStub.firstCall.args[0];
    assert.deepEqual(lintArgs.config, config);
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
