'use strict';

const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const path = require('path');

describe('loadStylelint', () => {
  let loadStylelint;
  let fsStub;
  let stylelintMock;

  beforeEach(() => {
    stylelintMock = { version: '15.0.0', lint: sinon.stub() };

    fsStub = {
      existsSync: sinon.stub(),
      readFileSync: sinon.stub()
    };

    loadStylelint = proxyquire('../../src/load-stylelint', {
      'fs': fsStub,
      'stylelint': stylelintMock
    });
  });

  it('should load bundled stylelint if no path provided', async () => {
    const result = await loadStylelint();
    assert.strictEqual(result, stylelintMock);
  });

  it('should throw if package.json not found and no fallback', async () => {
    fsStub.existsSync.returns(false);

    try {
      await loadStylelint('/some/path');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Cannot find package.json');
    }
  });

  it('should fallback to bundled if package.json not found and fallback enabled', async () => {
    fsStub.existsSync.returns(false);

    const result = await loadStylelint('/some/path', { fallbackToBundled: true });
    assert.strictEqual(result, stylelintMock);
  });

  it('should load local stylelint for version < 17', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({ version: '16.0.0', main: 'index.js' }));

    const result = await loadStylelint(modulePath);

    assert.equal(result.version, '16.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });

  it('should load local stylelint for version >= 17', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    // Use same fixture but pretend it is v17
    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({ version: '17.0.0', main: 'index.js' }));

    const result = await loadStylelint(modulePath);

    // Dynamic import of CJS module returns object with 'default' property equal to module.exports
    // But loadStylelint handles this: return esmModule.default || esmModule;
    // However, if the module.exports is the object, import() returns a module namespace object.
    // The module namespace object has 'default' if the CJS module exports a default, or it maps named exports.
    // Actually, for CJS import, 'default' IS the module.exports.

    // Let's verify what we get. The fixture exports { version: '16.0.0', lint: ... }
    // Since we mocked readFileSync, loadStylelint thinks it is v17.
    // It loads the file. The file content says version: '16.0.0'.

    assert.equal(result.version, '16.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });
});
