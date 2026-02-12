# vscode-stylelint-plus

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![codecov](https://codecov.io/github/hex-ci/vscode-stylelint-plus/branch/main/graph/badge.svg?token=AiK4XitPgu)](https://codecov.io/github/hex-ci/vscode-stylelint-plus)

A [Visual Studio Code](https://code.visualstudio.com/) extension to lint [CSS](https://www.w3.org/Style/CSS/)/[SCSS](https://sass-lang.com/documentation/file.SASS_REFERENCE.html#syntax)/[Less](http://lesscss.org/) with [stylelint](https://stylelint.io/), with built-in auto-fix on save and zero-config setup.

## ✨ Highlights

- 🚀 **Zero-config ready** — Bundled stylelint v15, works out of the box without installing anything extra
- 💾 **Auto-fix on save** — Native `onWillSaveWaitUntil` integration, no need to configure `codeActionsOnSave`
- 💡 **Quick Fix support** — Fix individual issues, fix all problems, or disable rules via the light bulb menu
- 🌐 **20+ languages built-in** — CSS, SCSS, Less, Vue, Svelte, styled-components, HTML, Markdown, and more
- 🔄 **Stylelint v14 – v17** — Automatic version detection with seamless CJS/ESM support
- 📊 **Language status indicator** — Real-time display of stylelint version and status
- 🛡️ **CSS syntax fallback** — Catches syntax errors even without a stylelint config file
- 🔍 **Workspace linting** — Lint all style files across the entire workspace in one go

![screenshot](https://github.com/hex-ci/vscode-stylelint-plus/raw/main/screenshot.png)

## Why stylelint-plus?

| Feature | stylelint-plus | Official vscode-stylelint |
|---------|:-:|:-:|
| Bundled stylelint (zero-config) | ✅ v15 included | ❌ Must install separately |
| Auto-fix on save | ✅ Built-in setting | ⚙️ Requires `codeActionsOnSave` config |
| Default language support | ✅ 20+ languages | ⚠️ CSS & PostCSS only |
| Validation trigger modes | ✅ onType / onSave / manual | ⚠️ onType only |
| Workspace-wide linting | ✅ | ❌ |
| Disable rule via code action | ✅ | ❌ |
| Rule severity customization | ✅ | ❌ |
| Language status version indicator | ✅ | ❌ |
| CSS syntax fallback (no config) | ✅ | ❌ |
| Stylelint version support | v14 – v17 | v14 – v17 |

## Installation

1. Execute `Extensions: Install Extensions` command from [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette).
2. Type `@sort:installs stylelint-plus` into the search form and install the topmost one.

Read the [extension installation guide](https://code.visualstudio.com/docs/editor/extension-gallery) for more details.

### Optional (but recommended) setup

<img align="right" width="430" alt="duplicate messages from both the built-in linter and vscode-stylelint-plus" src="https://raw.githubusercontent.com/hex-ci/vscode-stylelint-plus/main/media/duplicate.png">

To prevent both [the editor built-in linters](https://code.visualstudio.com/docs/languages/css#_syntax-verification-linting) `[css]` `[less]` `[scss]` and this extension `[stylelint]` from reporting essentially the same errors like in the screenshot, disable the built-in ones in User or Workspace [setting](https://code.visualstudio.com/docs/getstarted/settings):

```json
"css.validate": false,
"less.validate": false,
"scss.validate": false
```

## Usage

### Stylelint Version Support

This extension supports **stylelint v14, v15, v16, and v17** with automatic version detection.

#### Default Behavior (Bundled Version)

- **Bundled**: stylelint v15.x (CommonJS)
- **Works with**: All Node.js versions >= 18.0.0
- **Enabled when**: `stylelint.useLocal` is `false` (default)

#### Local Version (User-Installed)

- **Supported**: v14.x, v15.x, v16.x, v17.x
- **Auto-detection**: Automatically detects and loads the correct version
- **Enabled when**: `stylelint.useLocal` is `true`

#### Migrating to Stylelint v17

Stylelint v17 requires **Node.js >= 20.19.0** and uses **ESM** exclusively.

**Steps:**
1. Upgrade Node.js:
   ```bash
   nvm install 20
   nvm use 20
   ```

2. Install stylelint v17 locally:
   ```bash
   npm install stylelint@^17 --save-dev
   ```

3. Enable local version in VS Code settings:
   ```json
   {
     "stylelint.useLocal": true
   }
   ```

4. Reload VS Code

The extension will automatically detect and use the ESM version.

#### Version Indicator

The extension registers a Language Status item that appears next to the language indicator in the status bar. Click the language name (e.g., "CSS") to see it:
- `Stylelint+ — bundled v15.11.0` - Using extension's bundled version
- `Stylelint+ — local v17.0.0` - Using project's local version

### Features

#### Auto-fix and Quick Fix

This extension provides multiple ways to fix stylelint issues:

**1. Auto-fix on Save**
- Enable `stylelint.autoFixOnSave` setting to automatically fix all auto-fixable problems when you save a file
- All fixable issues will be corrected automatically without manual intervention

**2. Quick Fix (Code Actions)**
- Hover over any stylelint diagnostic (underlined issue) and click the light bulb icon, or press `Ctrl+.` (Windows/Linux) or `Cmd+.` (Mac)
- Choose from available fixes:
  - **Fix: [specific issue]** - Fix only the issue at the current cursor position
  - **Fix all auto-fixable stylelint problems** - Fix all auto-fixable issues in the current file
  - **Disable [rule] for this line** - Insert a `/* stylelint-disable-next-line */` or `/* stylelint-disable-line */` comment to suppress the diagnostic

**3. Manual Command**
- Execute the command `Stylelint: Fix all auto-fixable problems` from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
- Fixes all auto-fixable issues in the currently active document
- Works on all supported file types

#### Workspace Linting

Lint all style files across the entire workspace at once:

- Execute `Stylelint: Lint entire workspace` from the Command Palette
- Scans `.css`, `.scss`, `.less`, `.sass`, `.vue`, `.svelte`, `.html`, `.xml`, `.xsl`, `.md` files
- Shows progress notification during scanning
- Automatically skips `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt` directories
- Files larger than 5MB are skipped

#### Language Status Indicator

The extension registers a [Language Status](https://code.visualstudio.com/api/references/vscode-api#LanguageStatusItem) item that appears next to the language indicator in the status bar. Click the language name (e.g., "CSS", "SCSS") to see it:

- **Normal state**: `Stylelint+ — bundled v15.11.0` or `Stylelint+ — local v17.0.0`. Click to open the output channel.
- **Warning state**: `Stylelint+ — ⚠ Local not found, using bundled v15.11.0`. Shown when `useLocal` is enabled but local stylelint was not found. Click to retry the search.
- **Ready state**: `Stylelint+ — Ready`. Shown before the first validation completes.

#### Fallback to Syntax Checking

If no stylelint configuration is found (no `.stylelintrc` or other config files), the extension will:
- Still perform **CSS syntax validation** to catch basic syntax errors
- Use an empty ruleset (no style rules enforced)
- Continue to work without showing configuration errors

This allows you to catch syntax errors even before setting up full stylelint rules.

### Commands

All commands are available from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Stylelint: Fix all auto-fixable problems` | Fix all auto-fixable issues in the current file |
| `Stylelint: Validate current file` | Manually trigger validation for the active file (useful in `manual` mode) |
| `Stylelint: Lint entire workspace` | Lint all style files in the workspace |
| `Stylelint: Refresh local stylelint search` | Re-scan for local stylelint installation (clears cache) |
| `Stylelint: Show output channel` | Open the Stylelint output panel for debugging |

### Supported Languages

Once a user follows [the stylelint startup guide](https://github.com/stylelint/stylelint#getting-started) by creating a [configuration](https://stylelint.io/user-guide/configuration/) file or by editing [`stylelint.*` VSCode settings](#extension-settings), stylelint automatically validates documents with these [language identifiers](https://code.visualstudio.com/docs/languages/overview#_language-id):

<img align="right" width="430" alt="UI to select a language identifier" src="https://raw.githubusercontent.com/hex-ci/vscode-stylelint-plus/main/media/language.png">

* CSS (`css`)
* HTML (`html`)
* Less (`less`)
* JavaScript (`javascript`)
* JavaScript React (`javascriptreact`)
* Markdown (`markdown`)
* [Markdown+MathML (`source.markdown.math`)](https://marketplace.visualstudio.com/items?itemName=goessner.mdmath)
* [PostCSS (`postcss`)](https://marketplace.visualstudio.com/items?itemName=mhmadhamster.postcss-language)
* [Sass (`sass`)](https://marketplace.visualstudio.com/items?itemName=robinbentley.sass-indented)
* SCSS (`scss`)
* styled-components
  * [Official (`source.css.styled`)](https://marketplace.visualstudio.com/items?itemName=jpoissonnier.vscode-styled-components)
  * [Userland (`styled-css`)](https://marketplace.visualstudio.com/items?itemName=mgmcdermott.vscode-language-babel)
* [Sugarss (`sugarss`)](https://marketplace.visualstudio.com/items?itemName=mhmadhamster.postcss-language)
* [Svelte (`svelte`)](https://marketplace.visualstudio.com/items?itemName=JamesBirtles.svelte-vscode)
* TypeScript (`typescript`)
* TypeScript React (`typescriptreact`)
* [Vue (`vue`, `vue-html`, `vue-postcss`)](https://marketplace.visualstudio.com/items?itemName=octref.vetur)
* XML (`xml`)
* XSL (`xsl`)

### Extension Settings

Though it's highly recommended to add a [stylelint configuration file](https://stylelint.io/user-guide/example-config/) to the current workspace folder instead, the following extension [settings](https://code.visualstudio.com/docs/getstarted/settings) are also available.

#### stylelint.enable

Type: `boolean`
Default: `true`

Control whether this extension is enabled or not.

#### stylelint.autoFixOnSave

Type: `boolean`
Default: `false`

Automatically fix all auto-fixable stylelint issues when saving a file.

**Note**: This setting applies fixes to the entire file on save. For more granular control, use [Quick Fix](#auto-fix-and-quick-fix) instead.

#### stylelint.run

Type: `string`
Default: `"onType"`
Values: `"onType"` | `"onSave"` | `"manual"`

Controls when stylelint validation is triggered.

- `"onType"` — Validate as you type (default). Diagnostics update in real-time with a 150ms debounce.
- `"onSave"` — Validate only when the file is saved. Reduces CPU usage for large projects.
- `"manual"` — Validate only when explicitly triggered via the `Stylelint: Validate current file` command.

Example — validate only on save for better performance:
```json
{
  "stylelint.run": "onSave"
}
```

#### stylelint.config

Type: `Object`
Default: `null`

Set stylelint [`config`](https://github.com/stylelint/stylelint/blob/main/docs/user-guide/node-api.md#config) option.

**Important**: When this option is set, stylelint **will not** load configuration files (`.stylelintrc`, `stylelint.config.js`, etc.).

Example:
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

#### stylelint.configFile

Type: `string`
Default: `""`

Path to a stylelint configuration file. Relative paths are resolved from the workspace root. When set, this takes precedence over `stylelint.config`.

Example:
```json
{
  "stylelint.configFile": ".config/stylelint.config.js"
}
```

#### stylelint.useLocal

Type: `boolean`
Default: `false`

Use the locally installed version of stylelint from your project's `node_modules` instead of the bundled version.

**How it works**:
- The extension searches upward from the current file's directory for `node_modules/stylelint`
- Supports stylelint v14, v15, v16, and v17 with automatic version detection
- If local stylelint is not found, the extension falls back to the bundled version and shows a warning in the status bar

#### stylelint.ignorePath

Type: `string`
Default: `""`

Path to a `.stylelintignore` file. Relative paths are resolved from the workspace root. When empty, the extension auto-discovers `.stylelintignore` by walking up from the document's directory.

Example:
```json
{
  "stylelint.ignorePath": ".config/.stylelintignore"
}
```

#### stylelint.ignoreNodeModules

Type: `boolean`
Default: `true`

Whether to skip validation for files inside `node_modules` directories.

#### stylelint.disableErrorMessage

Type: `boolean`
Default: `true`

Whether to suppress error message popups. When enabled, errors are logged to the output channel but don't show as VS Code notifications.

#### stylelint.rules.customizations

Type: `Array`
Default: `[]`

Override the severity of specific stylelint rules in VS Code diagnostics, without modifying your stylelint config. Use `"off"` to suppress a rule entirely.

Each entry has:
- `rule` — The stylelint rule name
- `severity` — One of `"error"`, `"warning"`, `"information"`, `"hint"`, or `"off"`

Example — downgrade `color-named` to a hint and suppress `block-no-empty`:
```json
{
  "stylelint.rules.customizations": [
    { "rule": "color-named", "severity": "hint" },
    { "rule": "block-no-empty", "severity": "off" }
  ]
}
```

#### stylelint.codeAction.disableRuleComment

Type: `Object`
Default: `{ "location": "separateLine" }`

Controls where the "Disable rule" code action inserts the `stylelint-disable` comment.

- `"separateLine"` (default) — Inserts `/* stylelint-disable-next-line <rule> */` on the line above
- `"sameLine"` — Appends `/* stylelint-disable-line <rule> */` at the end of the same line

Example — use same-line comments:
```json
{
  "stylelint.codeAction.disableRuleComment": {
    "location": "sameLine"
  }
}
```

## License

[MIT License](./LICENSE) © 2019 - 2026 Hex
