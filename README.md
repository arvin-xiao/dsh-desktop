# DSH Desktop

DeepSeek Harness (dsh) 的跨平台桌面外壳应用，基于 Electron + React 构建。将 `@deepseek-ai/dsh` 的 Web 模式以桌面应用的方式呈现，提供窗口管理、环境自检、进程托管、终端面板、版本同步等一体化体验。

支持 **Windows** (NSIS 安装包)、**macOS** (DMG，x64 + arm64 通用)、**Linux** (AppImage / deb)。

---

## ✨ 功能特性

- **完整 Web UI 嵌入**：以 webview 方式承载 `dsh web` 的完整前端，体验与 Web 版一致
- **环境自动检测与供应**：自动检查 Node.js 版本（要求 ≥ 22.15.0），系统 Node 不够时自动下载便携版 Node
- **进程托管**：主进程负责启动 / 监控 `dsh web`，支持自动端口扫描（默认 3080）、超时控制、优雅退出
- **内置终端面板**：通过 xterm.js 展示 dsh 实时日志，无需切换到外部终端
- **DSH 版本同步**：
  - 构建时锁定：`npm run sync:dsh` 自动查询 npm 最新版本并写入常量
  - 运行时检查：启动时对比 npm registry，提示升级
  - 一键升级：设置面板内直接切换版本，npx 自动预热新版本
- **设置持久化**：基于 electron-store 保存 DSH 版本、首选端口、Node 策略（系统 / 便携）等偏好
- **进程隔离与安全**：`contextIsolation: true` + `sandbox: true` + preload 白名单桥接，渲染进程不直接接触 Node

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 应用框架 | **Electron 31** |
| 主进程 | **Node.js 22** + **TypeScript** + **tsup**（打包） |
| 渲染进程 | **React 18** + **TypeScript** + **Vite 6** |
| 终端组件 | **xterm.js** + `xterm-addon-fit` / `web-links` |
| 进程通信 | Electron IPC + preload 白名单 API |
| 状态持久化 | **electron-store 8** |
| 版本匹配 | **semver** |
| 日志 | **electron-log 5** |
| 打包发布 | **electron-builder 25** (NSIS / DMG / AppImage / deb) |
| 可选 PTY | **node-pty**（optional dependency，失败不影响安装） |

---

## 📦 项目结构

```
dsh-desktop/
├─ src/
│  ├─ main/                  # Electron 主进程 (Node.js)
│  │  ├─ index.ts            # 入口：初始化日志 / 窗口 / provisioner / IPC
│  │  ├─ modules/
│  │  │  ├─ window.ts        # 窗口管理器：创建 / 定位 / 生命周期
│  │  │  ├─ dsh-process.ts   # DshProcess：启动 / 停止 / 状态监控 dsh
│  │  │  ├─ dsh-version.ts   # 版本同步：查询 npm / 检查升级 / 预热新版本
│  │  │  ├─ env-provisioner.ts  # 环境供应：Node 检测、便携版 Node 下载
│  │  │  ├─ port-scanner.ts  # 端口扫描：从默认端口开始找可用端口
│  │  │  ├─ store.ts         # electron-store 封装
│  │  │  └─ ipc.ts           # IPC 注册：主-渲染桥接
│  │  └─ utils/
│  │     ├─ logger.ts        # electron-log 封装
│  │     └─ npx-path.ts      # 跨平台解析 npx 可执行路径
│  ├─ preload/
│  │  └─ index.ts            # preload 桥接：contextBridge 暴露白名单 API
│  ├─ renderer/              # 渲染进程 (Chromium + React)
│  │  ├─ App.tsx             # 根组件：协调状态 / 环境检测 / dsh 启停
│  │  ├─ main.tsx            # React 入口
│  │  ├─ index.html
│  │  ├─ utils.ts
│  │  ├─ styles/globals.css
│  │  └─ components/
│  │     ├─ TitleBar.tsx        # 自定义标题栏
│  │     ├─ Sidebar.tsx         # 侧边栏：状态 + 快捷操作
│  │     ├─ DshWebview.tsx      # webview 嵌 dsh 前端
│  │     ├─ TerminalPanel.tsx   # 折叠式终端面板（xterm.js）
│  │     └─ SettingsModal.tsx   # 设置面板：版本 / 端口 / Node 策略
│  └─ shared/                # 主/渲染共享
│     ├─ constants.ts        # 常量：包名、端口、版本锁、Node 分发 URL 等
│     └─ types.ts            # 共享类型：EnvReport、DshStatus 等
├─ build/                    # electron-builder 资源（icon 占位）
├─ scripts/
│  └─ sync-dsh-version.mjs   # npm run sync:dsh：锁定 DSH_DEFAULT_VERSION
├─ out/                      # tsup 输出：主进程 / preload
├─ dist/                     # vite 输出：渲染进程
├─ release/                  # electron-builder 输出：安装包
├─ electron-builder.yml      # 打包配置
├─ tsup.main.config.ts       # 主进程 / preload 打包配置
├─ vite.config.ts            # 渲染进程 dev/build 配置
├─ tsconfig.json
└─ package.json
```

---

## 🚀 快速开始

### 前置要求

- **Node.js ≥ 22.15.0**（开发用，运行时不足会自动下载便携版）
- **npm ≥ 10**
- 构建本地二进制依赖时可能需要 Python（用于 node-pty 可选编译）

### 1. 安装依赖

```bash
cd dsh-desktop
npm install
```

> `node-pty` 为 optional，编译失败不影响核心功能（终端面板退化为 stdout 模式）。

### 2. 锁定 DSH 版本（推荐首次安装后执行）

```bash
npm run sync:dsh
```

该脚本查询 npm registry `@deepseek-ai/dsh` 的最新版本，写回 `src/shared/constants.ts` 中的 `DSH_DEFAULT_VERSION`，确保所有构建输出使用一致的 dsh 版本。

### 3. 启动开发模式

```bash
npm run dev
```

会并行启动：
- `dev:main` — tsup 监听主进程 / preload，编译后自动 `electron .` 启动（等待 5173 渲染进程就绪）
- `dev:renderer` — vite 开发服务器（http://localhost:5173）

窗口会自动打开，并开始执行：
1. 环境自检（Node / dsh 可用性）
2. 启动 dsh web 子进程（端口从 3080 开始扫描可用端口）
3. webview 加载 dsh 前端 + 终端面板输出日志

---

## 📦 构建与打包

```bash
# 1. 仅编译（不打包）
npm run build

# 2. 生成可执行目录（测试用，不打安装包）
npm run pack

# 3. 打安装包（按当前平台自动判断）
npm run dist

# 分平台（需要对应操作系统）
npm run dist:win      # Windows x64  → release/DSH-Desktop-Setup-<ver>-x64.exe (NSIS)
npm run dist:mac      # macOS 通用  → release/DSH-Desktop-<ver>-universal.dmg
npm run dist:linux    # Linux x64  → release/DSH-Desktop-<ver>-x64.AppImage + .deb
```

打包产物输出到 `release/` 目录。

---

## 🔄 DSH 版本同步机制

DSH Desktop 通过三层策略保持与 `@deepseek-ai/dsh` 同步：

| 层 | 时机 | 说明 |
|---|---|---|
| **锁定层** | 开发 / 构建前 | `npm run sync:dsh` 查询 npm 并写入 `DSH_DEFAULT_VERSION` 常量 |
| **检查层** | 应用启动时 | 向 npm registry 发起 `GET /@deepseek-ai/dsh/latest`，若大于锁定版本则在 UI 提示 |
| **升级层** | 用户点击「升级」 | 设置面板指定目标版本 → `npx -y @deepseek-ai/dsh@<ver> --version` 预热缓存 → 重启 dsh 进程 |

在 `src/main/modules/dsh-version.ts` 中实现核心 API：

```ts
getDshPackageSpec(preferredVersion?: string)   // 返回传给 npx 的 package spec
getLatestDshVersion(timeout?)                  // 从 npm registry 查询 latest
checkDshVersion(current: string, timeout?)     // 返回 { upToDate, latest }
upgradeDsh(targetVersion, onProgress?)         // npx 预热新版本
```

---

## ⚙️ 配置项（用户侧）

| 项 | 默认值 | 说明 |
|---|---|---|
| DSH 版本 | `DSH_DEFAULT_VERSION` (默认 `latest`) | 设置面板可覆盖，存于 electron-store |
| 首选端口 | `3080` | 若被占用则 +1 扫描 20 个端口 |
| Node 策略 | 优先系统 Node | 系统 Node < 22.15.0 时自动切换为便携版 |
| 终端面板 | 折叠式 | 点击底部 Tab 展开 dsh 日志 |

---

## 🛡 安全模型

- 主进程 / preload 启用 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`
- 渲染进程仅能通过 `window.dshAPI.*` 暴露的白名单方法与主进程通信
- webview 启用 `contextIsolation`、禁用 `nodeIntegration`、限制 `allowpopups` 等权限
- 所有敏感参数（路径、端口、PAT）不写入日志正文，仅在本地 `userData/logs` 调试日志中受限输出

---

## 📄 License

MIT
