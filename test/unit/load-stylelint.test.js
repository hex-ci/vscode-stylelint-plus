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
  const modulePath = path.resolve(__dirname, 'fixtures/mock-stylelint');

  beforeEach(() => {
    stylelintMock = { version: '15.0.0', lint: sinon.stub() };

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

  function stubPkgJson(pkgJson, customModulePath = modulePath) {
    const pkgJsonPath = path.join(customModulePath, 'package.json');
    fsPromisesStub.readFile.reset();
    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify(pkgJson));
    return pkgJsonPath;
  }

  it('should load bundled stylelint when modulePath is missing', async () => {
    const result = await loadStylelint();
    assert.strictEqual(result, stylelintMock);
  });

  it('should handle missing package.json with and without fallback', async () => {
    const pkgJsonPath = path.join('/some/path', 'package.json');
    fsPromisesStub.access.withArgs(pkgJsonPath).rejects(new Error('ENOENT'));

    try {
      await loadStylelint('/some/path');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Cannot find package.json');
    }

    fsPromisesStub.access.reset();
    fsPromisesStub.access.rejects(new Error('ENOENT'));

    const result = await loadStylelint('/some/path', { fallbackToBundled: true });
    assert.strictEqual(result, stylelintMock);
  });

  it('should load local stylelint for supported versions', async () => {
    const versions = ['15.0.0', '17.0.0'];

    for (const version of versions) {
      fsPromisesStub.access.resolves();
      stubPkgJson({ version, main: 'index.js' });

      const result = await loadStylelint(modulePath);

      assert.equal(result.version, '15.0.0', `version ${version}`);
      assert.equal(result.lint(), 'mock-lint-result');
    }
  });

  it('should resolve entry points from exports and fallbacks', async () => {
    const cases = [
      { label: 'exports string', pkgJson: { version: '17.0.0', exports: './index.js' } },
      { label: 'exports dot string', pkgJson: { version: '17.0.0', exports: { '.': './index.js' } } },
      { label: 'exports dot import', pkgJson: { version: '17.0.0', exports: { '.': { import: './index.js' } } } },
      { label: 'exports dot default', pkgJson: { version: '17.0.0', exports: { '.': { default: './index.js' } } } },
      { label: 'exports no dot', pkgJson: { version: '17.0.0', main: './index.js', exports: { './foo': './foo.js' } } },
      { label: 'exports dot no import/default', pkgJson: { version: '17.0.0', main: './index.js', exports: { '.': { types: './index.d.ts' } } } },
      { label: 'module fallback', pkgJson: { version: '17.0.0', module: './index.js' } },
      { label: 'index fallback', pkgJson: { version: '17.0.0' } },
      { label: 'exports import+default', pkgJson: { version: '17.0.0', exports: { '.': { import: './index.js', default: './other.js' } } } },
      { label: 'exports require', pkgJson: { version: '17.0.0', main: './index.js', exports: { '.': { require: './cjs.js' } } } },
      { label: 'exports empty', pkgJson: { version: '17.0.0', main: './index.js', exports: {} } }
    ];

    for (const testCase of cases) {
      fsPromisesStub.access.resolves();
      stubPkgJson(testCase.pkgJson);

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0', testCase.label);
    }
  });

  it('should handle ESM module with no default export', async () => {
    const esmModulePath = path.resolve(__dirname, 'fixtures/mock-stylelint-esm-no-default');
    const pkgJsonPath = path.join(esmModulePath, 'package.json');
    const realPkgJson = require(pkgJsonPath);

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves(JSON.stringify(realPkgJson));

    const result = await loadStylelint(esmModulePath);
    assert.equal(result.version, '17.0.0');
    assert.equal(result.lint(), 'mock-lint-result');
  });

  it('should report read/parse errors', async () => {
    const pkgJsonPath = path.join('/some/path', 'package.json');

    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .rejects(new Error('Permission denied'));

    try {
      await loadStylelint('/some/path');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Permission denied');
    }

    fsPromisesStub.readFile.reset();
    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves('{ invalid json }');

    try {
      await loadStylelint('/some/path');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Invalid JSON');
    }

    // Test fallbackToBundled with invalid JSON
    fsPromisesStub.readFile.reset();
    fsPromisesStub.readFile.withArgs(pkgJsonPath, 'utf8')
      .resolves('{ invalid json }');

    const fallbackResult = await loadStylelint('/some/path', { fallbackToBundled: true });
    assert.equal(fallbackResult.version, '15.0.0');

    fsPromisesStub.readFile.reset();
    fsPromisesStub.readFile.rejects(new Error('Read error'));

    try {
      await loadStylelint('/some/path', { fallbackToBundled: true });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Read error');
    }
  });

  it('should parse version edge cases', async () => {
    const versions = ['16.9.9', '17.0.0', '20.0.0', '17.0.0-beta.1'];

    for (const version of versions) {
      fsPromisesStub.access.resolves();
      stubPkgJson({ version, main: 'index.js' });

      const result = await loadStylelint(modulePath);
      assert.equal(result.version, '15.0.0', version);
    }

    // Test missing version field
    fsPromisesStub.access.resolves();
    stubPkgJson({ main: 'index.js' }); // no version field

    const resultNoVersion = await loadStylelint(modulePath);
    assert.equal(resultNoVersion.version, '15.0.0');
  });

  it('should support options and modulePath variants', async () => {
    const pkgJsonPath = path.join('/some/path', 'package.json');
    fsPromisesStub.access.withArgs(pkgJsonPath).rejects(new Error('ENOENT'));

    try {
      await loadStylelint('/some/path', { fallbackToBundled: false });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.include(err.message, 'Cannot find package.json');
    }

    const variants = [
      { modulePath: undefined, options: {} },
      { modulePath: null, options: { fallbackToBundled: true } },
      { modulePath: undefined, options: { fallbackToBundled: false } },
      { modulePath: '', options: { fallbackToBundled: false } }
    ];

    for (const variant of variants) {
      const result = await loadStylelint(variant.modulePath, variant.options);
      assert.strictEqual(result, stylelintMock);
    }
  });
});
