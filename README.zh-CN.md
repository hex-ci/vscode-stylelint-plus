# vscode-stylelint-plus

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/hex-ci.stylelint-plus)](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus)
[![codecov](https://codecov.io/github/hex-ci/vscode-stylelint-plus/branch/main/graph/badge.svg?token=AiK4XitPgu)](https://codecov.io/github/hex-ci/vscode-stylelint-plus)

[English](./README.md) | 简体中文

一个 [Visual Studio Code](https://code.visualstudio.com/) 扩展，使用 [Stylelint](https://stylelint.io/) 检查 [CSS](https://www.w3.org/Style/CSS/)/[SCSS](https://sass-lang.com/documentation/syntax/)/[Less](http://lesscss.org/)。

内置 Stylelint v15 — 安装扩展即可立即开始检查，无需额外配置。

## 快速开始

1. 从 [VS Code 应用市场](https://marketplace.visualstudio.com/items?itemName=hex-ci.stylelint-plus) 安装扩展。
2. 打开任意 CSS、SCSS 或 Less 文件 — 使用内置的 Stylelint v15 即可开箱即用。
3. （可选）在项目中添加 [Stylelint 配置文件](https://stylelint.io/user-guide/configure/) 来自定义规则。
4. （可选）要使用项目本地安装的 Stylelint 版本（v14–v17），设置 `"stylelint.useLocal": true`。

> **提示**：为避免与 VS Code 内置的 CSS/SCSS/Less 验证器产生重复诊断，建议禁用它们：
> ```json
> "css.validate": false,
> "less.validate": false,
> "scss.validate": false
> ```

## 功能

### 零配置检查

扩展内置了 Stylelint v15.11.0，安装后即可使用 — 无需单独安装 Stylelint 或创建配置文件。即使没有配置文件，扩展仍会执行 CSS 语法验证以捕获基本语法错误。

### 保存时自动修复

启用 `stylelint.autoFixOnSave` 可在每次保存文件时自动修复所有可自动修复的问题。该功能使用原生的 `onWillSaveWaitUntil` 机制，修复会在文件写入磁盘之前应用 — 无需配置 `editor.codeActionsOnSave`。

```json
{
  "stylelint.autoFixOnSave": true
}
```

### 快速修复（代码操作）

将鼠标悬停在任意 Stylelint 诊断上并点击灯泡图标，或按 `Ctrl+.`（Mac 上为 `Cmd+.`）：

- **Fix: \<问题\>** — 修复光标处的特定可自动修复问题（仅适用于支持自动修复的规则）
- **Disable \<规则\> for this line** — 插入 `/* stylelint-disable-next-line */` 或 `/* stylelint-disable-line */` 注释以禁用该诊断

也可以通过命令面板中的 `Stylelint: 修复所有可自动修复的问题` 命令一次性修复所有可自动修复的问题。

### 验证触发模式

通过 `stylelint.run` 设置控制检查的运行时机：

| 模式 | 行为 |
|------|------|
| `"onType"`（默认） | 输入时验证，带 150ms 防抖 |
| `"onSave"` | 仅在文件保存时验证 |
| `"manual"` | 仅在运行 `Stylelint: 验证当前文件` 时验证 |

### 工作区检查

一次性检查整个工作区中的所有样式文件：

1. 打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
2. 运行 `Stylelint: 检查整个工作区`

扫描以下扩展名的文件：`.css`、`.scss`、`.less`、`.sass`、`.sss`、`.vue`、`.svelte`、`.html`、`.xml`、`.xsl`、`.md`、`.markdown`。

自动跳过 `node_modules`、`.git`、`dist`、`build`、`coverage`、`.next`、`.nuxt` 目录。大于 5MB 的文件会被跳过。

### 语言状态指示器

扩展在状态栏的语言指示器旁显示一个[语言状态](https://code.visualstudio.com/api/references/vscode-api#LanguageStatusItem)项。点击语言名称（如 "CSS"、"SCSS"）即可查看：

- `Stylelint+ — 内置 v15.11.0` — 使用扩展内置版本
- `Stylelint+ — 本地 v17.0.0` — 使用项目本地版本
- `Stylelint+ — ⚠ 未找到本地版本，使用内置版本 v15.11.0` — 未找到本地 Stylelint，已回退到内置版本
- `Stylelint+ — 就绪` — 首次验证完成前显示

### Stylelint 版本支持

扩展支持 Stylelint v14、v15、v16 和 v17，并具有自动版本检测功能。

**内置版本（默认）**：
- Stylelint v15.11.0（CommonJS），需要 Node.js >= 18.0.0
- 当 `stylelint.useLocal` 为 `false`（默认）时使用

**本地版本（用户安装）**：
- 设置 `"stylelint.useLocal": true` 以使用项目中的 Stylelint
- v14–v16 通过 CommonJS 加载；v17+ 通过 ESM（动态 `import()`）加载
- 如果未找到本地 Stylelint，扩展会回退到内置版本并显示警告

#### 迁移到 Stylelint v17

Stylelint v17 需要 Node.js >= 20.19.0 并且完全使用 ESM。

1. 升级 Node.js：
   ```bash
   nvm install 20
   nvm use 20
   ```

2. 本地安装 Stylelint v17：
   ```bash
   npm install stylelint@^17 --save-dev
   ```

3. 启用本地版本：
   ```json
   {
     "stylelint.useLocal": true
   }
   ```

4. 重新加载 VS Code

## 支持的语言

扩展为以下 21 种[语言标识符](https://code.visualstudio.com/docs/languages/overview#_language-id)激活：

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
  - 官方 (`source.css.styled`)
  - 社区 (`styled-css`)
- Sugarss (`sugarss`)
- Svelte (`svelte`)
- TypeScript (`typescript`)
- TypeScript React (`typescriptreact`)
- Vue (`vue`, `vue-html`, `vue-postcss`)
- XML (`xml`)
- XSL (`xsl`)

## 命令

所有命令均可通过命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）使用：

| 命令 | 描述 |
|------|------|
| `Stylelint: 修复所有可自动修复的问题` | 修复当前文件中所有可自动修复的问题 |
| `Stylelint: 验证当前文件` | 手动触发验证（在 `manual` 模式下使用） |
| `Stylelint: 检查整个工作区` | 检查工作区中的所有样式文件 |
| `Stylelint: 重新搜索本地版本` | 重新搜索本地 Stylelint 安装（清除缓存） |
| `Stylelint: 显示输出` | 打开 Stylelint+ 输出面板用于调试 |

## 设置

所有设置都在 `stylelint.` 前缀下。虽然建议在工作区中使用 [Stylelint 配置文件](https://stylelint.io/user-guide/configure/)，但以下 VS Code [设置](https://code.visualstudio.com/docs/configure/settings)也可用。

### stylelint.enable

类型：`boolean` · 默认值：`true`

控制是否启用此扩展。

### stylelint.autoFixOnSave

类型：`boolean` · 默认值：`false`

保存文件时自动修复所有可自动修复的 Stylelint 问题。修复通过 `onWillSaveWaitUntil` 在文件写入磁盘之前应用。

### stylelint.run

类型：`"onType"` | `"onSave"` | `"manual"` · 默认值：`"onType"`

控制 Stylelint 验证的触发时机。详见[验证触发模式](#验证触发模式)。

### stylelint.useLocal

类型：`boolean` · 默认值：`false`

使用项目 `node_modules` 中本地安装的 Stylelint 版本，而非内置版本。扩展会从当前文件所在目录向上搜索 `node_modules/stylelint`。如果未找到，则回退到内置版本。

### stylelint.config

类型：`Object` · 默认值：`null`

设置 Stylelint 的 [`config`](https://stylelint.io/user-guide/node-api/#config) 选项。设置后，Stylelint 将不会加载配置文件（`.stylelintrc`、`stylelint.config.js` 等）。

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

类型：`string` · 默认值：`""`

Stylelint 配置文件的路径。相对于工作区根目录。设置后，优先级高于 `stylelint.config`。

```json
{
  "stylelint.configFile": ".config/stylelint.config.js"
}
```

### stylelint.ignorePath

类型：`string` · 默认值：`""`

`.stylelintignore` 文件的路径。相对于工作区根目录。为空时，扩展会从文档所在目录向上自动查找 `.stylelintignore`。

### stylelint.ignoreNodeModules

类型：`boolean` · 默认值：`true`

是否跳过 `node_modules` 目录中文件的验证。

### stylelint.disableErrorMessage

类型：`boolean` · 默认值：`true`

是否禁止错误消息弹窗。启用后，错误会记录到输出面板，但不会显示为 VS Code 通知。

### stylelint.rules.customizations

类型：`Array` · 默认值：`[]`

在 VS Code 诊断中覆盖特定 Stylelint 规则的严重级别，无需修改 Stylelint 配置。使用 `"off"` 可完全禁用某条规则。

每个条目包含：
- `rule` — Stylelint 规则名称
- `severity` — `"error"`、`"warning"`、`"information"`、`"hint"` 或 `"off"` 之一

```json
{
  "stylelint.rules.customizations": [
    { "rule": "color-named", "severity": "hint" },
    { "rule": "block-no-empty", "severity": "off" }
  ]
}
```

### stylelint.codeAction.disableRuleComment

类型：`Object` · 默认值：`{ "location": "separateLine" }`

控制"禁用规则"代码操作插入 `stylelint-disable` 注释的位置。

- `"separateLine"`（默认） — 在上一行插入 `/* stylelint-disable-next-line <rule> */`
- `"sameLine"` — 在同一行末尾追加 `/* stylelint-disable-line <rule> */`

```json
{
  "stylelint.codeAction.disableRuleComment": {
    "location": "sameLine"
  }
}
```

## 安全扫描

每个发布版本的 VSIX 安装包都会通过 [VirusTotal](https://www.virustotal.com/) 扫描，以确认不含恶意软件及其他安全威胁。

## 许可证

[MIT License](./LICENSE) © 2019 – 2026 Hex
