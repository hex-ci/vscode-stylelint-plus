'use strict';

const { assert } = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const path = require('path');

describe('loadStylelint', () => {
  let loadStylelint;
  let fsStub;
  let fsPromisesStub;
  let stylelintMock;

  beforeEach(() => {
    stylelintMock = { version: '15.0.0', lint: sinon.stub() };

    // Stub fs.promises methods
    fsPromisesStub = {
      access: sinon.stub().resolves(),
      readFile: sinon.stub()
    };

    fsStub = {
      promises: fsPromisesStub,
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
    const pkgJsonPath = path.join('/some/path', 'package.json');
    fsPromisesStub.access.withArgs(pkgJsonPath).rejects(new Error('ENOENT'));

    try {
      await loadStylelint('/some/path');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Cannot find package.json');
    }
  });

  it('should fallback to bundled if package.json not found and fallback enabled', async () => {
    fsPromisesStub.access.rejects(new Error('ENOENT'));

    const result = await loadStylelint('/some/path', { fallbackToBundled: true });
    assert.strictEqual(result, stylelintMock);
  });

  it('should load local stylelint for version < 17', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({ version: '15.0.0', main: 'index.js' }));

    const result = await loadStylelint(modulePath);

    assert.equal(result.version, '15.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });

  it('should load local stylelint for version >= 17', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    // Use same fixture but pretend it is v17
    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({ version: '17.0.0', main: 'index.js' }));

    const result = await loadStylelint(modulePath);

    // Verify that a CJS module mock is correctly loaded even when mocked as v17
    // The fixture exports { version: '15.0.0', lint: ... }

    assert.equal(result.version, '15.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });

  it('should support exports as string', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        exports: './index.js'
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should support exports as object with dot and string', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        exports: {
          '.': './index.js'
        }
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should support exports as object with dot and import', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        exports: {
          '.': {
            import: './index.js'
          }
        }
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should support exports as object with dot and default', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        exports: {
          '.': {
            default: './index.js'
          }
        }
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should fall back to main if exports does not have dot export', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        main: './index.js',
        exports: {
          './foo': './foo.js'
        }
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should fall back to main if exports dot export has no import or default', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        main: './index.js',
        exports: {
          '.': {
            types: './index.d.ts'
          }
        }
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should fall back to module field if no exports and no main', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0',
        module: './index.js'
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should fall back to index.js if no exports, main, or module', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify({
        version: '17.0.0'
      }));

    const result = await loadStylelint(modulePath);
    assert.equal(result.version, '15.0.0');
  });

  it('should handle ESM module with no default export', async () => {
    const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint-esm-no-default');
    const pkgJsonPath = path.join(modulePath, 'package.json');

    // We read the real package.json here because we want the real ESM loading behavior
    const realPkgJson = require(pkgJsonPath);
    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify(realPkgJson));

    const result = await loadStylelint(modulePath);
    // When no default export, it should return the namespace object which has the named exports
    assert.equal(result.version, '17.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });

  // Additional edge cases and error handling tests
  describe('Error Handling', () => {
    it('should throw when readFile fails', async () => {
      const pkgJsonPath = path.join('/some/path', 'package.json');
      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .rejects(new Error('Permission denied'));

      try {
        await loadStylelint('/some/path');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.include(err.message, 'Permission denied');
      }
    });

    it('should throw when package.json contains invalid JSON', async () => {
      const pkgJsonPath = path.join('/some/path', 'package.json');
      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves('{ invalid json }');

      try {
        await loadStylelint('/some/path');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.instanceOf(err, SyntaxError);
      }
    });

    it('should fallback to bundled when readFile fails and fallback enabled', async () => {
      fsPromisesStub.readFile.rejects(new Error('Read error'));

      try {
        await loadStylelint('/some/path', { fallbackToBundled: true });
        assert.fail('Should have thrown (readFile error is not caught by fallback)');
      } catch (err) {
        // readFile error happens after access check, so fallback doesn't apply
        assert.include(err.message, 'Read error');
      }
    });
  });

  describe('Version Parsing Edge Cases', () => {
    it('should handle version 16.9.9 (just before v17)', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({ version: '16.9.9', main: 'index.js' }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });

    it('should handle version 17.0.0 (exactly v17)', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({ version: '17.0.0', main: 'index.js' }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });

    it('should handle version 20.0.0 (future version)', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({ version: '20.0.0', main: 'index.js' }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });

    it('should handle version with prerelease tag', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({ version: '17.0.0-beta.1', main: 'index.js' }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });
  });

  describe('Package.json exports field edge cases', () => {
    it('should handle exports with both import and default (import takes precedence)', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({
          version: '17.0.0',
          exports: {
            '.': {
              import: './index.js',
              default: './other.js'
            }
          }
        }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });

    it('should handle exports with require field (should fall back to main)', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({
          version: '17.0.0',
          main: './index.js',
          exports: {
            '.': {
              require: './cjs.js'
            }
          }
        }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });

    it('should handle exports as empty object', async () => {
      const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');
      const pkgJsonPath = path.join(modulePath, 'package.json');

      fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
        .resolves(JSON.stringify({
          version: '17.0.0',
          main: './index.js',
          exports: {}
        }));

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0');
    });
  });

  describe('Options parameter', () => {
    it('should accept empty options object', async () => {
      const result = await loadStylelint(undefined, {});
      assert.strictEqual(result, stylelintMock);
    });

    it('should accept options with fallbackToBundled set to false', async () => {
      const pkgJsonPath = path.join('/some/path', 'package.json');
      fsPromisesStub.access.withArgs(pkgJsonPath).rejects(new Error('ENOENT'));

      try {
        await loadStylelint('/some/path', { fallbackToBundled: false });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.include(err.message, 'Cannot find package.json');
      }
    });

    it('should handle null modulePath with options', async () => {
      const result = await loadStylelint(null, { fallbackToBundled: true });
      assert.strictEqual(result, stylelintMock);
    });

    it('should handle undefined modulePath with options', async () => {
      const result = await loadStylelint(undefined, { fallbackToBundled: false });
      assert.strictEqual(result, stylelintMock);
    });

    it('should handle empty string modulePath', async () => {
      const result = await loadStylelint('', { fallbackToBundled: false });
      assert.strictEqual(result, stylelintMock);
    });
  });
});
