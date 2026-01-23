// ESLint 9.x flat config for VS Code extension
// https://eslint.org/docs/latest/use/configure/configuration-files-new

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      '*.min.js',
      'coverage/**',
      '.vscode-test/**'
    ]
  },

  {
    files: ['**/*.js'],
    ignores: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly'
      }
    },
    rules: {
      'indent': ['error', 2, { SwitchCase: 1 }],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      'comma-dangle': ['error', 'never'],

      'no-unused-vars': ['error', {
        args: 'all',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-undef': 'error',
      'no-console': 'off',
      'no-debugger': 'error',

      'no-cond-assign': ['error', 'except-parens'],

      'no-new-func': 'off',

      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-arrow-callback': 'off',
      'prefer-template': 'off'
    }
  },

  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    }
  }
];
