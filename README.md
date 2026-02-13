# vscode-stylelint-plus

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![codecov](https://codecov.io/github/hex-ci/vscode-stylelint-plus/branch/main/graph/badge.svg?token=AiK4XitPgu)](https://codecov.io/github/hex-ci/vscode-stylelint-plus)

English | [简体中文](./README.zh-CN.md)

A [Visual Studio Code](https://code.visualstudio.com/) extension to lint [CSS](https://www.w3.org/Style/CSS/)/[SCSS](https://sass-lang.com/documentation/syntax/)/[Less](http://lesscss.org/) with [Stylelint](https://stylelint.io/).

Ships with Stylelint v15 built-in — install the extension and start linting immediately, no extra setup required.

## Quick Start

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus).
2. Open any CSS, SCSS, or Less file — linting works out of the box using the bundled Stylelint v15.
3. (Optional) Add a [Stylelint configuration file](https://stylelint.io/user-guide/configure/) to your project to customize rules.
4. (Optional) To use your project's own Stylelint version (v14–v17), set `"stylelint.useLocal": true`.

> **Tip**: To avoid duplicate diagnostics from VS Code's built-in CSS/SCSS/Less validators, disable them:
> ```json
> "css.validate": false,
> "less.validate": false,
> "scss.validate": false
> ```

## Features

### Zero-Config Linting

The extension bundles Stylelint v15.11.0, so it works immediately after installation — no need to install Stylelint separately or create a config file. Without a config file, the extension still performs CSS syntax validation to catch basic syntax errors.

### Auto-Fix on Save

Enable `stylelint.autoFixOnSave` to automatically fix all auto-fixable problems whenever you save a file. This uses the native `onWillSaveWaitUntil` mechanism, so fixes are applied before the file is written to disk — no need to configure `editor.codeActionsOnSave`.

```json
{
  "stylelint.autoFixOnSave": true
}
```

### Quick Fix (Code Actions)

Hover over any Stylelint diagnostic and click the light bulb icon, or press `Ctrl+.` (`Cmd+.` on Mac):

- **Fix: \<issue\>** — Fix the specific auto-fixable problem at the cursor (available only for rules that support auto-fix)
- **Disable \<rule\> for this line** — Insert a `/* stylelint-disable-next-line */` or `/* stylelint-disable-line */` comment to suppress the diagnostic

You can also fix all auto-fixable problems at once using the `Stylelint: Fix all auto-fixable problems` command from the Command Palette.

### Validation Trigger Modes

Control when linting runs via the `stylelint.run` setting:

| Mode | Behavior |
|------|----------|
| `"onType"` (default) | Validates as you type, with a 150ms debounce |
| `"onSave"` | Validates only when the file is saved |
| `"manual"` | Validates only when you run `Stylelint: Validate current file` |

### Workspace Linting

Lint all style files across the entire workspace at once:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `Stylelint: Lint entire workspace`

Scans files with these extensions: `.css`, `.scss`, `.less`, `.sass`, `.sss`, `.vue`, `.svelte`, `.html`, `.xml`, `.xsl`, `.md`, `.markdown`.

Automatically skips `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt` directories. Files larger than 5MB are skipped.

### Language Status Indicator

The extension shows a [Language Status](https://code.visualstudio.com/api/references/vscode-api#LanguageStatusItem) item next to the language indicator in the status bar. Click the language name (e.g., "CSS", "SCSS") to see it:

- `Stylelint+ — bundled v15.11.0` — Using the extension's bundled version
- `Stylelint+ — local v17.0.0` — Using your project's local version
- `Stylelint+ — ⚠ Local not found, using bundled v15.11.0` — Local Stylelint not found, fell back to bundled
- `Stylelint+ — Ready` — Shown before the first validation completes

### Stylelint Version Support

The extension supports Stylelint v14, v15, v16, and v17 with automatic version detection.

**Bundled version (default)**:
- Stylelint v15.11.0 (CommonJS), works with Node.js >= 18.0.0
- Used when `stylelint.useLocal` is `false` (default)

**Local version (user-installed)**:
- Set `"stylelint.useLocal": true` to use your project's Stylelint
- v14–v16 are loaded via CommonJS; v17+ is loaded via ESM (dynamic `import()`)
- If local Stylelint is not found, the extension falls back to the bundled version and shows a warning

#### Migrating to Stylelint v17

Stylelint v17 requires Node.js >= 20.19.0 and uses ESM exclusively.

1. Upgrade Node.js:
   ```bash
   nvm install 20
   nvm use 20
   ```

2. Install Stylelint v17 locally:
   ```bash
   npm install stylelint@^17 --save-dev
   ```

3. Enable local version:
   ```json
   {
     "stylelint.useLocal": true
   }
   ```

4. Reload VS Code

## Supported Languages

The extension activates for the following 21 [language identifiers](https://code.visualstudio.com/docs/languages/overview#_language-id):

- CSS (`css`)
- HTML (`html`)
- JavaScript (`javascript`)
- JavaScript React (`javascriptreact`)
- Less (`less`)
- Markdown (`markdown`)
- Markdown+MathML (`source.markdown.math`)
- PostCSS (`postcss`)
- Sass (`sass`)
- SCSS (`scss`)
- styled-components
  - Official (`source.css.styled`)
  - Userland (`styled-css`)
- Sugarss (`sugarss`)
- Svelte (`svelte`)
- TypeScript (`typescript`)
- TypeScript React (`typescriptreact`)
- Vue (`vue`, `vue-html`, `vue-postcss`)
- XML (`xml`)
- XSL (`xsl`)

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Stylelint: Fix all auto-fixable problems` | Fix all auto-fixable issues in the current file |
| `Stylelint: Validate current file` | Manually trigger validation (useful in `manual` mode) |
| `Stylelint: Lint entire workspace` | Lint all style files in the workspace |
| `Stylelint: Retry local search` | Re-scan for local Stylelint installation (clears cache) |
| `Stylelint: Show output channel` | Open the Stylelint+ output panel for debugging |

## Settings

All settings are under the `stylelint.` prefix. Though it's recommended to use a [Stylelint configuration file](https://stylelint.io/user-guide/configure/) in your workspace, the following VS Code [settings](https://code.visualstudio.com/docs/configure/settings) are also available.

### stylelint.enable

Type: `boolean` · Default: `true`

Control whether this extension is enabled or not.

### stylelint.autoFixOnSave

Type: `boolean` · Default: `false`

Automatically fix all auto-fixable Stylelint issues when saving a file. Fixes are applied before the file is written to disk via `onWillSaveWaitUntil`.

### stylelint.run

Type: `"onType"` | `"onSave"` | `"manual"` · Default: `"onType"`

Controls when Stylelint validation is triggered. See [Validation Trigger Modes](#validation-trigger-modes) for details.

### stylelint.useLocal

Type: `boolean` · Default: `false`

Use the locally installed version of Stylelint from your project's `node_modules` instead of the bundled version. The extension searches upward from the current file's directory for `node_modules/stylelint`. If not found, it falls back to the bundled version.

### stylelint.config

Type: `Object` · Default: `null`

Set the Stylelint [`config`](https://stylelint.io/user-guide/node-api/#config) option. When this is set, Stylelint will not load configuration files (`.stylelintrc`, `stylelint.config.js`, etc.).

```json
{
  "stylelint.config": {
    "rules": {
      "color-no-invalid-hex": true,
      "block-no-empty": true
    }
  }
}
```

### stylelint.configFile

Type: `string` · Default: `""`

Path to a Stylelint configuration file. Relative paths are resolved from the workspace root. When set, this takes precedence over `stylelint.config`.

```json
{
  "stylelint.configFile": ".config/stylelint.config.js"
}
```

### stylelint.ignorePath

Type: `string` · Default: `""`

Path to a `.stylelintignore` file. Relative paths are resolved from the workspace root. When empty, the extension auto-discovers `.stylelintignore` by walking up from the document's directory.

### stylelint.ignoreNodeModules

Type: `boolean` · Default: `true`

Whether to skip validation for files inside `node_modules` directories.

### stylelint.disableErrorMessage

Type: `boolean` · Default: `true`

Whether to suppress error message popups. When enabled, errors are logged to the output channel but don't show as VS Code notifications.

### stylelint.rules.customizations

Type: `Array` · Default: `[]`

Override the severity of specific Stylelint rules in VS Code diagnostics, without modifying your Stylelint config. Use `"off"` to suppress a rule entirely.

Each entry has:
- `rule` — The Stylelint rule name
- `severity` — One of `"error"`, `"warning"`, `"information"`, `"hint"`, or `"off"`

```json
{
  "stylelint.rules.customizations": [
    { "rule": "color-named", "severity": "hint" },
    { "rule": "block-no-empty", "severity": "off" }
  ]
}
```

### stylelint.codeAction.disableRuleComment

Type: `Object` · Default: `{ "location": "separateLine" }`

Controls where the "Disable rule" code action inserts the `stylelint-disable` comment.

- `"separateLine"` (default) — Inserts `/* stylelint-disable-next-line <rule> */` on the line above
- `"sameLine"` — Appends `/* stylelint-disable-line <rule> */` at the end of the same line

```json
{
  "stylelint.codeAction.disableRuleComment": {
    "location": "sameLine"
  }
}
```

## License

[MIT License](./LICENSE) © 2019 – 2026 Hex
