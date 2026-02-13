# Changelog

All notable changes to the **vscode-stylelint-plus** extension will be documented in this file.

## 2.1.0

### Added

- Internationalization (i18n) support using VS Code's l10n API for all UI strings and configuration descriptions
- Simplified Chinese translation for the extension UI, settings, and a dedicated `README.zh-CN.md`

### Changed

- Renamed `refreshLocalSearch` command to `retryLocalSearch` for clarity
- Bumped minimum VS Code engine version to `>=1.73.0`
- Switched `.vscodeignore` to a whitelist strategy to prevent accidental inclusion of development files

## 2.0.2

### Changed

- Monorepo-aware configuration resolution — validation now identifies package boundaries to isolate stylelint configuration per package, preventing settings leakage across modules
- Multi-root workspace traversal aggregates all active workspace folders while filtering redundant paths
- Sanitized file URI generation to support complex file naming

## 2.0.1

### Fixed

- Included CHANGELOG in the published extension package

## 2.0.0

### Added

- New commands: `Validate current file`, `Lint entire workspace`, `Refresh local stylelint search`, `Show output channel`
- Validation trigger modes: `onType` / `onSave` / `manual` (`stylelint.run` setting)
- Workspace-wide linting — lint all style files across the entire workspace in one go
- "Disable rule" code action — insert `stylelint-disable-next-line` or `stylelint-disable-line` comments
- Rule severity customization via `stylelint.rules.customizations` setting
- New settings: `stylelint.configFile`, `stylelint.ignorePath`, `stylelint.ignoreNodeModules`, `stylelint.codeAction.disableRuleComment`
- Language Status indicator (replaces status bar item)

### Changed

- Restructured source code into `client/`, `server/`, `shared/` module layout
- When local stylelint is not found, fall back to bundled version with a warning instead of showing an error
- Bumped minimum VS Code engine to `>=1.63.0`

## 1.4.1

### Fixed

- Refined ignore path resolution to prevent incorrect fallbacks
- Removed error status handling from status bar

## 1.4.0

### Added

- Improved error handling and fallback logic for missing local stylelint

### Changed

- Extracted stylelint options building logic into a separate method
- Simplified auto-fix logic and removed temp file handling
- Removed deprecated `configOverrides` from docs and code

## 1.3.1

### Changed

- Use `console.log` instead of `console.error` for server logging

## 1.3.0

### Added

- Enhanced diagnostics handling with rule metadata support and error resilience

### Changed

- Optimized resource management and prevented edge-case failures

### Fixed

- Bumped `glob` from 13.0.0 to 13.0.1
- Updated version info and status bar descriptions in README

## 1.2.0

### Added

- Enhanced diagnostics handling with rule metadata support
- Improved language server stability and resource management

### Changed

- Switched to `module.exports` for consistency across codebase

## 1.1.0

### Changed

- Restructured server logic into class-based architecture (`StylelintServer`)
- Migrated `fs` sync methods to async promises in server and tests
- Updated Node.js engine requirement to `>=20.0.0`
- Updated dependencies: `p-wait-for` ^6.0.0, `rimraf` ^6.1.2, `chai` ^6.2.2

## 1.0.6

### Fixed

- Updated `.vscodeignore` to include test fixture files

## 1.0.5

### Added

- Enhanced client activation logic with configuration change handling

### Fixed

- Streamlined CI coverage reporting

## 1.0.4

### Added

- Test coverage reporting with Codecov integration

## 1.0.3

### Added

- Prepublish script to compile before publishing

## 1.0.2

### Added

- Stylelint ignore handling with unit tests for validation

### Fixed

- Improved test stability and cleanup

## 1.0.1

### Added

- CI pipeline via GitHub Actions
- Integration and unit test suites

### Fixed

- Updated README links to use `main` branch instead of `master`

## 1.0.0

Complete rewrite of the extension, modernizing the codebase and expanding stylelint version support.

### Added

- Bundled stylelint v15 for zero-config out-of-the-box linting
- Stylelint v14–v17 support with automatic CJS/ESM version detection
- `useLocal` option to use project-local stylelint from `node_modules`
- Auto-fix command (`stylelint.executeAutofix`)
- CSS syntax fallback when no stylelint config is found
- esbuild-based build system producing separate client and server bundles
- `diff`-based text edit generation for auto-fix

### Changed

- Rewrote extension as a Language Server Protocol (LSP) client-server architecture
- Migrated from legacy stylelint-vscode adapter to custom loader with ESM support
- Expanded default language support to 20+ languages (CSS, SCSS, Less, Vue, Svelte, HTML, Markdown, XML, etc.)

### History (pre-1.0)

Key milestones from the original fork (v0.20.4 – v0.57.0):

- v0.52.0: Added auto-fix on save
- v0.52.4: Added `useLocal` option for project-local stylelint
- v0.53.0: Added `disableErrorMessage` option
- v0.56.0: Added status bar indicator
- v0.57.0: Upgraded bundled stylelint to v15 and added v16 support
