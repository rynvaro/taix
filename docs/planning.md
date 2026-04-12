# Taix — 终端会话管理器 + AI 集成 规划文档

> 版本：v0.1  
> 日期：2026-04-12  
> 状态：规划阶段

---

## 目录

1. [项目定位](#1-项目定位)
2. [技术选型](#2-技术选型)
3. [PTY 深度解析](#3-pty-深度解析)
4. [各平台 PTY 方案分析](#4-各平台-pty-方案分析)
5. [功能规划与优先级](#5-功能规划与优先级)
6. [AI 集成分析](#6-ai-集成分析)
7. [产品定位与市场分析](#7-产品定位与市场分析)
8. [项目结构建议](#8-项目结构建议)

---

## 1. 项目定位

Taix 是一个开源的跨平台终端会话管理器，目标是将多会话管理与 AI 能力深度结合，成为开发者和运维人员与任意机器交互的统一入口。

**核心理念：** 终端是人与机器之间最直接的接口，AI 应该自然地融入这个接口，而不是另开一个独立窗口。

**目标用户：** DevOps 工程师、后端开发者、运维人员。

**支持平台：** macOS、Linux、Windows。

---

## 2. 技术选型

### 2.1 推荐方案：Tauri 2.x + Rust + TypeScript

| 层级 | 技术 | 选择理由 |
|---|---|---|
| GUI 壳 | **Tauri 2** | 比 Electron 轻约 10 倍，使用系统原生 webview，跨三平台支持完善 |
| 终端渲染 | **xterm.js** | 业界标准终端前端渲染库，VS Code、Hyper 均在使用，VT 兼容性最好 |
| 前端框架 | **TypeScript + React** 或 Solid | 生态成熟，xterm.js 有 React 封装，可快速迭代 |
| 后端核心 | **Rust** | 内存安全、并发性强、PTY 相关 crate 生态完善、性能优秀 |
| PTY 处理 | **`portable-pty`（Rust crate）** | 跨平台统一 API，作者是 WezTerm 作者，Windows/Mac/Linux 全覆盖 |
| 会话持久化 | **SQLite via `rusqlite`** | 嵌入式，无外部依赖，足以支撑会话元数据存储 |
| AI 通信 | **`reqwest` + OpenAI API / Ollama** | HTTP 调用，同时支持云端和本地 AI |

### 2.2 备选方案及取舍

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| Electron + Node.js | 生态最成熟，`node-pty` 稳定 | 包体积 150MB+，内存占用高 | 不推荐，工具类应该轻巧 |
| Flutter + Dart | UI 跨平台一致性强 | PTY 仿真库弱，FFI 绑定需要自写 | 不推荐，PTY 是核心 |
| 纯 Rust + egui/iced | 最轻量、最快 | UI 开发效率低，难做精美界面 | 可作为后期考虑 |
| **Tauri + Rust** | 轻量、安全、PTY 生态好 | webview 在不同平台有细微差异 | **推荐** |

---

## 3. PTY 深度解析

### 3.1 什么是 PTY

PTY（Pseudo-Terminal，伪终端）是操作系统内核提供的一种机制，用于**模拟物理串行终端的行为**。它的存在让程序（如 shell、vim、ssh）认为自己在与一个真实的终端交互，即使实际上对端是另一个程序（如终端模拟器 GUI）。

PTY 由一对字符设备组成：

```
┌─────────────────────────────────────────────────┐
│                    PTY Pair                      │
│                                                  │
│  Master 端 (ptm)          Slave 端 (pts)         │
│  ┌─────────────┐          ┌─────────────┐        │
│  │  GUI 程序   │◄────────►│  Shell 进程  │        │
│  │ (终端模拟器) │          │ (bash/zsh)  │        │
│  └─────────────┘          └─────────────┘        │
│                                                  │
│  GUI 写入 → Shell 读到输入                        │
│  Shell 写出 → GUI 读到并渲染                      │
└─────────────────────────────────────────────────┘
```

- **Master 端（ptm）**：由终端模拟器控制，负责读取 shell 的输出并显示，以及将用户输入写给 shell。
- **Slave 端（pts）**：shell 进程将 stdin/stdout/stderr 都绑定到这个设备，像操作真实终端一样操作它。

### 3.2 PTY 为什么必要

如果直接用普通的 pipe（管道）连接 shell 和 GUI，会出现以下问题：

1. **行缓冲问题**：很多程序检测到 stdout 不是 tty 时会切换为全缓冲，导致输出延迟甚至不输出（典型：`python -u` 的 `-u` 参数就是为了解决这个）。
2. **交互程序无法工作**：vim、nano、htop、man 等程序依赖终端的 `TIOCGWINSZ`（获取窗口尺寸）等 ioctl 调用，普通 pipe 不支持。
3. **信号无法传递**：按 `Ctrl+C` 需要向进程组发送 `SIGINT`，这依赖终端的信号控制逻辑，pipe 不支持。
4. **行编辑失效**：shell 的 readline 行编辑（方向键、历史）依赖终端的 raw mode 设置（`tcsetattr`），pipe 不提供。
5. **颜色/ANSI 转义码**：很多程序（`ls --color`、`git` 等）检测到不是 tty 时会关闭颜色输出。

**结论：PTY 是终端模拟器的核心基础设施，不可替代。**

### 3.3 PTY 的工作流程

```
用户键盘输入
    │
    ▼
终端模拟器 (GUI)
    │  write(master_fd, data)
    ▼
PTY Master ◄──── 内核 PTY 驱动 (处理行规则 line discipline)
    │                    │
    │                    │ 回显 (echo)、特殊字符处理
    │                    │ (Ctrl+C → SIGINT, Ctrl+Z → SIGTSTP)
    ▼                    │
PTY Slave ───────────────┘
    │  read(slave_fd) → shell 读到 "ls\n"
    ▼
Shell 进程 (bash/zsh)
    │  write(slave_fd) → 输出 "file1  file2\n"
    ▼
PTY Master (终端模拟器 read 到数据)
    │
    ▼
xterm.js 渲染器 → 解析 ANSI 转义码 → 绘制字符
```

### 3.4 Line Discipline（行规则）

PTY 内核驱动中有一个重要概念：**line discipline（行规则）**，它负责：

- **字符回显**：你打的字立刻显示出来（echo 模式）
- **特殊字符处理**：`^C` → `SIGINT`，`^Z` → `SIGTSTP`，`^D` → EOF
- **行缓冲**：cooked 模式下，按回车才把整行发给程序
- **Raw 模式**：vim 等程序调用 `tcsetattr` 进入 raw 模式，绕过行规则，自己处理每个按键

### 3.5 窗口尺寸同步

当用户调整终端窗口大小时，必须同步通知 shell 和运行中的程序：

```
GUI resize 事件
    │
    ▼
ioctl(master_fd, TIOCSWINSZ, &winsize{rows, cols})
    │
    ▼
内核向 shell 进程组发送 SIGWINCH 信号
    │
    ▼
bash/vim/top 等程序收到信号 → 重新查询尺寸 → 重绘界面
```

忘记实现这一步会导致 vim 显示错乱、`top` 不能全屏等问题。

### 3.6 ANSI/VT 转义序列

Shell 和程序通过在普通字符流中插入特殊转义序列来控制终端显示：

```
ESC[31m       → 设置前景色为红色
ESC[1;32m     → 粗体 + 绿色前景
ESC[0m        → 重置所有属性
ESC[2J        → 清屏
ESC[H         → 光标移动到左上角
ESC[5;10H     → 光标移动到第5行第10列
ESC[?1049h    → 切换到备用屏幕（vim 进入时用）
ESC[?1049l    → 切换回主屏幕（vim 退出时用）
```

xterm.js 负责解析这些序列并渲染，这是使用它而不是自己写渲染器的主要原因——完整的 VT 兼容大约需要处理几百种序列。

---

## 4. 各平台 PTY 方案分析

### 4.1 macOS / Linux — POSIX PTY

#### 实现方式

macOS 和 Linux 都遵循 POSIX 标准，PTY 实现几乎完全一致：

```
内核提供的接口：
  - /dev/ptmx    (POSIX PTY multiplexer，打开后获得 master fd)
  - /dev/pts/N   (slave 设备，由 ptsname() 获取路径)

核心系统调用：
  - posix_openpt() / open("/dev/ptmx")  → 获取 master fd
  - grantpt() / unlockpt()              → 权限设置
  - ptsname()                           → 获取 slave 路径
  - fork() + exec()                     → 在子进程中执行 shell
  - ioctl(TIOCSWINSZ)                   → 设置窗口大小
  - tcsetattr()                         → 设置终端属性
```

更简洁的方式是使用 `forkpty()`（`<pty.h>` / `<util.h>`），一次调用完成 openpty + fork + 绑定。

#### 优势

- 标准 POSIX 接口，几十年历史，极其稳定
- 完整的 Unix 进程模型：fork/exec、信号、文件描述符继承
- shell 就是普通子进程，可以用 `waitpid()` 等待退出
- 不依赖任何特定 shell，启动任何可执行文件均可

#### macOS 特殊注意事项

- App Store 沙箱会限制 fork，建议以 DMG 形式分发
- macOS 默认 shell 已从 bash 切换为 zsh（Catalina 起）
- `openpty()` 在 macOS 中在 `<util.h>` 而非 `<pty.h>`

---

### 4.2 Windows — 为什么不能用相同方案

#### 根本原因：Windows 没有 POSIX PTY

Windows 的进程和 I/O 模型与 Unix 有根本性差异：

| 差异点 | Unix/Linux/macOS | Windows |
|---|---|---|
| 进程创建 | `fork()` + `exec()` | `CreateProcess()` |
| I/O 原语 | 文件描述符 (fd)，一切皆文件 | Handle，控制台有独立 API |
| 终端设备 | `/dev/pts/N`，字符设备文件 | Console（consrv.dll），独立子系统 |
| 终端 API | `tcsetattr()`, `ioctl()` | `SetConsoleMode()`, `GetConsoleScreenBufferInfo()` |
| 信号机制 | `SIGINT`, `SIGWINCH` 等 | `GenerateConsoleCtrlEvent()`, `Ctrl+C` 有独立处理 |
| 进程组 | PGID + session | Job Object，不直接对应 |

**Windows 的 console（控制台）本质上是一个独立的子系统**（`conhost.exe`），而不是一个可以用 fd 读写的设备。历史上没有"PTY"的概念，终端交互高度依赖 Windows Console API，这些 API 无法通过管道模拟。

#### 历史上的解决方案及其缺陷

**方案一：直接用 Windows Console API（早期 mintty、早期 ConEmu）**

控制台 API 是屏幕缓冲区导向的，不是流导向的：
- 通过 `ReadConsoleOutput()` 轮询屏幕缓冲区来"读取"输出
- `WriteConsoleInput()` 向控制台注入键盘事件
- 本质上在"截屏+模拟输入"，而非真正的流式 PTY

**问题**：
- 必须把 conhost 进程隐藏/附加，极其 hack
- 无法在子进程中启动程序并获取它的输出流
- 颜色、ANSI 支持取决于 conhost 版本

**方案二：winpty（2011年出现，MSYS2/Git for Windows 在用）**

winpty 是一个第三方库，在 Windows 上模拟 Unix PTY：
- 创建一个隐藏的 conhost 窗口
- 通过 Windows Console API 轮询该窗口的屏幕缓冲区
- 将截取的内容转换成 ANSI 流输出给调用方

**问题**：
- 本质上还是"屏幕截取"，有延迟，不是真正的流
- 并发性差，对于快速输出的程序（如编译器）会丢字
- 维护困难，winpty 作者也说"这是一个 hack"
- 不支持 256 色以上
- 目前处于半维护状态

**方案三：Cygwin / MSYS2 的 PTY 实现**

在 Windows 上创建一套 POSIX 兼容层，内部模拟 `/dev/ptmx`：
- 需要运行在 Cygwin/MSYS2 环境中，无法与原生 Windows 进程交互
- 原生 `cmd.exe` 程序不能在这个 PTY 里正常工作

#### 现代解决方案：ConPTY（2018，Windows 10 1809+）

微软终于在 2018 年发布了 **ConPTY（Console Pseudo-Terminal）**，从内核层面解决了这个问题。

```
ConPTY 核心 API：
  - CreatePseudoConsole(size, hInput, hOutput, flags, &hPC)
  - ResizePseudoConsole(hPC, size)
  - ClosePseudoConsole(hPC)
  
  使用 CreateProcess() 时通过 STARTUPINFOEX 关联到进程
```

ConPTY 的工作原理：

```
┌─────────────────────────────────────────────────────┐
│  ConPTY Architecture                                 │
│                                                      │
│  终端模拟器 (GUI)                                    │
│     │  write(hWrite) → VT input                     │
│     ▼                                                │
│  Pipe (输入管道)                                     │
│     │                                                │
│     ▼                                                │
│  ConPTY (内核级别 VT 处理)                           │
│     │  内部运行一个连接到 conhost 的 VT 引擎         │
│     ▼                                                │
│  Pipe (输出管道) → VT output stream                  │
│     │                                                │
│     ▼                                                │
│  终端模拟器读取 VT 序列 → xterm.js 渲染              │
│                                                      │
│  Shell 进程 (cmd.exe / pwsh / bash)                  │
│     ↕ 通过标准的 Console API 与 ConPTY 交互          │
└─────────────────────────────────────────────────────┘
```

**ConPTY 的关键特性**：
- 微软官方支持，Windows 10 1809+（Win11 全支持）
- 双向管道（stdin/stdout），与 Unix PTY 的使用方式类似
- 支持完整 VT/ANSI 序列（包括 256 色、真彩色）
- 可以启动任何 Windows 可执行文件（cmd.exe、pwsh、bash.exe WSL 等）
- **完全不依赖 PowerShell**，PowerShell 只是可选的一种 shell

#### 主流终端产品的 Windows 方案

| 产品 | Windows 方案 | 备注 |
|---|---|---|
| **Windows Terminal** | ConPTY | 微软自己的产品，就是 ConPTY 的参考实现 |
| **WezTerm** | ConPTY | `portable-pty` crate 作者的产品，原生 ConPTY |
| **Tabby** | node-pty（ConPTY 封装） | Electron，node-pty 在 Windows 上用 ConPTY |
| **Hyper** | node-pty（ConPTY 封装） | 同上 |
| **VS Code Terminal** | node-pty → ConPTY | 微软维护的 node-pty，Windows 用 ConPTY |
| **Alacritty** | ConPTY | Rust，直接调用 ConPTY |
| **Git for Windows** | winpty | 历史遗留，MSYS2 环境，正在迁移 |
| **ConEmu / Cmder** | 自研 Console API 方案 | 出现早于 ConPTY，有大量 hack |

**结论**：现代终端产品 Windows 端几乎全部使用 ConPTY，这是目前唯一正确的方案。`portable-pty` 这个 Rust crate 完美封装了三平台差异，使用者无需关心底层实现。

#### Windows 兼容性限制

ConPTY 要求 Windows 10 版本 1809（Build 17763）或更高，如果需要支持更老的 Windows：
- Windows 7/8：必须用 winpty 或更 hack 的方式
- Windows 10 早期版本：同上

**建议**：直接要求 Windows 10 1809+，2026 年这个要求合理，Win7/8 市占率极低且已停止支持。

---

## 5. 功能规划与优先级

### Phase 1 — MVP（目标：1-2 个月）

核心目标是验证 PTY 集成可行性，跑通三平台。

- [ ] 单个终端标签，完整 PTY 仿真（含 resize 事件）
- [ ] 多标签页管理（Tab 新建、切换、关闭）
- [ ] 系统默认 Shell 自动检测（macOS/Linux 读 `$SHELL`，Windows 默认 cmd.exe）
- [ ] 基础主题（深色/浅色，字体大小设置）
- [ ] xterm.js 完整 VT 渲染（颜色、光标、滚动缓冲）
- [ ] 三平台 CI/CD 构建和分发

### Phase 2 — 会话管理核心

- [ ] 会话持久化（SQLite 存储会话元数据：名称、目录、历史）
- [ ] 会话恢复（重新连接到保存的工作目录和环境）
- [ ] 分屏：横向/纵向分割（split panes）
- [ ] SSH Profile 管理（主机、端口、用户名、密钥路径）
- [ ] 终端内容搜索（滚动缓冲区全文搜索）
- [ ] 标签分组 / Workspace（按项目组织会话）

### Phase 3 — AI 集成

详见第 6 节。

### Phase 4 — 高级功能

- [ ] SFTP 文件管理器（拖放上传/下载）
- [ ] 端口转发 / SSH 隧道 GUI 管理
- [ ] 多人协作会话（类似 tmux 共享 + WebRTC）
- [ ] 自定义脚本/宏录制
- [ ] 团队配置同步（云端加密同步）

---

## 6. AI 集成分析

### 6.1 核心判断：这是个好方向

你描述的场景——"AI 直接在终端执行命令、观察输出、循环修复，成为与任何机器交互的入口"——这正是 **Agentic Terminal** 概念，是当前 AI + DevOps 工具最有价值的方向之一。

现有竞品的现状：
- **Warp Terminal**：有 AI 命令建议，但 Session 管理能力弱，不支持真正的 Agent 模式
- **Amazon Q CLI**：AWS 生态绑定，不通用
- **Claude Computer Use / Operator**：桌面级别，不是终端专用
- **aider**：代码编辑专用，不是终端管理器

**空白地带**：SSH 多会话管理 + AI Agent 自动化，目前没有专注于此的成熟开源工具。

### 6.2 功能点建议

**Tier 1：低门槛，高频，快速见效**

1. **自然语言转命令**
   ```
   用户输入 # 查找7天内修改的日志文件
   AI 输出  find /var/log -name "*.log" -mtime -7
   Tab 键确认执行，Esc 取消
   ```

2. **错误智能解析**
   ```
   命令执行报错后，自动将错误输出发给 AI
   AI 返回：原因分析 + 修复建议 + 可选的修复命令
   ```

3. **命令解释**
   ```
   选中一段命令，右键"解释这个命令"
   AI 返回每个参数的含义，适合学习和审查
   ```

**Tier 2：核心差异化功能**

4. **AI Agent 模式**

   这是最有价值的功能，本质是给 AI 提供 `execute_command` 工具调用：

   ```
   用户：帮我检查这台服务器的磁盘使用，清理30天前的日志

   AI 执行流程：
     Step 1: execute("df -h")           → 观察各分区使用率
     Step 2: execute("du -sh /var/log/*") → 找出大目录
     Step 3: execute("find /var/log -name '*.gz' -mtime +30 -ls") → 列出可清理文件
     Step 4: 向用户确认：找到 2.3GB 可清理文件，是否继续？
     Step 5: 用户确认后 execute("find /var/log -name '*.gz' -mtime +30 -delete")
   ```

5. **多会话协同 AI**

   ```
   用户：检查所有连接的服务器，找出 CPU 负载最高的那台

   AI：向所有 SSH 会话并行发送 top -bn1 | head -1
       汇总结果，输出比较报表
   ```

6. **会话上下文感知**
   - AI 知道当前工作目录、正在运行的进程
   - 能读取最近 N 行输出作为上下文
   - 支持跨会话对比（"和另一台服务器的输出对比"）

**Tier 3：辅助功能**

7. **Commit Message 生成**（在 git 仓库目录时）
8. **文档查询**（man 页面 AI 解释）
9. **脚本生成**（多步骤任务自动写成 shell 脚本）

### 6.3 AI 集成架构

```
┌─────────────────────────────────────────────────────┐
│  前端 (xterm.js + React)                            │
│  ┌─────────────────────────────────────────────────┐│
│  │  AI 侧边栏 / 内联浮窗 / 底部对话框               ││
│  └─────────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────────┘
                   │ Tauri IPC
┌──────────────────▼──────────────────────────────────┐
│  Rust 后端                                          │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │  会话管理器      │  │  AI 上下文构建器          │  │
│  │  (PTY + 历史)   │→ │  (命令历史 + 近N行输出)   │  │
│  └─────────────────┘  └────────────┬─────────────┘  │
│                                    │                  │
│  ┌─────────────────────────────────▼─────────────┐  │
│  │  AI 服务层 (Provider 抽象)                     │  │
│  │  ├── OpenAI GPT-4o  (云端，精度高)             │  │
│  │  ├── Anthropic Claude (云端，推理强)           │  │
│  │  └── Ollama (本地，llama3/qwen，隐私)          │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  工具执行层 (Tool Call Handler)               │  │
│  │  ├── execute_command(cmd, session_id)         │  │
│  │  ├── read_file(path)                          │  │
│  │  └── list_sessions()                          │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 6.4 安全设计（关键）

AI Agent 执行命令必须有分级权限控制，这是产品安全性的核心：

| 模式 | AI 权限 | 适用场景 |
|---|---|---|
| **建议模式**（默认）| 只能查看，给建议，用户手动执行 | 日常使用 |
| **辅助模式** | 可执行只读命令（`ls`、`cat`、`ps`、`df` 等白名单）| 信任场景 |
| **Agent 模式** | 可执行写操作，危险命令需逐条确认 | 运维任务 |
| **完全自动** | 无需确认，但所有操作记录到审计日志 | CI/CD 等自动化 |

危险命令识别规则（示例）：
```
危险：rm, rmdir, mkfs, dd, chmod 777, curl | bash, > 重定向覆盖
谨慎：sudo, su, kill, systemctl stop, apt remove
安全：ls, cat, echo, grep, find, ps, top, df, ping
```

### 6.5 产品商业化路径

```
开源核心（免费）
├── 基础终端功能
├── 本地 AI（Ollama）集成
└── 个人会话管理

付费功能
├── 云端 AI API 中转（无需用户配置 API Key）
├── 会话云同步（跨设备同步 SSH profiles）
└── 团队功能（共享 workspace、审计日志）
```

---

## 7. 产品定位与市场分析

### 7.1 竞争格局

| 产品 | 优势 | 缺陷 |
|---|---|---|
| **Tabby** | 会话管理强，开源，跨平台 | 无 AI，界面老旧，Electron 重 |
| **Warp** | AI 功能领先，UI 精美 | 不开源，不支持 SSH 会话管理，macOS 为主 |
| **Royal TSX / SecureCRT** | 企业级会话管理 | 付费，无 AI，传统 |
| **Termius** | 跨平台 SSH 管理，UI 好 | 核心功能付费，无 AI Agent |
| **Windows Terminal** | Windows 原生，速度快 | 只有 Windows，无会话管理 |

### 7.2 差异化定位

```
Taix = Tabby 的会话管理能力 + Warp 的 AI 能力 + 开源
```

目标：成为"有 AI 的开源 Tabby"，或者"开源的 Warp + SSH 管理"。

### 7.3 风险

1. **Warp 的竞争**：Warp 正在快速迭代 AI 功能，需要尽快建立用户基础
2. **PTY 复杂度**：跨平台 PTY 的 edge case 很多，早期 bug 会影响用户体验
3. **AI 成本**：如果走 API 中转收费模式，AI 成本是变量

---

## 8. 项目结构建议

```
taix/
├── docs/
│   ├── planning.md          ← 本文档
│   └── architecture.md      ← 后续详细架构文档
│
├── src-tauri/               ← Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── pty/             ← PTY 会话管理
│   │   │   ├── mod.rs
│   │   │   ├── session.rs   ← 单个 PTY 会话
│   │   │   └── manager.rs   ← 多会话调度
│   │   ├── storage/         ← SQLite 持久化
│   │   │   └── mod.rs
│   │   ├── ai/              ← AI 集成层
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs  ← AI Provider 抽象 trait
│   │   │   ├── openai.rs
│   │   │   └── ollama.rs
│   │   └── config/          ← 用户配置
│   │       └── mod.rs
│   └── Cargo.toml
│
├── src/                     ← 前端 TypeScript
│   ├── components/
│   │   ├── Terminal/        ← xterm.js 封装组件
│   │   ├── SessionList/     ← 侧边栏会话列表
│   │   ├── TabBar/          ← 顶部标签栏
│   │   └── AIPanel/         ← AI 对话面板
│   ├── stores/              ← 状态管理
│   ├── types/               ← TypeScript 类型定义
│   └── main.tsx
│
├── package.json
└── tauri.conf.json
```

---

## 附录：关键依赖清单

| 依赖 | 版本要求 | 用途 |
|---|---|---|
| Tauri | 2.x | 跨平台 GUI 框架 |
| portable-pty | 0.8+ | 跨平台 PTY |
| rusqlite | 0.31+ | SQLite 绑定 |
| reqwest | 0.12+ | HTTP 客户端（AI API） |
| tokio | 1.x | Rust 异步运行时 |
| xterm.js | 5.x | 终端前端渲染 |
| @xterm/addon-fit | latest | xterm 窗口适配 |
| @xterm/addon-search | latest | 终端搜索 |
