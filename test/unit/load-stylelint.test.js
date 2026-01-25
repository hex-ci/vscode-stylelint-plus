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

    // Verify that a CJS module mock is correctly loaded even when mocked as v17
    // The fixture exports { version: '16.0.0', lint: ... }

    assert.equal(result.version, '16.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });

  it('should support exports as string', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      exports: './index.js'
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should support exports as object with dot and string', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      exports: {
        '.': './index.js'
      }
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should support exports as object with dot and import', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      exports: {
        '.': {
          import: './index.js'
        }
      }
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should support exports as object with dot and default', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      exports: {
        '.': {
          default: './index.js'
        }
      }
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should fall back to main if exports does not have dot export', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      main: './index.js',
      exports: {
        './foo': './foo.js'
      }
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should fall back to main if exports dot export has no import or default', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      main: './index.js',
      exports: {
        '.': {
          types: './index.d.ts'
        }
      }
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should fall back to module field if no exports and no main', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0',
      module: './index.js'
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should fall back to index.js if no exports, main, or module', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify({
      version: '17.0.0'
    }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '16.0.0');
  });

  it('should handle ESM module with no default export', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint-esm-no-default');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsStub.existsSync.withArgs(pkgJsonPath).returns(true);
    // We read the real package.json here because we want the real ESM loading behavior
    const realPkgJson = require(pkgJsonPath);
    fsStub.readFileSync.withArgs(pkgJsonPath, 'utf8').returns(JSON.stringify(realPkgJson));

    const result = await loadStylelint(modulePath);
    // When no default export, it should return the namespace object which has the named exports
    assert.equal(result.version, '17.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });
});
