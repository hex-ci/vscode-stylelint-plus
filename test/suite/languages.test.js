'use strict';

const { assert } = require('chai');
const { extensions, workspace, window } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Languages Integration Tests', () => {
  const testFiles = [];

  function trackTestFile(filePath) {
    testFiles.push(filePath);
    return filePath;
  }

  function getActivationCases() {
    return [
      {
        label: 'CSS',
        extension: 'css',
        content: 'body { color: red; }',
        expectedLanguageId: 'css'
      },
      {
        label: 'SCSS',
        extension: 'scss',
        content: '$color: #ffffff;\n.test { color: $color; }',
        expectedLanguageId: 'scss'
      },
      {
        label: 'Less',
        extension: 'less',
        content: '.test { color: red; }',
        expectedLanguageId: 'less'
      },
      {
        label: 'Sass',
        extension: 'sass',
        content: '.test\n  color: red'
      },
      {
        label: 'Vue',
        extension: 'vue',
        content: `<template>
  <div class="test">Hello</div>
</template>

<style>
.test { color: red; }
</style>`
      },
      {
        label: 'HTML',
        extension: 'html',
        content: `<!DOCTYPE html>
<html>
<head>
  <style>
    .test { color: red; }
  </style>
</head>
<body>
  <div class="test">Hello</div>
</body>
</html>`,
        expectedLanguageId: 'html'
      },
      {
        label: 'JavaScript',
        extension: 'js',
        content: `const styles = \`
  .test {
    color: red;
  }
\`;`,
        expectedLanguageId: 'javascript'
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

  it('should activate on supported languages', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    for (const testCase of getActivationCases()) {
      const testFileName = trackTestFile(join(
        __dirname,
        `test-${testCase.label.toLowerCase()}-${Math.floor(Math.random() * 100000)}.${testCase.extension}`
      ));

      fs.writeFileSync(testFileName, testCase.content);

      const document = await workspace.openTextDocument(testFileName);
      await window.showTextDocument(document);

      await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

      assert.isTrue(
        vscodeStylelint.isActive,
        `Extension should activate for ${testCase.label} files`
      );

      if (testCase.expectedLanguageId) {
        assert.strictEqual(
          document.languageId,
          testCase.expectedLanguageId,
          `Document should be recognized as ${testCase.label}`
        );
      }
    }
  });

  it('should use correct document selector from package.json', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const packageJson = vscodeStylelint.packageJSON;
    const activationEvents = packageJson.activationEvents || [];
    const languageActivations = activationEvents.filter(e => e.startsWith('onLanguage:'));

    assert.includeMembers(languageActivations, [
      'onLanguage:css',
      'onLanguage:scss',
      'onLanguage:less',
      'onLanguage:sass',
      'onLanguage:vue',
      'onLanguage:html',
      'onLanguage:javascript'
    ], 'Extension should have activation events for supported languages');
  });
});
