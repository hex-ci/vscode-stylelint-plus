# 重构与测试覆盖率提升方案

本方案旨在重构 `src/server.js` 和 `src/index.js`，将逻辑封装在可测试的类中，从而允许编写更直接、更全面的单元测试，同时不改变现有功能或引入新的运行时依赖。

## 1. Server 端重构 (`src/server.js`)

目前 `server.js` 的主要逻辑虽然在 `StylelintServer` 类中，但事件绑定和服务器启动逻辑散落在全局作用域，导致测试必须通过 mock `createConnection` 的副作用来间接测试。

### 修改方案

1.  **扩展 `StylelintServer` 类**：
    将所有的 `connection.on...` 和 `documents.on...` 事件绑定逻辑移入 `StylelintServer` 类的新方法 `start()` 或 `registerHandlers()` 中。
2.  **条件启动**：
    仅当文件作为主模块运行（`require.main === module`）时，才执行实例化和启动逻辑。这允许测试文件 `require` 该模块而不触发副作用。

### 拟定代码结构

```javascript
// ... imports ...

class StylelintServer {
  constructor(connection, documents) {
    this.connection = connection;
    this.documents = documents;
    // ... state initialization ...
  }

  // 新增：集中管理事件绑定
  start() {
    this.registerConnectionHandlers();
    this.registerDocumentHandlers();
    this.documents.listen(this.connection);
    this.connection.listen();
  }

  registerConnectionHandlers() {
    this.connection.onCodeAction(this.handleCodeAction.bind(this));
    this.connection.onRequest('stylelint/executeAutofix', this.handleExecuteAutofix.bind(this));
    this.connection.onInitialize(this.handleInitialize.bind(this));
    this.connection.onDidChangeConfiguration(this.handleDidChangeConfiguration.bind(this));
    // ... 其他 handlers
  }

  registerDocumentHandlers() {
    this.documents.onDidChangeContent(this.handleDidChangeContent.bind(this));
    // ... 其他 handlers
  }

  // 将原来的匿名回调转换为方法，方便单独测试
  async handleCodeAction(params) { /* ... */ }
  async handleExecuteAutofix(params) { /* ... */ }
  handleInitialize() { /* ... */ }
  // ... 其他方法
}

// 导出类，方便测试直接实例化
exports.StylelintServer = StylelintServer;

// 仅在直接运行时启动服务器
if (require.main === module) {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments();
  const server = new StylelintServer(connection, documents);
  server.start();
}
```

### 测试优势

*   **直接实例化**：测试可以直接 `new StylelintServer(mockConnection, mockDocuments)`。
*   **直接调用 handler**：可以直接调用 `server.handleDidChangeContent(...)` 来测试验证逻辑，而不需要通过 mock 的 connection 触发事件。
*   **状态检查**：可以直接检查 `server.documentDiagnostics` 或 `server.config` 等内部状态，验证逻辑是否正确。

## 2. Client 端重构 (`src/index.js`)

目前 `index.js` 使用模块级变量 (`client`, `statusBarItem`) 存储状态。这使得测试很难在不重新加载模块的情况下重置状态。

### 修改方案

1.  **封装 `StylelintExtension` 类**：
    将 `activate`, `deactivate` 以及所有辅助函数（如 `setStatusBar`）封装到一个类中。
2.  **导出实例与类**：
    保持 `exports.activate` 和 `exports.deactivate` 的签名不变，以便 VS Code 调用，但内部代理到类实例的方法。

### 拟定代码结构

```javascript
// ... imports ...

class StylelintExtension {
  constructor() {
    this.client = null;
    this.statusBarItem = null;
    this.versionInfo = { version: null, isLocal: false };
    // ... 其他状态
  }

  activate(context) {
    const { subscriptions } = context;
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1);
    subscriptions.push(this.statusBarItem);

    // ... client 创建逻辑 ...
    // this.client = new LanguageClient(...)

    // ... 注册命令 ...
  }

  async deactivate() {
    if (this.client) {
      await this.client.stop();
    }
  }

  setStatusBar(status = 'ok') {
    // ... 使用 this.statusBarItem ...
  }

  // ... 其他方法
}

// 导出类以便测试
exports.StylelintExtension = StylelintExtension;

// 创建默认实例
const extension = new StylelintExtension();

// 保持 VS Code 接口兼容
exports.activate = extension.activate.bind(extension);
exports.deactivate = extension.deactivate.bind(extension);
```

### 测试优势

*   **隔离性**：每个测试用例可以 `new StylelintExtension()`，拥有完全独立的状态，互不干扰。
*   **可访问性**：测试可以轻松访问 `extension.client` 或 `extension.statusBarItem` 来验证它们的状态，而不需要通过 mock 的副作用来推断。

## 3. 实施步骤

1.  **备份**：确保当前所有测试通过。
2.  **重构 `src/server.js`**：
    *   提取 `StylelintServer` 类导出。
    *   将事件监听代码移入类方法。
    *   添加 `if (require.main === module)` 判断。
3.  **重构 `src/index.js`**：
    *   创建 `StylelintExtension` 类。
    *   将状态和逻辑移入类中。
    *   调整导出以保持兼容。
4.  **更新测试**：
    *   虽然现有的 `proxyquire` 测试应该大体还能工作（因为我们保留了外部接口），但建议逐步迁移到直接实例化类的测试方式，以利用新架构的优势。
    *   对于 `src/server.js`，更新 `test/unit/server.test.js`，移除对 `proxyquire` 的部分依赖，改为直接测试 `StylelintServer` 实例的方法。

## 4. 预期成果

*   **更高的可测试性**：核心逻辑不再隐藏在闭包或模块作用域中。
*   **更稳健的测试**：减少对 `proxyquire` 和复杂的 mock 设置的依赖。
*   **覆盖率提升**：能够轻松构造各种边缘情况的输入直接调用处理函数，从而覆盖以前难以触及的分支。
*   **代码质量**：通过类封装，代码结构更清晰，职责更明确。
