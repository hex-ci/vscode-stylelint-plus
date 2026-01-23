// ESLint 9.x flat config for VS Code extension
// https://eslint.org/docs/latest/use/configure/configuration-files-new

module.exports = [
  // 全局配置
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

  // 主要配置
  {
    files: ['**/*.js'],
    ignores: ['eslint.config.js', 'stylelint.config.js'], // 排除配置文件
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js 全局变量
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
      // 代码风格
      'indent': ['error', 2, { SwitchCase: 1 }],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      'comma-dangle': ['error', 'never'],

      // 代码质量
      'no-unused-vars': ['error', {
        args: 'all',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-undef': 'error',
      'no-console': 'off', // VS Code 扩展需要 console
      'no-debugger': 'error',

      // 允许赋值表达式在条件中使用（项目现有代码风格）
      'no-cond-assign': ['error', 'except-parens'],

      // 允许使用 Function 构造函数（用于动态 import workaround）
      'no-new-func': 'off',

      // 现代 JavaScript 特性
      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-arrow-callback': 'off', // 项目使用传统函数
      'prefer-template': 'off'
    }
  },

  // 测试文件特殊配置
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
