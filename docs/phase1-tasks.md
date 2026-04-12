# Taix — Phase 1 任务清单

> 版本：v0.1  
> 日期：2026-04-12  
> 依赖文档：[architecture.md](./architecture.md)

---

## 说明

每个任务满足以下三个条件：
1. **可独立实现** — 不需要同时动多个文件
2. **有明确验收条件** — 编译通过 / 测试通过 / 界面可见效果
3. **失败可回滚** — 出问题最多撤销一个任务的改动

**必须按序的关键依赖链：**

```
A1 → A2 → A3 → A4
               ↓
    B1 → B2 → B3 → B4
               ↓
    C1 → C2 → C3 → C4 → C5
                         ↓
               D1 → D2 → D3
                          ↓
    E1 → E2 → E4 → F1 → F3 → G1
```

---

## 模块 A — 项目脚手架

### A1 — 初始化 Tauri 2 项目骨架

- 用 `cargo tauri init` 创建项目，选择 Vite + React + TypeScript 前端模板
- 确认 `src-tauri/` 和 `src/` 目录结构生成正确
- 配置 `package.json` 的项目名称、版本为 `taix` / `0.1.0`

**验收：** `npm run tauri dev` 能成功打开空白 Tauri 窗口，无编译报错

---

### A2 — 配置 Tailwind CSS + ESLint + Prettier

- 安装并配置 Tailwind CSS 4.x（Vite 插件模式）
- 安装 ESLint（typescript-eslint）+ Prettier，添加 `.eslintrc.json` 和 `.prettierrc`
- 添加 `.vscode/settings.json`：保存时自动格式化、ESLint fix
- 在 `package.json` 添加 `lint`、`lint:fix`、`type-check` 脚本

**验收：** `npm run lint` 无报错；修改文件保存后自动格式化

---

### A3 — 配置 Tauri Capabilities

- 编辑 `src-tauri/capabilities/default.json`
- 只保留必要权限：`core:window:allow-*`、`core:event:allow-*`、后续需要的 `fs` 权限
- 关闭不必要的默认权限（如 `core:window:allow-create`、shell 执行等在此阶段不需要的）

**验收：** `npm run tauri build` 构建时无 capability 相关警告

---

### A4 — 配置 tauri-specta 类型自动生成

- 在 `Cargo.toml` 添加 `specta`、`tauri-specta` 依赖（features: `derive`, `typescript`）
- 在 `main.rs` 配置 specta 导出，指定输出路径为 `../src/types/bindings.ts`
- 创建 `src/types/` 目录，加 `bindings.ts`（初始为空占位，构建时覆盖）
- 在 `bindings.ts` 文件头加注释 `// This file is auto-generated. Do not edit.`

**验收：** `cargo build` 后 `src/types/bindings.ts` 自动生成，内容非空

---

## 模块 B — Rust 后端基础设施

### B1 — 实现 `error.rs`：统一错误类型

- 创建 `src-tauri/src/error.rs`
- 定义 `AppError` 枚举，变体包括：`Pty`、`SessionNotFound`、`Database`、`AiProvider`、`Io`、`Config`
- 引入 `thiserror` crate，每个变体标注 `#[error("...")]`
- 实现 `From<std::io::Error>`、`From<rusqlite::Error>` 自动转换
- 实现 `serde::Serialize`（Tauri command 要求错误类型可序列化）

**验收：** `cargo check` 通过；`error.rs` 单元测试：各变体能正确显示错误信息

---

### B2 — 实现 `state.rs`：全局应用状态

- 创建 `src-tauri/src/state.rs`
- 定义 `AppState` 结构体，字段包括：
  - `pty_manager: Arc<PtyManager>`（占位类型，C4 实现后替换）
  - `db: Arc<Database>`（占位类型，后续存储模块实现）
  - `config: Arc<RwLock<AppConfig>>`
- 在 `main.rs` 的 `tauri::Builder` 中注册 `.manage(AppState::new())`

**验收：** `cargo check` 通过；`AppState` 能注入到 Tauri command 的参数中

---

### B3 — 实现 `config/schema.rs`：配置结构体

- 创建 `src-tauri/src/config/` 目录
- 在 `schema.rs` 定义以下结构体，均加 `serde::Serialize/Deserialize`：
  ```
  AppConfig
  ├── AppearanceConfig { theme, font_family, font_size, opacity }
  ├── ShellConfig { default_shell: Option<PathBuf>, args: Vec<String>, env: HashMap }
  └── AiConfig { provider, model, api_key, ollama_base_url, default_mode }
  ```
- 为所有结构体实现 `Default` trait，提供合理的默认值
- 加 `#[derive(specta::Type)]` 为后续类型生成做准备

**验收：** 单元测试：`AppConfig::default()` 序列化为 TOML 后能反序列化回原始值（往返测试）

---

### B4 — 实现 `config/mod.rs`：配置文件读写

- 实现 `ConfigManager`：
  - `load() -> Result<AppConfig, AppError>`：读取配置文件，不存在时返回 `AppConfig::default()` 并创建文件
  - `save(config: &AppConfig) -> Result<(), AppError>`：写入配置文件
  - `config_path() -> PathBuf`：用 `dirs::config_dir()` 获取平台配置目录，返回 `taix/config.toml` 路径
- 确保父目录不存在时自动创建（`std::fs::create_dir_all`）

**验收：** 单元测试：使用 `tempfile` crate 创建临时目录，验证写入/读取/默认值三个场景

---

## 模块 C — PTY 核心

### C1 — 添加 PTY 相关 Crate 依赖

在 `Cargo.toml` 中添加以下依赖，确认版本并执行 `cargo fetch`：

```toml
portable-pty = "0.8"
tokio = { version = "1", features = ["full"] }
dashmap = "6"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

**验收：** `cargo check` 通过，无依赖解析报错

---

### C2 — 实现 `pty/platform.rs`：默认 Shell 检测

- 创建 `src-tauri/src/pty/` 目录
- 实现 `detect_default_shell() -> PathBuf`：
  - macOS / Linux：读取 `$SHELL` 环境变量；若未设置，回退到 `/bin/sh`
  - Windows：按顺序查找 `%COMSPEC%`（通常是 `cmd.exe`），回退到 `C:\Windows\System32\cmd.exe`
- 使用 `#[cfg(target_os = "windows")]` / `#[cfg(unix)]` 条件编译

**验收：** 单元测试：在当前平台运行，返回的路径存在于文件系统中

---

### C3 — 实现 `pty/session.rs`：单个 PTY 会话

- 定义 `SessionId`（`String` 类型别名，UUID v4）
- 定义 `PtySession` 结构体：
  - `id: SessionId`
  - `writer: Box<dyn Write + Send>`（PTY master 写端）
  - `child: Box<dyn portable_pty::Child + Send>`
  - `created_at: chrono::DateTime<Utc>`
- 实现 `PtySession::spawn(config: &LocalShellConfig, app_handle: AppHandle) -> Result<Self, AppError>`：
  1. `native_pty_system().openpty(initial_size)`
  2. 构建 `CommandBuilder`，设置 shell、env、cwd
  3. `pty_pair.slave.spawn_command(cmd)`
  4. 启动 reader tokio task：循环 `read()` → `app_handle.emit("pty://output/{id}", data)`
  5. 启动 exit watcher task：`child.wait()` → `app_handle.emit("pty://exit/{id}", ())`
- 实现 `PtySession::write(&mut self, data: &[u8]) -> Result<(), AppError>`
- 实现 `PtySession::resize(&self, rows: u16, cols: u16) -> Result<(), AppError>`
- 实现 `PtySession::kill(&mut self) -> Result<(), AppError>`

**验收：** 集成测试：在 Unix 系统上，spawn `echo hello && exit`，reader task 应收到含 "hello" 的输出，随后收到 exit 事件

---

### C4 — 实现 `pty/manager.rs`：多会话管理

- 定义 `PtyManager` 结构体，核心字段 `sessions: DashMap<SessionId, Arc<Mutex<PtySession>>>`
- 实现以下方法：
  - `create_session(config, app_handle) -> Result<SessionId, AppError>`
  - `write_to_session(id, data) -> Result<(), AppError>`：找到 session，调用 `write()`
  - `resize_session(id, rows, cols) -> Result<(), AppError>`
  - `close_session(id) -> Result<(), AppError>`：kill 进程，从 DashMap 删除
  - `list_active() -> Vec<SessionId>`
- 将 `PtyManager` 集成到 `AppState`（替换 B2 中的占位类型）

**验收：** 集成测试：创建 2 个 session，向各自写入不同内容，验证输出互不干扰；关闭一个，另一个正常工作

---

### C5 — 验证 PTY Resize 端到端

> C3 已实现 `resize()` 方法，本任务验证其在完整链路中的正确性

- 编写集成测试：
  1. spawn 一个 shell session
  2. 调用 `resize_session(id, 30, 100)`
  3. 向 session 写入 `stty size\n`
  4. 收集输出，断言包含 `"30 100"`
- 如测试失败，排查 `portable-pty` resize API 调用顺序问题

**验收：** 上述集成测试在 macOS 和 Linux 上通过

---

## 模块 D — Tauri IPC 命令层

### D1 — 实现 `commands/pty.rs`

- 创建 `src-tauri/src/commands/pty.rs`
- 实现以下 `#[tauri::command]` 函数，均通过 `State<AppState>` 委托到 `PtyManager`：
  ```rust
  async fn pty_create(state, config: SessionConfig) -> Result<SessionId, AppError>
  async fn pty_write(state, session_id: SessionId, data: String) -> Result<(), AppError>
  async fn pty_resize(state, session_id: SessionId, rows: u16, cols: u16) -> Result<(), AppError>
  async fn pty_close(state, session_id: SessionId) -> Result<(), AppError>
  async fn pty_list_active(state) -> Result<Vec<SessionId>, AppError>
  ```
- 在 `main.rs` 的 `.invoke_handler(tauri::generate_handler![...])` 中注册所有命令

**验收：** `cargo check` 通过；所有命令已注册，命令名称与架构文档一致

---

### D2 — 实现 `commands/config.rs`

- 创建 `src-tauri/src/commands/config.rs`
- 实现：
  ```rust
  async fn config_get(state) -> Result<AppConfig, AppError>
  async fn config_set(state, config: AppConfig) -> Result<(), AppError>
  ```
- 注册到 `main.rs`

**验收：** `cargo check` 通过

---

### D3 — 完整 IPC 类型生成

- 确保所有需要跨越 IPC 边界的结构体都标注了 `#[derive(specta::Type)]`：
  - `SessionId`、`SessionConfig`、`LocalShellConfig`、`SshConfig`
  - `AppConfig` 及其子结构体
  - `AppError`
- 执行 `cargo build`，检查 `src/types/bindings.ts` 中是否包含所有预期类型
- 修复生成文件中的任何类型问题

**验收：** `bindings.ts` 包含至少：`SessionId`、`SessionConfig`、`AppConfig`、`AiMode`；TypeScript `tsc --noEmit` 对该文件无报错

---

## 模块 E — 前端基础层

### E1 — 安装前端依赖包

```bash
npm install xterm @xterm/addon-fit @xterm/addon-search @xterm/addon-web-links
npm install zustand
npm install @tauri-apps/api
npm install -D @types/node
```

**验收：** `npm install` 无报错；`package.json` dependencies 更新

---

### E2 — 实现 `services/pty.ts`

- 创建 `src/services/pty.ts`
- 封装所有 PTY 相关 `invoke` 调用，使用 `bindings.ts` 中的类型：
  ```typescript
  export async function ptyCreate(config: SessionConfig): Promise<SessionId>
  export async function ptyWrite(sessionId: SessionId, data: string): Promise<void>
  export async function ptyResize(sessionId: SessionId, rows: number, cols: number): Promise<void>
  export async function ptyClose(sessionId: SessionId): Promise<void>
  export async function ptyListActive(): Promise<SessionId[]>
  ```
- 统一错误处理：捕获 Tauri invoke 错误，转成 `Error` 抛出

**验收：** TypeScript 编译通过，函数签名与后端命令一一对应

---

### E3 — 实现 `services/config.ts`

- 创建 `src/services/config.ts`
- 封装：
  ```typescript
  export async function configGet(): Promise<AppConfig>
  export async function configSet(config: Partial<AppConfig>): Promise<void>
  ```

**验收：** TypeScript 编译通过

---

### E4 — 实现 `stores/sessionStore.ts`

- 创建 `src/stores/sessionStore.ts`，使用 Zustand
- 定义 `Session` 前端类型（含 `id`、`title`、`isActive` 等字段）
- State：`sessions: Session[]`、`activeSessionId: string | null`
- Actions：
  - `createSession(config)`: 调用 `ptyCreate()` → 添加到 sessions 列表
  - `closeSession(id)`: 调用 `ptyClose()` → 从列表删除
  - `setActiveSession(id)`: 更新 `activeSessionId`
  - `updateSessionTitle(id, title)`: 更新标题（用于 OSC 标题变化）

**验收：** 单元测试（vitest）：`createSession` 后列表长度 +1；`closeSession` 后列表长度 -1

---

### E5 — 实现 `stores/uiStore.ts`

- State：`sidebarOpen: boolean`（默认 `true`）
- Actions：`toggleSidebar()`、`setSidebarOpen(open: boolean)`

**验收：** TypeScript 编译通过

---

### E6 — 实现 `stores/settingsStore.ts`

- State：从 `AppConfig` 映射的前端配置（`theme`、`fontFamily`、`fontSize`）
- Actions：
  - `loadSettings()`: 调用 `configGet()` 初始化 store
  - `updateAppearance(partial)`: 更新后调用 `configSet()` 持久化
  - `updateShell(config)`: 同上

**验收：** TypeScript 编译通过

---

## 模块 F — 终端核心组件

### F1 — 实现 `hooks/useTerminal.ts`

- 接受参数：`sessionId: string`、`containerRef: RefObject<HTMLDivElement>`
- 内部逻辑：
  1. 创建 `Terminal` 实例，配置字体、主题（从 settingsStore 读取）
  2. `terminal.open(containerRef.current)`
  3. `fitAddon.fit()`
  4. `terminal.onData(data => ptyWrite(sessionId, data))`
  5. 注册 `listen("pty://output/{sessionId}", e => terminal.write(e.payload))`
  6. 注册 `listen("pty://exit/{sessionId}", () => terminal.writeln("\r\n[Process exited]"))`
  7. 返回 `{ terminal, fitAddon }`
  8. cleanup（`useEffect` return）：取消 event 监听，`terminal.dispose()`

**验收：** Hook 能正确管理 xterm.js 生命周期（无 console 报错，无内存泄漏警告）

---

### F2 — 实现 `hooks/useResize.ts`

- 接受参数：`containerRef`、`fitAddon`、`sessionId`
- 内部逻辑：
  1. 创建 `ResizeObserver`，观察 `containerRef.current`
  2. 回调内：debounce 50ms，调用 `fitAddon.fit()`
  3. fit 完成后，读取 `terminal.cols` 和 `terminal.rows`
  4. 调用 `ptyResize(sessionId, rows, cols)`
- cleanup：`observer.disconnect()`

**验收：** 拖拽窗口边缘，终端内 `stty size` 输出随之变化（无滞后超过 100ms）

---

### F3 — 实现 `components/terminal/TerminalTab.tsx`

- Props：`sessionId: string`、`isActive: boolean`
- 内部使用 `useTerminal` + `useResize`
- 容器 div：`isActive` 为 `false` 时加 `className="hidden"`（CSS `display:none`）
- 首次 `isActive` 变为 `true` 时调用 `fitAddon.fit()`（因之前隐藏时无法计算尺寸）

**验收：** 在 `App.tsx` 中硬编码创建一个 session，`TerminalTab` 能正常渲染，输入输出正常

---

### F4 — 实现 Tab 切换保活策略

- 在 `App.tsx` 或 `TerminalPane.tsx` 中渲染**所有** session 对应的 `TerminalTab`
- 通过 `isActive` prop 控制显示隐藏，而不是条件渲染（`{condition && <Tab/>}`）
- 切换时对新激活的 Tab 触发一次 `resize`/`fit`（因为隐藏时无法自动 fit）

**验收：**
- 先在 Tab A 中运行 `top`，切换到 Tab B 后再切换回 Tab A，`top` 仍在运行且界面正确
- 切换时无 xterm.js 实例被销毁重建（可通过 console 日志验证）

---

### F5 — 实现 `components/terminal/TabBar.tsx`

- 从 `sessionStore` 读取 `sessions` 和 `activeSessionId`
- 渲染每个 Tab：显示 session 标题，active 状态高亮
- "+" 按钮：调用 `sessionStore.createSession` 创建新 session（使用默认 shell config）
- "×" 按钮：调用 `sessionStore.closeSession`
- Tab 点击：调用 `sessionStore.setActiveSession`

**验收：** 能通过点击"+"新建多个 Tab，每个 Tab 有独立的终端实例，切换正常

---

## 模块 G — 应用布局与 UI

### G1 — 实现 `components/layout/AppLayout.tsx`

- 整体布局：Flex row，左侧 `Sidebar`（固定宽度，可折叠）+ 右侧主区域（flex 1）
- 右侧主区域：Flex column，上方 `TabBar` + 下方 `TerminalPane`（flex 1）
- 侧边栏折叠用 CSS transition（`width: 0` + `overflow: hidden`）实现平滑动画
- 集成 `uiStore` 的 `sidebarOpen` 状态

**验收：** 窗口 resize 时布局不变形；侧边栏折叠展开动画正常；终端区域充满剩余空间

---

### G2 — 实现 `components/session/SessionList.tsx` + `SessionItem.tsx`

- `SessionList`：从后端加载 saved sessions（Phase 1 先用空列表或 hardcode），显示列表
- `SessionItem`：单条记录，显示名称和类型图标（本地 / SSH）
- 点击 `SessionItem`：调用 `sessionStore.createSession` 新建对应 Tab
- 列表底部放"新建本地终端"快捷按钮

**验收：** 侧边栏中能看到会话列表，点击能正确新建 Tab

---

### G3 — 实现 `components/layout/StatusBar.tsx`

- 固定在窗口最底部，高度 24px
- 显示内容：
  - 左侧：active session 的 shell 名称（如 `zsh`）和当前工作目录
  - 右侧：当前主题名称、终端尺寸（如 `220×50`）

**验收：** 切换 Tab 时状态栏内容正确更新

---

### G4 — 实现深色 / 浅色主题切换

- Tailwind CSS 4 的 dark mode 设置为 `class` 模式
- 在 `settingsStore` 中存储 `theme: "dark" | "light" | "system"`
- 根据 theme 值在 `<html>` 或 `<body>` 上切换 `dark` class
- 定义 xterm.js 的 `ITheme` 对象，分深浅两套颜色方案
- `settingsStore` 的 `theme` 变化时，更新所有 xterm.js 实例的 `options.theme`

**验收：** 切换主题后，Tailwind UI 组件和终端内的颜色同步变化

---

## 模块 H — 配置界面

### H1 — 实现 `components/settings/SettingsModal.tsx` 骨架

- 通过键盘快捷键（`Cmd/Ctrl + ,`）或点击状态栏图标打开
- 使用 Tauri 的 dialog 或自实现全屏遮罩模态框
- 左侧 Tab 导航（外观 / Shell / AI（禁用，Phase 3））
- 右侧内容区，根据左侧选择渲染对应设置页

**验收：** 快捷键能打开/关闭设置面板，Tab 切换正常

---

### H2 — 实现 `AppearanceSettings.tsx`

- 字体族：文本输入框，修改后实时更新所有 xterm.js 实例
- 字体大小：数字输入（12-24），修改后实时更新
- 主题：下拉选择（Dark / Light / System）
- 每次修改调用 `settingsStore.updateAppearance()` 持久化

**验收：** 修改字体大小，终端内字体立即变化；重启应用后设置保留

---

### H3 — 实现 `ShellSettings.tsx`

- Default Shell：文本输入框，显示当前配置的 shell 路径
- 提供"检测系统默认"按钮，调用后端获取平台默认 shell 并填入
- 保存按钮：调用 `settingsStore.updateShell()` 持久化

**验收：** 修改 shell 路径并保存，新建 Tab 时使用新配置的 shell；重启后设置保留

---

## 模块 I — 打包与 CI

### I1 — 配置 `tauri.conf.json` 打包选项

- `productName`：`"Taix"`
- `version`：`"0.1.0"`
- 窗口配置：初始尺寸 1200×800，最小尺寸 800×500，`decorations: true`
- 图标：先用 Tauri 默认图标占位
- macOS bundle：设置 `identifier` 为 `"com.taix.app"`
- Windows bundle：NSIS 安装包
- Linux bundle：AppImage

**验收：** `npm run tauri build` 在本地平台成功产出可运行的安装包

---

### I2 — 编写 CI Workflow

- 文件路径：`.github/workflows/ci.yml`
- 触发条件：PR 到 `main`/`dev` 分支，或直接推送
- 并行 job：
  - `test-rust`（ubuntu-latest）：`cargo test --all`
  - `test-frontend`（ubuntu-latest）：`npm run type-check` + `npm run lint`
- 缓存：Rust target 目录、npm node_modules

**验收：** YAML 语法正确（可用 `act` 本地验证语法），逻辑符合预期

---

### I3 — 编写 Release Workflow

- 文件路径：`.github/workflows/release.yml`
- 触发条件：推送 `v*` tag（如 `v0.1.0`）
- 三平台并行构建 job（`matrix`）：
  - `ubuntu-latest`：生成 `.AppImage` + `.deb`
  - `macos-latest`：生成 `.dmg`
  - `windows-latest`：生成 `.exe`（NSIS）
- 产物上传到 GitHub Release（使用 `tauri-action`）

**验收：** YAML 语法正确，`tauri-action` 版本固定（防止随机更新破坏构建）

---

## 进度跟踪

| 模块 | 任务数 | 状态 |
|---|---|---|
| A — 项目脚手架 | 4 | ⬜ 未开始 |
| B — Rust 基础设施 | 4 | ⬜ 未开始 |
| C — PTY 核心 | 5 | ⬜ 未开始 |
| D — IPC 命令层 | 3 | ⬜ 未开始 |
| E — 前端基础层 | 6 | ⬜ 未开始 |
| F — 终端核心组件 | 5 | ⬜ 未开始 |
| G — 布局与 UI | 4 | ⬜ 未开始 |
| H — 配置界面 | 3 | ⬜ 未开始 |
| I — 打包与 CI | 3 | ⬜ 未开始 |
| **合计** | **37** | |
