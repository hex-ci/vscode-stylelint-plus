# vscode-stylelint-plus

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![codecov](https://codecov.io/github/hex-ci/vscode-stylelint-plus/branch/main/graph/badge.svg?token=AiK4XitPgu)](https://codecov.io/github/hex-ci/vscode-stylelint-plus)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)

A [Visual Studio Code](https://code.visualstudio.com/) extension to lint [CSS](https://www.w3.org/Style/CSS/)/[SCSS](https://sass-lang.com/documentation/file.SASS_REFERENCE.html#syntax)/[Less](http://lesscss.org/) with [stylelint](https://stylelint.io/), support auto fix on save.

![screenshot](https://github.com/hex-ci/vscode-stylelint-plus/raw/main/screenshot.png)

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

This extension supports **stylelint v15, v16, and v17** with automatic version detection.

#### Default Behavior (Bundled Version)

- **Bundled**: stylelint v15.x (CommonJS)
- **Works with**: All Node.js versions >= 20.0.0
- **Enabled when**: `stylelint.useLocal` is `false` (default)

#### Local Version (User-Installed)

- **Supported**: v15.x, v16.x, v17.x
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

Check the status bar (bottom-right) to see which stylelint version is active:
- `Stylelint+ (bundled v16.0.0)` - Using extension's bundled version
- `Stylelint+ (local v17.0.0)` - Using project's local version

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

**3. Manual Command**
- Execute the command `Stylelint: Fix all auto-fixable problems` from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
- Fixes all auto-fixable issues in the currently active document
- Works on all supported file types

#### Status Bar Indicator

The extension displays a status bar item in the bottom-right corner showing:
- **Green checkmark**: Stylelint is running successfully
  - Example: `Stylelint+ (bundled v15.11.0)` or `Stylelint+ (local v17.0.0)`
- **Red error icon**: Stylelint encountered an error (e.g., local version not found)
- Hover over the status bar item to see detailed version information

#### Fallback to Syntax Checking

If no stylelint configuration is found (no `.stylelintrc` or other config files), the extension will:
- Still perform **CSS syntax validation** to catch basic syntax errors
- Use an empty ruleset (no style rules enforced)
- Continue to work without showing configuration errors

This allows you to catch syntax errors even before setting up full stylelint rules.

### Document Validation

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

#### stylelint.configOverrides

Type: `Object`
Default: `null`

Set stylelint [`configOverrides`](https://github.com/stylelint/stylelint/blob/main/docs/user-guide/node-api.md#configoverrides) option. This partially overrides the existing configuration loaded from config files.

**Example**:
```json
{
  "stylelint.configOverrides": {
    "rules": {
      "indentation": 4
    }
  }
}
```

#### stylelint.config

Type: `Object`
Default: `null`

Set stylelint [`config`](https://github.com/stylelint/stylelint/blob/main/docs/user-guide/node-api.md#config) option.

**Important**: When this option is set, stylelint **will not** load configuration files (`.stylelintrc`, `stylelint.config.js`, etc.). Use `configOverrides` if you want to extend an existing configuration instead.

#### stylelint.useLocal

Type: `boolean`
Default: `false`

Use the locally installed version of stylelint from your project's `node_modules` instead of the bundled version.

**How it works**:
- The extension searches upward from the current file's directory for `node_modules/stylelint`
- Supports stylelint v15, v16, and v17 with automatic version detection
- If local stylelint is not found, the extension will show an error status in the status bar

#### stylelint.disableErrorMessage

Type: `boolean`
Default: `true`

Whether to suppress error message popups. When enabled, errors are logged to the console but don't show as VS Code notifications.

## License

[MIT License](./LICENSE) © 2019 - 2026 Hex
