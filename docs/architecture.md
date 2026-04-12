# Taix — 代码架构与实施文档

> 版本：v0.1  
> 日期：2026-04-12  
> 依赖规划文档：[planning.md](./planning.md)

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [前端架构](#2-前端架构)
3. [后端架构（Rust）](#3-后端架构rust)
4. [前后端通信层](#4-前后端通信层)
5. [数据模型](#5-数据模型)
6. [目录结构](#6-目录结构)
7. [关键模块详细设计](#7-关键模块详细设计)
8. [错误处理策略](#8-错误处理策略)
9. [测试策略](#9-测试策略)
10. [实施路线图](#10-实施路线图)
11. [开发环境搭建](#11-开发环境搭建)

---

## 1. 整体架构概览

### 1.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Tauri 应用窗口                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 前端 (WebView)                         │  │
│  │  React + TypeScript + xterm.js + Zustand              │  │
│  │                                                       │  │
│  │   UI Layer        State Layer       Terminal Layer    │  │
│  │  ┌──────────┐    ┌──────────────┐  ┌──────────────┐  │  │
│  │  │Components│    │ Zustand Store│  │  xterm.js    │  │  │
│  │  │ (React)  │◄──►│  (sessions,  │  │  instances   │  │  │
│  │  └──────────┘    │   AI state)  │  └──────────────┘  │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ Tauri IPC (invoke / emit)         │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │                 后端 (Rust)                            │  │
│  │                                                       │  │
│  │  Command Layer     Core Layer        I/O Layer        │  │
│  │  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ Tauri        │  │  Session    │  │  portable   │  │  │
│  │  │ Commands     │─►│  Manager   │─►│  -pty       │  │  │
│  │  │ (#[command]) │  │  (Arc<Mutex>│  │             │  │  │
│  │  └──────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                    ┌─────────────┐  ┌─────────────┐  │  │
│  │                    │  AI Service │  │   SQLite    │  │  │
│  │                    │  (Provider  │  │  (rusqlite) │  │  │
│  │                    │   Trait)    │  │             │  │  │
│  │                    └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

- **后端重，前端轻**：所有状态、PTY 生命周期、AI 调用均在 Rust 后端管理，前端只负责渲染和用户交互。
- **事件驱动**：PTY 输出通过 Tauri Event 系统从后端推送到前端，避免前端轮询。
- **面向接口**：AI 服务、存储层均通过 Rust trait 抽象，便于替换和测试。
- **会话隔离**：每个 PTY 会话拥有独立的线程和生命周期，互不干扰。
- **显式错误**：使用 `Result<T, AppError>` 贯穿后端，前端始终能收到明确的错误信息。

---

## 2. 前端架构

### 2.1 技术栈选择

| 工具 | 版本 | 职责 |
|---|---|---|
| React | 19.x | UI 组件树 |
| TypeScript | 5.x | 类型安全 |
| Zustand | 5.x | 轻量状态管理（替代 Redux） |
| xterm.js | 5.x | 终端渲染引擎 |
| @xterm/addon-fit | latest | 终端自适应容器尺寸 |
| @xterm/addon-search | latest | 终端内容搜索 |
| @xterm/addon-web-links | latest | 自动识别 URL 可点击 |
| vite | 6.x | 构建工具 |
| tailwindcss | 4.x | 样式 |

### 2.2 前端目录结构

```
src/
├── main.tsx                    # 应用入口
├── App.tsx                     # 根组件，布局骨架
│
├── components/                 # UI 组件（只负责渲染）
│   ├── layout/
│   │   ├── AppLayout.tsx       # 主布局（侧边栏 + 内容区）
│   │   ├── Sidebar.tsx         # 左侧会话列表面板
│   │   └── StatusBar.tsx       # 底部状态栏
│   ├── terminal/
│   │   ├── TerminalTab.tsx     # 单个终端标签（xterm.js 宿主）
│   │   ├── TerminalPane.tsx    # 分屏容器（管理 split layout）
│   │   ├── TabBar.tsx          # 顶部标签栏
│   │   └── TerminalSearch.tsx  # 终端内搜索浮窗
│   ├── session/
│   │   ├── SessionList.tsx     # 侧边栏会话列表
│   │   ├── SessionItem.tsx     # 单条会话记录
│   │   └── NewSessionModal.tsx # 新建会话对话框
│   ├── ai/
│   │   ├── AIPanel.tsx         # AI 对话面板（可折叠）
│   │   ├── AISuggestion.tsx    # 命令建议浮窗（内联）
│   │   └── AICommandBar.tsx    # # 触发的命令输入栏
│   └── settings/
│       ├── SettingsModal.tsx   # 设置面板
│       ├── AppearanceSettings.tsx
│       ├── ShellSettings.tsx
│       └── AISettings.tsx
│
├── hooks/                      # 自定义 React Hooks
│   ├── useTerminal.ts          # 封装 xterm.js 初始化和事件绑定
│   ├── usePtySession.ts        # 封装与后端 PTY 的 IPC 交互
│   ├── useResize.ts            # ResizeObserver 封装，触发 PTY resize
│   └── useAI.ts               # AI 面板交互逻辑
│
├── stores/                     # Zustand 状态（细粒度切片）
│   ├── index.ts                # 统一导出
│   ├── sessionStore.ts         # 会话列表、活动会话
│   ├── uiStore.ts              # UI 状态（侧边栏展开、分屏布局）
│   ├── aiStore.ts              # AI 面板状态、对话历史
│   └── settingsStore.ts        # 用户设置（主题、字体、shell）
│
├── services/                   # 与 Tauri 后端通信的封装层
│   ├── pty.ts                  # PTY 相关 IPC 调用
│   ├── sessions.ts             # 会话持久化 API
│   ├── ai.ts                   # AI 功能 API
│   └── config.ts               # 配置读写 API
│
├── types/                      # TypeScript 类型定义
│   ├── session.ts
│   ├── ai.ts
│   └── ipc.ts                  # 与后端共享的 IPC 消息类型
│
└── utils/
    ├── platform.ts             # 平台检测工具
    └── theme.ts                # 主题工具函数
```

### 2.3 状态管理设计

使用 Zustand 细粒度切片，避免单一巨型 store：

```typescript
// stores/sessionStore.ts
interface SessionState {
  sessions: Session[];          // 所有活跃会话
  activeSessionId: string | null;
  layout: PaneLayout;           // 分屏布局树

  // Actions
  createSession: (config: SessionConfig) => Promise<void>;
  closeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
}
```

### 2.4 xterm.js 生命周期管理

每个 `TerminalTab` 组件拥有一个独立的 xterm.js 实例，通过 `useTerminal` Hook 管理：

```
组件挂载
  → new Terminal(options)
  → terminal.open(containerRef.current)
  → fitAddon.fit()
  → 建立 Tauri Event 监听（接收 PTY 输出）
  → 建立 terminal.onData 回调（发送用户输入到后端）

组件卸载
  → 取消 Tauri Event 监听
  → terminal.dispose()
```

Tab 切换时：xterm.js 实例**不销毁**，只是 DOM 容器的 CSS 设为 `display: none`，保持渲染状态和滚动位置。

---

## 3. 后端架构（Rust）

### 3.1 Rust 目录结构

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/               # Tauri 2 权限声明
│   └── default.json
│
└── src/
    ├── main.rs                 # 程序入口，注册 commands 和 plugins
    ├── lib.rs                  # 库入口（便于测试）
    │
    ├── error.rs                # 统一错误类型 AppError
    │
    ├── commands/               # Tauri IPC 命令处理层（薄层，只做参数校验和委托）
    │   ├── mod.rs
    │   ├── pty.rs              # PTY 相关命令
    │   ├── sessions.rs         # 会话持久化命令
    │   ├── ai.rs               # AI 功能命令
    │   └── config.rs           # 配置读写命令
    │
    ├── pty/                    # PTY 核心层
    │   ├── mod.rs
    │   ├── manager.rs          # PtyManager：管理所有活跃 PTY 会话
    │   ├── session.rs          # PtySession：单个 PTY 会话的生命周期
    │   └── platform.rs         # 平台相关的 shell 默认值检测
    │
    ├── storage/                # 持久化层
    │   ├── mod.rs
    │   ├── db.rs               # SQLite 连接池和 migration
    │   ├── session_repo.rs     # 会话元数据 CRUD
    │   └── config_repo.rs      # 用户配置 CRUD
    │
    ├── ai/                     # AI 集成层
    │   ├── mod.rs
    │   ├── provider.rs         # AiProvider trait 定义
    │   ├── openai.rs           # OpenAI 实现
    │   ├── ollama.rs           # Ollama 实现
    │   ├── context.rs          # 上下文构建器（命令历史 + 终端输出）
    │   └── tool_executor.rs    # AI tool_call 执行器（execute_command 等）
    │
    ├── config/                 # 用户配置
    │   ├── mod.rs
    │   └── schema.rs           # 配置结构体定义（serde）
    │
    └── state.rs                # AppState：注入到 Tauri 的全局状态
```

### 3.2 核心状态 AppState

```rust
// state.rs
pub struct AppState {
    pub pty_manager: Arc<PtyManager>,
    pub db: Arc<Database>,
    pub config: Arc<RwLock<AppConfig>>,
    pub ai_service: Arc<dyn AiProvider + Send + Sync>,
}
```

`AppState` 通过 `tauri::State<AppState>` 注入到所有 command handler 中，避免全局变量。

### 3.3 PTY 模块设计

#### PtyManager（会话注册表）

```
PtyManager
├── sessions: DashMap<SessionId, Arc<PtySession>>
│   └── DashMap 支持并发读写，无需全局锁
├── create_session(config) → SessionId
├── write_to_session(id, data)
├── resize_session(id, rows, cols)
├── close_session(id)
└── get_session(id) → Option<Arc<PtySession>>
```

#### PtySession（单个会话）

```
PtySession
├── id: SessionId (UUID)
├── pty_pair: portable_pty::PtyPair
├── child: Box<dyn Child>          ← shell 子进程
├── reader_thread: JoinHandle      ← 独立线程：读取 PTY 输出并 emit 到前端
├── metadata: SessionMetadata      ← 标题、创建时间、工作目录
└── output_buffer: Arc<RwLock<RingBuffer>> ← 环形缓冲，存最近N行供AI使用
```

**关键：Reader 线程模式**

每个 PtySession 启动一个独立线程持续读取 PTY Master 的输出，通过 `app_handle.emit()` 推送到前端：

```
reader_thread 伪代码：
  loop {
    let n = reader.read(&mut buf)?;
    if n == 0 { break; }  // EOF，shell 退出
    output_buffer.push(&buf[..n]);
    app_handle.emit(&format!("pty://output/{session_id}"), &buf[..n]);
  }
  // 通知前端 session 已结束
  app_handle.emit("pty://exit", &session_id);
```

### 3.4 AI 模块设计

#### AiProvider Trait

```rust
// ai/provider.rs
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse, AppError>;
    async fn stream_chat(
        &self,
        messages: Vec<ChatMessage>,
        tx: mpsc::Sender<String>,
    ) -> Result<(), AppError>;
    fn name(&self) -> &str;
}
```

#### Tool Executor

AI Agent 模式通过标准的 OpenAI `tool_call` 协议与后端交互：

```
AI 请求工具调用
  → tool_executor.dispatch(tool_call)
    ├── "execute_command" → 检查权限级别 → 可能等待用户确认
    │     → pty_manager.write(session_id, cmd + "\n")
    │     → 收集输出（带 timeout）
    │     → 返回输出字符串给 AI
    ├── "read_file"     → 读取文件内容（受沙箱限制）
    └── "list_sessions" → 返回当前活跃会话信息
```

### 3.5 存储层设计

使用 `rusqlite` + 手写 migration，不引入 ORM（保持简洁，SQLite 模式稳定后变动少）。

Migration 策略：在 `db.rs` 中维护有序的 SQL 语句数组，启动时检查 `schema_version` 表，依次执行未执行的 migration。

---

## 4. 前后端通信层

### 4.1 通信模式

Tauri 提供两种通信机制，本项目同时使用：

| 机制 | 方向 | 用途 |
|---|---|---|
| `invoke(command, args)` | 前端 → 后端 → 前端（请求/响应） | 创建会话、写入输入、查询配置 |
| `emit(event, payload)` | 后端 → 前端（推送） | PTY 输出流、会话退出通知、AI 流式响应 |

### 4.2 IPC 命令清单

**PTY 命令**

```typescript
// 前端调用示例（services/pty.ts）
invoke<SessionId>("pty_create", { config: SessionConfig })
invoke<void>("pty_write", { sessionId, data: string })
invoke<void>("pty_resize", { sessionId, rows: number, cols: number })
invoke<void>("pty_close", { sessionId })
invoke<SessionInfo[]>("pty_list_active")
```

**会话持久化命令**

```typescript
invoke<SavedSession[]>("sessions_list")
invoke<SavedSession>("sessions_get", { id })
invoke<void>("sessions_save", { session: SavedSession })
invoke<void>("sessions_delete", { id })
```

**AI 命令**

```typescript
invoke<void>("ai_chat_start", { sessionId, prompt, mode: AiMode })
// AI 回复通过 event 流式推送：
// event: "ai://chunk/{requestId}" → string (流式 token)
// event: "ai://done/{requestId}"  → AiResult
// event: "ai://tool_confirm/{requestId}" → ToolConfirmRequest（等待用户确认）
invoke<void>("ai_tool_confirm", { requestId, approved: boolean })
```

**配置命令**

```typescript
invoke<AppConfig>("config_get")
invoke<void>("config_set", { config: Partial<AppConfig> })
```

### 4.3 事件命名规范

使用 URI 风格命名，方便在前端按前缀筛选：

```
pty://output/{sessionId}     PTY 输出数据（高频）
pty://exit/{sessionId}       PTY 进程退出
pty://title/{sessionId}      终端标题变化（OSC 序列）

ai://chunk/{requestId}       AI 流式 token
ai://done/{requestId}        AI 响应完成
ai://tool_confirm/{requestId} 需要用户确认的工具调用
ai://error/{requestId}       AI 调用错误

session://changed            持久化会话列表变化
```

### 4.4 类型共享策略

后端 Rust 结构体需要在前端有对应的 TypeScript 类型。采用以下约定：

- 所有 IPC 相关结构体在 Rust 侧标注 `#[derive(Serialize, Deserialize, Type)]`（`specta` crate）
- 使用 `tauri-specta` 在构建时自动生成 TypeScript 类型文件到 `src/types/bindings.ts`
- 这样 Rust 结构体是单一来源，TypeScript 类型自动同步，无需手动维护

---

## 5. 数据模型

### 5.1 SQLite Schema

```sql
-- 版本管理
CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL
);

-- 保存的会话配置（SSH profile、本地 shell 配置）
CREATE TABLE saved_sessions (
    id          TEXT PRIMARY KEY,      -- UUID
    name        TEXT NOT NULL,
    session_type TEXT NOT NULL,        -- "local" | "ssh"
    config      TEXT NOT NULL,         -- JSON: ShellConfig | SshConfig
    group_id    TEXT,                  -- 所属分组
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- 会话分组
CREATE TABLE session_groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    sort_order  INTEGER DEFAULT 0
);

-- AI 对话历史（可选，按需保留）
CREATE TABLE ai_conversations (
    id          TEXT PRIMARY KEY,
    session_id  TEXT,                  -- 关联的 PTY 会话（可为空）
    messages    TEXT NOT NULL,         -- JSON array of ChatMessage
    created_at  TEXT NOT NULL
);
```

### 5.2 核心 Rust 类型

```rust
// 活跃 PTY 会话（内存中）
pub struct PtySession {
    pub id: SessionId,
    pub config: SessionConfig,
    pub started_at: DateTime<Utc>,
    pub cwd: Option<PathBuf>,
}

// 会话配置（存储到 SQLite）
pub enum SessionConfig {
    Local(LocalShellConfig),
    Ssh(SshConfig),
}

pub struct LocalShellConfig {
    pub shell: PathBuf,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub cwd: Option<PathBuf>,
}

pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
}

pub enum SshAuth {
    Password,               // 密码在连接时临时输入，不持久化
    PrivateKey(PathBuf),    // 密钥文件路径
    SshAgent,               // 使用系统 SSH Agent
}
```

### 5.3 前端 TypeScript 类型（自动生成）

```typescript
// src/types/bindings.ts（由 tauri-specta 自动生成，不要手动修改）
export type SessionId = string;

export type SessionConfig =
  | { type: "Local"; config: LocalShellConfig }
  | { type: "Ssh"; config: SshConfig };

export type AiMode = "suggest" | "assist" | "agent";

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};
```

---

## 6. 目录结构

### 6.1 完整项目目录

```
taix/
│
├── docs/
│   ├── planning.md             # 规划文档
│   └── architecture.md         # 本文档
│
├── src/                        # 前端（TypeScript + React）
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   ├── terminal/
│   │   ├── session/
│   │   ├── ai/
│   │   └── settings/
│   ├── hooks/
│   ├── stores/
│   ├── services/
│   ├── types/
│   │   └── bindings.ts         # 自动生成，勿手动修改
│   └── utils/
│
├── src-tauri/                  # 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── error.rs
│       ├── state.rs
│       ├── commands/
│       ├── pty/
│       ├── storage/
│       ├── ai/
│       └── config/
│
├── scripts/                    # 构建、发布脚本
│   ├── build.sh
│   └── release.sh
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # PR 检查：lint + test
│       └── release.yml         # tag 触发：三平台构建 + 发布
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .eslintrc.json
└── README.md
```

---

## 7. 关键模块详细设计

### 7.1 PTY Session 生命周期

```
前端: invoke("pty_create", config)
      │
      ▼
后端 pty::commands::create()
      │  参数校验
      ▼
PtyManager::create_session(config, app_handle)
      │
      ├── 1. native_pty_system().openpty(initial_size)
      │      └── macOS/Linux: openpty() syscall
      │          Windows: CreatePseudoConsole()
      │
      ├── 2. 根据 config 构建 CommandBuilder
      │      Local: shell 路径 + 环境变量
      │      SSH:   ssh 可执行文件 + 参数（Phase 1 用系统 ssh）
      │
      ├── 3. pty_pair.slave.spawn_command(cmd)
      │      └── 子进程启动，stdin/stdout/stderr → PTY slave
      │
      ├── 4. 启动 reader_thread
      │      └── 独立线程：loop { reader.read() → app_handle.emit() }
      │
      ├── 5. 生成 SessionId，存入 DashMap
      │
      └── 6. 返回 SessionId 给前端

前端收到 SessionId
      │
      ├── 注册 event 监听：listen("pty://output/{id}", handler)
      └── 初始化 xterm.js 实例，绑定 onData → invoke("pty_write")
```

### 7.2 窗口 Resize 流程

```
用户拖拽窗口 / 侧边栏折叠
      │
      ▼
前端 ResizeObserver (useResize hook)
      │  debounce 50ms
      ▼
fitAddon.fit()  ← xterm.js 计算新的 cols/rows
      │
      ▼
invoke("pty_resize", { sessionId, rows, cols })
      │
      ▼
后端 PtySession::resize(rows, cols)
      │
      └── pty_pair.master.resize(PtySize { rows, cols })
             └── 底层: ioctl(TIOCSWINSZ) / ResizePseudoConsole()
                  → 内核发送 SIGWINCH 给 shell 进程组
                  → vim/top 等重绘
```

### 7.3 AI Agent 执行流程

```
用户在 AI 面板输入 Prompt，选择 Agent 模式
      │
      ▼
前端 invoke("ai_chat_start", { sessionId, prompt, mode: "agent" })
      │
      ▼
后端 ai::commands::chat_start()
      │
      ├── 1. 构建系统 Prompt（注入当前终端上下文：cwd、最近输出）
      ├── 2. 定义可用工具：execute_command, read_file, list_sessions
      └── 3. 启动 tokio task：
              loop {
                response = ai_provider.chat(messages + tools)
                
                if response.is_text() {
                  // 流式推送文字给前端
                  emit("ai://chunk/{reqId}", token)
                }
                
                if response.is_tool_call("execute_command") {
                  cmd = response.tool_args.command
                  
                  // 权限检查
                  if is_dangerous(cmd) && mode != FullAuto {
                    // 等待用户确认
                    emit("ai://tool_confirm/{reqId}", { cmd })
                    approved = wait_for_confirm(reqId).await
                    if !approved { break }
                  }
                  
                  // 执行命令
                  output = pty_manager.run_and_capture(sessionId, cmd).await
                  
                  // 将输出作为 tool result 放入 messages
                  messages.push(tool_result(output))
                  // 继续循环，让 AI 处理执行结果
                }
                
                if response.is_done() { break }
              }
              emit("ai://done/{reqId}", final_message)
```

### 7.4 配置系统

配置存储在系统标准配置目录（通过 `dirs` crate 获取）：

```
macOS:   ~/Library/Application Support/taix/config.toml
Linux:   ~/.config/taix/config.toml
Windows: %APPDATA%\taix\config.toml
```

配置使用 TOML 格式，`serde` + `toml` crate 序列化。数据库文件放在同目录下的 `taix.db`。

```toml
# config.toml 示例
[appearance]
theme = "dark"
font_family = "JetBrains Mono"
font_size = 14
opacity = 1.0

[shell]
# macOS/Linux: 留空则读取 $SHELL 环境变量
# Windows: "cmd.exe" | "powershell.exe" | "wsl.exe"
default_shell = ""

[ai]
provider = "openai"   # "openai" | "ollama" | "anthropic"
model = "gpt-4o"
api_key = ""          # 也可通过环境变量 TAIX_OPENAI_KEY 设置
ollama_base_url = "http://localhost:11434"
default_mode = "suggest"    # "suggest" | "assist" | "agent"
```

---

## 8. 错误处理策略

### 8.1 后端统一错误类型

```rust
// error.rs
#[derive(Debug, thiserror::Error, Serialize)]
pub enum AppError {
    #[error("PTY error: {0}")]
    Pty(String),

    #[error("Session not found: {0}")]
    SessionNotFound(SessionId),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("AI provider error: {0}")]
    AiProvider(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Configuration error: {0}")]
    Config(String),
}

// 实现 tauri::IntoResponse 使其可以从 command 直接返回
impl From<AppError> for tauri::Error {
    ...
}
```

### 8.2 前端错误处理

- `invoke()` 调用统一用 `try/catch` 包裹，在 `services/` 层处理
- 错误分级：`toast` 通知（非致命）vs 错误模态框（致命/需要操作）
- PTY 相关错误直接在对应的终端 Tab 内显示（不打断其他 Tab）

---

## 9. 测试策略

### 9.1 Rust 后端测试

```
unit tests（#[cfg(test)] 模块内）
  ├── pty/session.rs：使用 portable-pty 的 CommandPair mock
  ├── storage/session_repo.rs：使用内存 SQLite (:memory:)
  ├── ai/context.rs：纯函数，测试上下文构建逻辑
  └── error.rs：错误转换测试

integration tests（tests/ 目录）
  └── pty_integration.rs：启动真实 shell（echo 命令），验证 PTY 输出
```

### 9.2 前端测试

```
unit tests（vitest）
  ├── stores/：测试 Zustand store actions
  ├── services/：mock Tauri invoke，测试 API 封装
  └── utils/：纯函数测试

component tests（vitest + @testing-library/react）
  └── 关键组件的渲染和交互测试
```

### 9.3 E2E 测试

使用 `tauri-driver` + `WebDriver` 进行关键路径测试（暂时低优先级，MVP 阶段跳过）。

---

## 10. 实施路线图

### Phase 1 — MVP 骨架 ✅ 已完成（2026-04-12）

**Week 1：项目初始化和 PTY 验证**
- [x] `cargo tauri init` 创建项目骨架
- [x] 配置 `vite` + `TypeScript` + `tailwindcss`
- [x] 集成 `portable-pty`，实现最简单的 PTY session 创建
- [x] 集成 `xterm.js`，实现输入/输出基本流通（不拆分组件）
- [ ] 验证三平台（macOS/Linux/Windows）PTY 正常工作（CI workflow 已就绪，待 GitHub Actions 执行）
- [x] 验证 resize 事件正确传递（集成测试通过）

**Week 2：多 Tab 和状态管理**
- [x] 实现 `SessionStore`（Zustand）
- [x] 实现 `TabBar` 组件（新建/切换/关闭）
- [x] 实现 Tab 切换时 xterm.js 实例的保活策略
- [x] 实现 `PtyManager` 的完整增删改查
- [x] 实现基础主题（深色模式）

**Week 3：布局和配置**
- [x] 实现 `AppLayout`（侧边栏 + 内容区）
- [x] 实现 `SettingsModal`（字体、主题、默认 shell）
- [x] 实现配置持久化（TOML 文件读写）
- [x] 集成 `tauri-specta` 自动生成 TypeScript 类型

**Week 4：SQLite 和发布**
- [ ] 实现 SQLite schema 和 migration 系统（推迟至 Phase 2）
- [ ] 实现会话配置的保存和加载（SavedSession）（推迟至 Phase 2）
- [x] 配置 GitHub Actions 三平台构建（ci.yml + release.yml）
- [x] 打包配置：macOS DMG、Linux AppImage、Windows NSIS installer

### Phase 2 — 会话管理（目标：+4 周）

- [ ] 分屏布局（split pane，基于 Flex/Grid 布局树）
- [ ] SSH 连接（通过系统 `ssh` 命令，Phase 1 方案）
- [ ] SSH Profile 管理 UI
- [ ] 终端内容搜索（`@xterm/addon-search`）
- [ ] 会话分组和标签

### Phase 3 — AI 集成（目标：+6 周）

- [ ] AI Provider 抽象和 OpenAI 实现
- [ ] 自然语言转命令（`#` 触发）
- [ ] 错误智能分析（命令失败后自动触发）
- [ ] Ollama 本地 AI 支持
- [ ] AI Agent 模式 + 权限控制 UI
- [ ] 多会话协同 AI 查询

---

## 11. 开发环境搭建

### 11.1 依赖安装

```bash
# Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup toolchain install stable

# Tauri 2 系统依赖（macOS）
# 需要 Xcode Command Line Tools（已有则跳过）
xcode-select --install

# Tauri 2 系统依赖（Linux Ubuntu/Debian）
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

# Node.js（建议使用 fnm 管理版本）
brew install fnm   # macOS
fnm install --lts
fnm use --lts

# 前端依赖
npm install
```

### 11.2 关键 Rust Crate 依赖

```toml
# src-tauri/Cargo.toml

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"

# PTY
portable-pty = "0.8"

# 异步运行时
tokio = { version = "1", features = ["full"] }

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"

# 数据库
rusqlite = { version = "0.32", features = ["bundled"] }  # bundled 避免系统 SQLite 版本问题

# HTTP 客户端（AI API）
reqwest = { version = "0.12", features = ["json", "stream"] }

# 错误处理
thiserror = "1"
anyhow = "1"

# 并发数据结构
dashmap = "6"

# 时间
chrono = { version = "0.4", features = ["serde"] }

# UUID
uuid = { version = "1", features = ["v4"] }

# 目录路径
dirs = "5"

# 类型生成（开发依赖）
specta = "2"
tauri-specta = { version = "2", features = ["derive", "typescript"] }

[dev-dependencies]
tempfile = "3"
```

### 11.3 常用开发命令

```bash
# 启动开发服务器（热更新）
npm run tauri dev

# 仅运行前端（不启动 Tauri 壳，用于纯 UI 开发）
npm run dev

# 运行 Rust 单元测试
cd src-tauri && cargo test

# 运行前端测试
npm run test

# 类型检查
npm run type-check
cd src-tauri && cargo check

# 生产构建
npm run tauri build

# 格式化
cd src-tauri && cargo fmt
npm run lint:fix
```

### 11.4 IDE 推荐配置

- **rust-analyzer**：Rust 语言支持（VS Code 扩展）
- **Tauri** 官方扩展：提供 `tauri.conf.json` schema 和调试支持
- **ESLint + Prettier**：前端代码规范
- 推荐在 `.vscode/settings.json` 中启用保存时自动格式化
