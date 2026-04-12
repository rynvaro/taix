# Taix — Phase 2 任务清单

> 版本：v0.1  
> 日期：2026-04-12  
> 依赖文档：[architecture.md](./architecture.md)、[phase1-tasks.md](./phase1-tasks.md)

---

## 说明

Phase 2 目标：**会话管理**——让用户能保存、恢复、分屏使用终端，并支持 SSH 连接。

包含以下内容：
- **补齐 Phase 1 推迟任务**：SQLite 数据库层、会话持久化
- **新功能**：分屏布局、SSH Profile、终端内搜索、会话分组、OSC 标题更新

每个任务满足：
1. **可独立实现** — 不需要同时动多个文件
2. **有明确验收条件** — 编译通过 / 测试通过 / 界面可见效果
3. **失败可回滚** — 出问题最多撤销一个任务的改动

**关键依赖链：**

```
A1 → A2 → A3 → A4
               ↓
    B1 → B2 → B3 → B4
               ↓
               C1 → C2 → C3
               ↓
               D1 → D2 → D3 → D4
                              ↓
               E1 → E2 → E3 → E4 → E5
               ↓
    F1 → F2 → F3 → F4
               ↓
    G1 → G2 → G3
               ↓
    H1 → H2 → H3 → H4
```

---

## 补档说明：Phase 1 推迟任务

以下两项在 Phase 1 决定推迟，现在正式纳入 Phase 2：

| 原任务 | 对应 Phase 2 模块 |
|---|---|
| SQLite schema 和 migration 系统 | 模块 A —— SQLite 基础设施 |
| 会话配置的保存和加载（SavedSession） | 模块 B —— Session 持久化前端 |

---

## 模块 A — SQLite 基础设施（Phase 1 推迟）

### A1 — 添加 rusqlite 依赖

在 `Cargo.toml` 中添加：

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
```

`bundled` feature 将 SQLite 静态编译进二进制，避免三平台 SQLite 版本差异。

**验收：** `cargo check` 通过，无依赖冲突

---

### A2 — 实现 `storage/db.rs`：连接池与 Migration 系统

- 创建 `src-tauri/src/storage/` 目录
- 定义 `Database` 结构体，内部持有 `Mutex<rusqlite::Connection>`
- 实现 `Database::open(path: &Path) -> Result<Self, AppError>`：
  1. `rusqlite::Connection::open(path)`
  2. 开启 WAL 模式：`PRAGMA journal_mode = WAL`
  3. 开启外键约束：`PRAGMA foreign_keys = ON`
  4. 调用 `run_migrations()`
- 实现 migration 系统：
  - 维护一个有序的 `static MIGRATIONS: &[&str]` 数组（每条为完整 SQL）
  - 首次运行时创建 `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)` 表
  - 查询已执行的最大 version，依次执行尚未执行的 migration
- Migration 包含以下三张表（见架构文档 §5.1）：
  ```sql
  -- Migration 1
  CREATE TABLE saved_sessions (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      session_type TEXT NOT NULL,
      config       TEXT NOT NULL,
      group_id     TEXT,
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
  );
  -- Migration 2
  CREATE TABLE session_groups (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      color      TEXT,
      sort_order INTEGER DEFAULT 0
  );
  ```

**验收：** 单元测试：使用 `:memory:` 数据库，验证 migration 幂等性（执行两次不报错，表只创建一次）

---

### A3 — 实现 `storage/session_repo.rs`：SavedSession CRUD

- 定义 Rust 结构体 `SavedSession`（`#[derive(Serialize, Deserialize, specta::Type)]`）：
  ```rust
  pub struct SavedSession {
      pub id: String,          // UUID
      pub name: String,
      pub session_type: String, // "local" | "ssh"
      pub config: String,       // JSON 序列化的 SessionConfig
      pub group_id: Option<String>,
      pub sort_order: i64,
      pub created_at: String,
      pub updated_at: String,
  }
  ```
- 实现以下方法（操作 `Database`）：
  - `list_sessions(db) -> Result<Vec<SavedSession>, AppError>`
  - `get_session(db, id) -> Result<Option<SavedSession>, AppError>`
  - `save_session(db, session) -> Result<(), AppError>`：UPSERT（`INSERT OR REPLACE`）
  - `delete_session(db, id) -> Result<(), AppError>`
  - `reorder_sessions(db, ids: Vec<String>) -> Result<(), AppError>`：批量更新 `sort_order`

**验收：** 单元测试：使用 `:memory:` 数据库，验证每个 CRUD 操作的 happy path + 删不存在项不报错

---

### A4 — 集成 Database 到 AppState

- 在 `state.rs` 中将 `db: Arc<Database>` 从占位替换为真实实现
- 在 `lib.rs` 的 `run()` 函数中：
  1. 确定 DB 路径：与 `config.toml` 同目录的 `taix.db`
  2. `Database::open(&db_path)?`
  3. 将 `db` 传入 `AppState::new(config, db)`
- 更新 `AppState::new()` 签名

**验收：** `cargo check` 通过；应用启动后，配置目录下出现 `taix.db` 文件

---

## 模块 B — Session 持久化前端（Phase 1 推迟）

### B1 — 实现 Rust 命令：`commands/sessions.rs`

- 创建 `src-tauri/src/commands/sessions.rs`
- 实现以下 `#[tauri::command]` 函数：
  ```rust
  fn sessions_list(state) -> Result<Vec<SavedSession>, AppError>
  fn sessions_get(state, id: String) -> Result<Option<SavedSession>, AppError>
  fn sessions_save(state, session: SavedSession) -> Result<(), AppError>
  fn sessions_delete(state, id: String) -> Result<(), AppError>
  fn sessions_reorder(state, ids: Vec<String>) -> Result<(), AppError>
  ```
- 在 `lib.rs` 中注册到 specta builder 和 invoke handler

**验收：** `cargo check` 通过；`bindings.ts` 重新生成后包含 `sessions_list` 等函数和 `SavedSession` 类型

---

### B2 — 实现 `services/sessions.ts`

- 创建 `src/services/sessions.ts`
- 封装所有会话持久化 `invoke` 调用，使用 `bindings.ts` 中的类型：
  ```typescript
  export async function sessionsList(): Promise<SavedSession[]>
  export async function sessionsGet(id: string): Promise<SavedSession | null>
  export async function sessionsSave(session: SavedSession): Promise<void>
  export async function sessionsDelete(id: string): Promise<void>
  export async function sessionsReorder(ids: string[]): Promise<void>
  ```

**验收：** TypeScript 编译通过

---

### B3 — 扩展 `stores/sessionStore.ts`：保存会话

- 在 `sessionStore` 中新增：
  - State：`savedSessions: SavedSession[]`
  - Actions：
    - `loadSavedSessions()`: 调用 `sessionsList()` 初始化
    - `saveCurrentSession(name: string)`: 将当前活跃会话保存到 DB
    - `deleteSavedSession(id: string)`: 调用 `sessionsDelete()`，更新本地列表
    - `restoreSession(saved: SavedSession)`: 根据 `saved.config` 调用 `createSession()`

**验收：** 单元测试（vitest）：`mock` sessions 服务，验证 `loadSavedSessions` 后 `savedSessions` 正确填充

---

### B4 — 更新 `SessionList.tsx`：显示并操作持久化会话

- 改造 `SessionList`：`savedSessions` 替代之前的硬编码占位列表
- 每个 `SessionItem` 显示：名称、类型图标（本地终端 / SSH）、时间戳
- 右键菜单（或点击 `⋯`）：「打开」「重命名」「删除」
- 底部固定"新建本地终端"按钮（不保存直接打开）
- 应用启动时（`App.tsx`）调用 `loadSavedSessions()`

**验收：** 新建一个终端 → 通过右键"保存会话"命名 → 重启应用后，左侧列表中出现该会话 → 点击能重新打开

---

## 模块 C — 会话分组

### C1 — 实现 `storage/group_repo.rs`：分组 CRUD

- 定义 `SessionGroup` 结构体（`id`, `name`, `color`, `sort_order`），添加 `specta::Type`
- 实现：
  - `list_groups(db)`
  - `create_group(db, name, color)`
  - `delete_group(db, id)`：同时将该分组下的会话 `group_id` 置 null
- 在 `commands/sessions.rs` 中新增对应 Tauri 命令并注册

**验收：** 单元测试：创建分组、将会话移入分组、删除分组后会话 `group_id` 为 null

---

### C2 — 前端分组 Store 与 Service

- `src/services/sessions.ts` 新增 3 个分组 API wrapper（`groupsList`、`groupCreate`、`groupDelete`）
- `store/sessionStore.ts` 新增：
  - State：`groups: SessionGroup[]`
  - Actions：`loadGroups()`、`createGroup(name, color)`、`deleteGroup(id)`、`moveSessionToGroup(sessionId, groupId)`

**验收：** TypeScript 编译通过

---

### C3 — 侧边栏分组 UI

- 改造 `SessionList.tsx`：会话按 `group_id` 分组，每组显示折叠/展开标题
- 支持将会话拖入不同分组（使用 HTML5 drag-and-drop，不引入额外 DnD 库）
- 分组支持右键「重命名」「删除」，删除后该组会话移回未分组区

**验收：** 拖拽一个会话从未分组区移入某分组后，刷新页面，分组归属保留

---

## 模块 D — SSH Profile

### D1 — 扩展 Rust 类型：`SshConfig` + `SshAuth`

- 在 `config/schema.rs` 或新文件中添加（均加 `specta::Type`）：
  ```rust
  pub struct SshConfig {
      pub host: String,
      pub port: u16,      // default 22
      pub username: String,
      pub auth: SshAuth,
      pub cwd: Option<String>,
  }
  pub enum SshAuth {
      Password,           // 密码在连接时临时输入，不存储
      PrivateKey(String), // 密钥文件路径
      SshAgent,           // 使用系统 SSH Agent
  }
  ```
- 更新 `SessionConfig` 枚举：
  ```rust
  pub enum SessionConfig {
      Local(LocalShellConfig),
      Ssh(SshConfig),
  }
  ```
- 运行 `cargo test bindings_contain_expected_symbols` 重新生成 `bindings.ts`

**验收：** `bindings.ts` 包含 `SshConfig`、`SshAuth` 类型；`tsc --noEmit` 无报错

---

### D2 — 实现 SSH PTY Session 创建

- 在 `pty/session.rs` 中扩展 `PtySession::spawn()`，支持 `SessionConfig::Ssh` 变体：
  - 构建 `CommandBuilder`：`ssh -p {port} {username}@{host} ...`
  - `SshAuth::PrivateKey(path)` → 添加 `-i {path}` 参数
  - `SshAuth::SshAgent` → 确保继承 `SSH_AUTH_SOCK` 环境变量
  - `SshAuth::Password` → 直接启动（用户在终端内手动输入密码，无程序干预）
- 错误处理：ssh 进程立即退出（连接失败）时，emit `pty://exit` 并在终端内显示错误

**验收：** 集成测试（仅 Unix）：spawn SSH session 连接到 `localhost`（需配置好无密码 SSH），验证 PTY 输出包含 shell prompt

---

### D3 — 实现 `NewSessionModal.tsx`

- 新建终端时弹出对话框（替代之前直接用默认 shell 创建）
- Modal 有两个 Tab：「本地终端」「SSH 连接」
- 本地终端：Shell 路径输入（默认从设置读取）、初始目录
- SSH 连接：Host、Port、Username、认证方式（单选），密钥路径（可浏览文件系统）
- 「保存为快捷方式」复选框：勾选后调用 `sessionsSave()`
- 确认时调用 `sessionStore.createSession(config)`

**验收：** 通过 Modal 创建一个 SSH session（连接本地 SSH），终端内能正常交互

---

### D4 — SSH Profile 编辑页（Settings 面板新 Tab）

- 在 `SettingsModal.tsx` 左侧导航加入「SSH Profiles」Tab
- 内容：已保存的 SSH 会话列表（从 `savedSessions` 过滤 `session_type == "ssh"`）
- 支持编辑（点击打开编辑表单，复用 `NewSessionModal` 的 SSH 表单部分）、删除
- 添加「测试连接」按钮：尝试 spawn SSH session + 立即发送 `exit\n`，根据退出码显示成功/失败

**验收：** 能在 Settings 中增删改 SSH Profile；修改后侧边栏会话列表同步更新

---

## 模块 E — 分屏布局

### E1 — 定义 `PaneLayout` 类型（Rust + TypeScript）

- 在 `src-tauri/src/` 新建 `pane.rs`，定义：
  ```rust
  pub enum PaneLayout {
      Leaf { session_id: String },
      Split {
          direction: SplitDirection,
          ratio: f32,       // 0.0–1.0，分隔线位置
          first: Box<PaneLayout>,
          second: Box<PaneLayout>,
      },
  }
  pub enum SplitDirection { Horizontal, Vertical }
  ```
  均加 `#[derive(Serialize, Deserialize, specta::Type, Clone)]`
- 重新生成 `bindings.ts`，确认 TypeScript 类型正确

**验收：** `bindings.ts` 包含 `PaneLayout`、`SplitDirection`；TypeScript 能构造合法的 `PaneLayout` 树

---

### E2 — 扩展 `uiStore`：布局树状态管理

- State 新增：`layout: PaneLayout | null`（null 表示尚无会话）
- Actions：
  - `initLayout(sessionId)`: 创建第一个 `Leaf` 节点
  - `splitPane(targetSessionId, direction)`: 找到目标 Leaf，用 Split 节点替换，新建一个 session 放入 second
  - `closePane(sessionId)`: 找到目标 Leaf，用其 sibling 替换父 Split 节点
  - `resizePane(targetSessionId, newRatio)`: 更新对应 Split 节点的 ratio
- `createSession` action 成功后，若 `layout` 为 null，调用 `initLayout`

**验收：** 单元测试：`initLayout` → `splitPane(水平)` → `splitPane(垂直)` → `closePane`，每步验证布局树结构符合预期

---

### E3 — 实现 `PaneContainer.tsx`：递归渲染分屏

- 接受 `layout: PaneLayout` prop
- 若为 `Leaf`：渲染 `<TerminalTab sessionId={layout.session_id} />`
- 若为 `Split`：
  - 渲染两个 `<PaneContainer>` 子组件
  - `direction == Horizontal`：左右 Flex，宽度按 `ratio` 分配（CSS `flex-basis`）
  - `direction == Vertical`：上下 Flex，高度按 `ratio` 分配
  - 中间渲染一个可拖拽的分隔线 `<PaneDivider>`

**验收：** 在 App 中手动构造一个 `Split(Horizontal, 0.5, Leaf("a"), Leaf("b"))` 布局，两个终端并排显示，各自独立交互

---

### E4 — 实现 `PaneDivider.tsx`：可拖拽分隔线

- 鼠标按下时，监听 `mousemove` / `mouseup` 全局事件
- 根据鼠标位置计算新的 `ratio`，clamp 到 `[0.1, 0.9]`
- 调用 `uiStore.resizePane(sessionId, newRatio)`
- 拖拽结束时，对两侧 pane 各触发一次 `fitAddon.fit()` + `ptyResize()`
- 分隔线宽/高 4px，hover 时高亮，cursor 变为 `col-resize` / `row-resize`

**验收：** 拖拽分隔线，两侧终端随之 resize，终端内容不错位

---

### E5 — 分屏快捷键与 TabBar 集成

- 全局键盘快捷键：
  - `Cmd/Ctrl+D`：水平分屏当前 Pane
  - `Cmd/Ctrl+Shift+D`：垂直分屏当前 Pane
  - `Cmd/Ctrl+W`：关闭当前 Pane（若只剩一个则关闭 Tab）
  - `Cmd/Ctrl+[`、`Cmd/Ctrl+]`：在 Pane 间循环聚焦
- TabBar 的"+"按钮：无分屏时直接新建 Tab，有分屏时显示下拉「新 Tab」/「水平分屏」/「垂直分屏」

**验收：** 上述所有快捷键功能正常；多 Pane 时聚焦切换正确（光标在正确终端闪烁）

---

## 模块 F — 终端内容搜索

### F1 — 安装并集成 `@xterm/addon-search`

```bash
npm install @xterm/addon-search
```

- 在 `useTerminal.ts` 中初始化 `SearchAddon`，`terminal.loadAddon(searchAddon)`
- hook 返回值新增 `searchAddon` 引用，供搜索组件使用

**验收：** `npm run type-check` 通过；无 console 报错

---

### F2 — 实现 `components/terminal/TerminalSearch.tsx`

- 浮层组件，绝对定位在终端右上角，`z-index` 覆盖终端
- 包含：搜索输入框、上一个/下一个按钮、区分大小写 / 正则模式开关、匹配计数显示、关闭按钮
- 调用 `searchAddon.findNext(query, options)` / `searchAddon.findPrevious()`
- 支持 Enter 向下搜索、Shift+Enter 向上搜索

**验收：** 在终端内输入若干文本，用搜索框能高亮匹配；上下翻页正确；关闭清除高亮

---

### F3 — 绑定搜索快捷键

- `Cmd/Ctrl+F`：打开搜索框（聚焦输入框）
- `Escape`：关闭搜索框，焦点还给终端
- 在 `TerminalTab.tsx` 或 `AppLayout.tsx` 中注册快捷键

**验收：** 快捷键正确触发；搜索框关闭后 xterm 仍能正常接受键盘输入

---

### F4 — 搜索状态管理

- 每个 Pane/Tab 的搜索框状态（是否开启、当前关键词）存入 `uiStore`（key by `sessionId`）
- Tab 切换时搜索框状态不清空（保留上次搜索词）
- 重新打开搜索时自动回填上次关键词并高亮

**验收：** Tab A 搜索"hello"，切到 Tab B 再切回来，搜索框仍显示"hello"并有高亮

---

## 模块 G — OSC 标题 + Web Links

### G1 — 解析 OSC 标题序列（后端）

- 在 `pty/session.rs` 的 reader 线程中，扫描读取到的字节：
  - 检测 `ESC]0;{title}BEL` 或 `ESC]2;{title}BEL`（OSC 0/2 是设置终端标题的标准序列）
  - 检测到后，触发 `app_handle.emit("pty://title/{session_id}", title_string)`
  - 扫描不影响原始字节的转发（仍然将完整字节流 emit 到前端的 `pty://output/{id}`）
- 实现简单状态机，正确处理跨 `read()` 调用的 OSC 序列（序列可能被分割到两次 read）

**验收：** 集成测试：spawn zsh，写入 `printf '\033]0;test-title\007'`，reader 应 emit `pty://title/{id}` 事件，payload 为 `"test-title"`

---

### G2 — 前端订阅标题事件

- 在 `useTerminal.ts` 中注册 `listen("pty://title/{sessionId}", e => ...)`
- 收到事件后调用 `sessionStore.updateSessionTitle(sessionId, e.payload)`

**验收：** 在终端内运行 `echo -ne '\033]0;my-title\007'`，对应 Tab 的标题自动变为 `my-title`

---

### G3 — 集成 `@xterm/addon-web-links`

```bash
npm install @xterm/addon-web-links
```

- 在 `useTerminal.ts` 中：
  - 初始化 `WebLinksAddon`，`terminal.loadAddon(webLinksAddon)`
  - 配置 `handler`：`Cmd/Ctrl + Click` 时调用 Tauri 的 `open(url)`（`@tauri-apps/plugin-shell` 的 `open()`）
- 确保 `capabilities/default.json` 中包含 `shell:allow-open`

**验收：** 终端内的 `https://` URL 变为可点击蓝色下划线；Cmd/Ctrl+Click 在系统浏览器中打开

---

## 模块 H — UX 优化

### H1 — Tab 右键上下文菜单

- `TabBar.tsx` 给每个 Tab 添加 `onContextMenu` 处理
- 菜单项：「重命名」「水平分屏」「垂直分屏」「保存为快捷方式」「关闭」
- 菜单用绝对定位 div 实现（不依赖浏览器原生 contextmenu），跟随鼠标位置
- 点击空白处或 Escape 关闭菜单

**验收：** 右键 Tab 出现菜单；所有菜单项功能正常；菜单不超出窗口边界

---

### H2 — Tab 拖拽排序

- Tab 支持鼠标拖拽改变顺序（仅改变 `sessions` 数组顺序，不影响 layout 树）
- 使用 HTML5 drag-and-drop API（不引入额外 DnD 库）
- 拖拽时显示插入指示线（竖线），释放后更新 `sessionStore.sessions` 顺序

**验收：** 拖拽 Tab 改变顺序后，顺序符合预期；xterm.js 实例和 PTY session 不受影响

---

### H3 — 最近会话快速访问

- `NewSessionModal.tsx` 底部（或侧边栏顶部）显示「最近打开」列表，最多 5 条
- 基于 `savedSessions` 的 `updated_at` 字段排序
- 点击直接 `restoreSession()`，无需重新配置

**验收：** 打开过 3 个不同的 saved session 后，「最近打开」列表按时间倒序显示这 3 个

---

### H4 — 全局键盘快捷键汇总与冲突检查

- 审查所有已注册的快捷键（Phase 1 + Phase 2 新增），填写到 README 的 Keyboard Shortcuts 章节
- 确保无冲突：
  - `Cmd/Ctrl + ,`：设置
  - `Cmd/Ctrl + T`：新建 Tab
  - `Cmd/Ctrl + W`：关闭当前 Pane/Tab
  - `Cmd/Ctrl + D`：水平分屏
  - `Cmd/Ctrl + Shift + D`：垂直分屏
  - `Cmd/Ctrl + F`：终端搜索
  - `Cmd/Ctrl + [`、`]`：切换 Pane 焦点
  - `Cmd/Ctrl + 1–9`：切换到第 N 个 Tab
- 在 `App.tsx` 中统一注册所有全局快捷键（避免分散在各组件中）

**验收：** `npm run type-check` 通过；所有快捷键功能正常；README 有 Shortcuts 表格

---

## 进度跟踪

| 模块 | 任务数 | 状态 | 完成日期 |
|---|---|---|---|
| A — SQLite 基础设施 | 4 | 🔲 未开始 | — |
| B — Session 持久化前端 | 4 | 🔲 未开始 | — |
| C — 会话分组 | 3 | 🔲 未开始 | — |
| D — SSH Profile | 4 | 🔲 未开始 | — |
| E — 分屏布局 | 5 | 🔲 未开始 | — |
| F — 终端内容搜索 | 4 | 🔲 未开始 | — |
| G — OSC 标题 + Web Links | 3 | 🔲 未开始 | — |
| H — UX 优化 | 4 | 🔲 未开始 | — |
| **合计** | **31/31** | **🔲 Phase 2 进行中** | |
