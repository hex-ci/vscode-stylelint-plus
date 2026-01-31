'use strict';

const { assert } = require('chai');
const { extensions, workspace, window } = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');
const fs = require('fs');

describe('Languages Integration Tests', () => {
  const testFiles = [];

  afterEach(function () {
    // Clean up all test files
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;
  });

  it('should activate on Less files', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.less`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, '.test { color: red; }');

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const lessDocument = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(lessDocument);

    // Wait for activation - testing extension's document selector
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should activate for Less files');
    assert.strictEqual(lessDocument.languageId, 'less', 'Document should be recognized as Less');
  });

  it('should activate on Sass files', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.sass`);
    testFiles.push(testFileName);

    // Sass indented syntax
    fs.writeFileSync(testFileName, '.test\n  color: red');

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const sassDocument = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(sassDocument);

    // Wait for activation - testing extension's document selector
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should activate for Sass files');
    // Note: languageId may be 'plaintext' if no Sass extension is installed, that's ok
    // The important thing is extension activation
  });

  it('should activate on Vue files', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.vue`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, `<template>
  <div class="test">Hello</div>
</template>

<style>
.test { color: red; }
</style>`);

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const vueDocument = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(vueDocument);

    // Wait for activation - testing extension's document selector
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should activate for Vue files');
    // Note: languageId may be 'plaintext' if no Vue extension is installed, that's ok
    // The important thing is extension activation
  });

  it('should activate on HTML files', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.html`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, `<!DOCTYPE html>
<html>
<head>
  <style>
    .test { color: red; }
  </style>
</head>
<body>
  <div class="test">Hello</div>
</body>
</html>`);

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const htmlDocument = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(htmlDocument);

    // Wait for activation - testing extension's document selector
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should activate for HTML files');
    assert.strictEqual(htmlDocument.languageId, 'html', 'Document should be recognized as HTML');
  });

  it('should activate on JavaScript files', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.js`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, `const styles = \`
  .test {
    color: red;
  }
\`;`);

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const jsDocument = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(jsDocument);

    // Wait for activation - testing extension's document selector
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should activate for JavaScript files');
    assert.strictEqual(jsDocument.languageId, 'javascript', 'Document should be recognized as JavaScript');
  });

  it('should use correct document selector from package.json', async () => {
    // Verify that the extension uses the document selector defined in package.json
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    const packageJson = vscodeStylelint.packageJSON;

    // Check that activationEvents includes the languages we expect
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
