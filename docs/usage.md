# Taix — Usage Guide

> For installation and build instructions, see the [main README](../README.md).

---

## Table of Contents

- [Opening Your First Terminal](#opening-your-first-terminal)
- [Session Sidebar](#session-sidebar)
  - [Local Shell](#local-shell)
  - [SSH Sessions](#ssh-sessions)
  - [Organizing with Groups](#organizing-with-groups)
- [Tabs](#tabs)
- [Split Panes](#split-panes)
- [Terminal Search](#terminal-search)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Opening Your First Terminal

When Taix launches, a local shell tab is created automatically. If no sessions are open, the terminal area shows a prompt — click **`+`** in the tab bar or press **`⌘T`** to open the **New Session** modal.

---

## Session Sidebar

The left sidebar lists all your saved sessions and groups. Click the **`+`** button at the top of the sidebar to create a new saved session.

### Local Shell

1. In the **New Session** modal, select the **Local** tab.
2. Optionally set a **Working Directory** to override the default `$HOME`.
3. Click **Connect** — a new tab opens immediately.

### SSH Sessions

1. Select the **SSH** tab in the New Session modal.
2. Fill in the fields:

   | Field | Description |
   |---|---|
   | **Host** | Hostname or IP address of the remote machine |
   | **Port** | Default `22` |
   | **Username** | Remote login user |
   | **Auth** | `Password` (typed interactively), `Private Key` (path to `.pem`/`.id_rsa`), or `SSH Agent` |
   | **Private Key Path** | Visible when **Private Key** is selected; supports `~` expansion |
   | **Working Directory** | Optional remote CWD after login |

3. **Test Connection** (⚡ button at the bottom left) — performs a TCP reachability check using the host/port you entered. Resolves hostnames via the OS DNS stack and `/etc/hosts`.
4. Enable **Save as shortcut** (on by default) to persist the session for quick re-launch.
5. Click **Connect**.

**While connecting**, a spinner overlay ("Connecting to user@host…") is shown over the terminal until the SSH shell is ready. This disappears automatically once the first output arrives.

#### Editing a Saved SSH Session

Right-click (or click the `⋯` button) on a saved session in the sidebar to open the context menu, then choose **Edit**. The modal opens in edit mode with all fields pre-filled. Changes are saved immediately to the local database.

#### Authentication Notes

- **Private Key**: Taix passes `-o PreferredAuthentications=publickey -o PasswordAuthentication=no` to `ssh`, so it will never fall back to password-prompting you. If the key is passphrase-protected, the OS SSH agent should hold the decrypted key (`ssh-add`).
- **SSH Agent**: Relies on `SSH_AUTH_SOCK` being set in the environment where Taix was launched.
- **Host key checking**: New host keys are accepted automatically (`StrictHostKeyChecking=accept-new`). Subsequent connections to the same host will fail if the key changes (protection against MITM).

---

### Organizing with Groups

Click the **`+`** icon next to *Groups* in the sidebar to create a named, color-coded group. Drag saved sessions into groups to organize by project or environment.

---

## Tabs

Each open terminal session occupies a tab in the bar at the top.

- **New tab**: `⌘T` or click `+` in the tab bar → opens the New Session modal.
- **Switch tabs**: Click any tab, or use `⌘1`–`⌘9` to jump to a specific tab by position.
- **Reorder tabs**: Drag a tab to a new position.
- **Close tab**: Click `×` on the tab, or press `⌘W`.

> Tabs are **keep-alive** — switching between them does not destroy the terminal process or its scrollback buffer. Long-running programs (`top`, `vim`, `htop`, build jobs) keep running in the background.

---

## Split Panes

Panes let you view multiple terminals side-by-side in the same window.

| Action | Method |
|---|---|
| Split horizontally (side by side) | `⌘D` or right-click a tab → *Split Horizontal* |
| Split vertically (top/bottom) | `⌘⇧D` or right-click a tab → *Split Vertical* |
| Focus next pane | `⌘]` |
| Focus previous pane | `⌘[` |
| Resize panes | Drag the divider between panes |
| Close active pane | `⌘W` |

Each pane is an independent terminal instance. The active pane is highlighted with a subtle blue ring.

---

## Terminal Search

Press **`⌘F`** while a terminal is focused to open the search bar. Type to highlight matches in the scrollback buffer. Press **`Escape`** or click **✕** to close.

---

## Settings

Open **Settings** via the gear icon in the sidebar footer (or `⌘,`).

### Appearance

| Setting | Options |
|---|---|
| **Theme** | `Dark`, `Light`, `System` (follows OS preference) |
| **Font Family** | Any monospace font installed on your system |
| **Font Size** | In pixels |

### Shell

| Setting | Description |
|---|---|
| **Default Shell** | Path to the shell executable; leave blank to auto-detect (`$SHELL` / system default) |
| **Arguments** | Extra args passed to the shell on launch |
| **Environment Variables** | Key=value pairs injected into every new local session |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘T` | New tab (opens New Session modal) |
| `⌘W` | Close active pane / tab |
| `⌘1` – `⌘9` | Switch to Nth tab |
| `⌘[` | Focus previous pane |
| `⌘]` | Focus next pane |
| `⌘D` | Split active pane horizontally |
| `⌘⇧D` | Split active pane vertically |
| `⌘F` | Open in-terminal search |
| `Escape` | Close search / modal |

> On Linux / Windows replace `⌘` with `Ctrl`.
