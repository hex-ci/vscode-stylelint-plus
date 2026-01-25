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
      assert.instanceOf(err, RangeError);
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
});
