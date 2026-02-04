'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Diagnostics Integration Tests', () => {
  const testFiles = [];

  function trackTestFile(filePath) {
    testFiles.push(filePath);
    return filePath;
  }

  function getDiagnosticCases() {
    return [
      {
        label: 'CSS',
        extension: 'css',
        content: 'body {',
        assertionMessage: 'Should have stylelint diagnostics for CSS file'
      },
      {
        label: 'SCSS',
        extension: 'scss',
        content: '$color: #ffffff;\na { color: $color; ',
        assertionMessage: 'Should have stylelint diagnostics for SCSS file'
      }
    ];
  }

  afterEach(function () {
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;
  });

  it('should report syntax errors for supported styles', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    for (const testCase of getDiagnosticCases()) {
      const testFileName = trackTestFile(join(
        __dirname,
        `diagnostics-${testCase.label.toLowerCase()}-${Math.floor(Math.random() * 100000)}.${testCase.extension}`
      ));

      fs.writeFileSync(testFileName, testCase.content);

      const document = await workspace.openTextDocument(testFileName);
      await window.showTextDocument(document);

      await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

      await pWaitFor(() => {
        const diagnostics = languages.getDiagnostics(document.uri);
        const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
        return stylelintDiagnostics.length > 0;
      }, { timeout: 10000 });

      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      assert.isNotEmpty(stylelintDiagnostics, testCase.assertionMessage);
      assert.equal(stylelintDiagnostics[0].source, 'stylelint');
    }
  });
});
