# 你的图书馆（Your Library）

> 「图书馆管理员」主题的 AI 桌宠 —— 桌宠是《大图书馆的牧羊人》里的铃木佳奈。

一个会陪你聊天、帮你找书和论文、和你一起看漫画、时不时主动关心你的桌面伴侣。

## ✨ 功能一览

| 模块 | 说明 |
| --- | --- |
| 🐾 桌宠 | 透明置顶、可拖拽的差分立绘桌宠（15 张表情立绘，按情绪切换） |
| 💬 对话 | 自然语言对话，OpenAI 兼容 API（DeepSeek / 千问 / 智谱），支持工具调用 |
| 🧠 长期记忆 | 自动抽取 + 检索注入 + 时间衰减，跨会话记住你的偏好 |
| 📖 电子书 | Project Gutenberg + Open Library，搜索并下载 epub/txt 到书架 |
| 📄 论文 | OpenAlex 搜索 + 下载 OA PDF + 生成 markdown 解读 |
| 📚 漫画 | 接入 Suwayomi 服务器，搜索 + 按章节下载 + 内置阅读器 |
| 👁️ 视觉 | VLM 看漫画页 / 看电脑屏幕（deepseek-flash 等） |
| 🎧 伴读 / 一起玩 | 看漫画时插嘴发感想；一起玩时看屏幕评论（感想而非复述） |
| ⏰ 时间感知 | 注入当前时间，回复随时间变化；定时主动插嘴关心你 |

## 🚀 快速开始

### 环境要求
- Windows
- Node.js 18+ 与 pnpm

### 安装（首次运行）
双击 `setup.bat`，会自动：
1. 安装依赖（`pnpm install`）
2. 下载 Electron（走 npmmirror 镜像）
3. 创建数据目录（`books/`、`papers/`、`manga/`）
4. 探测你已有的 Suwayomi，或下载到 `vendor/suwayomi/`

### 启动
双击 `start.bat` —— 自动拉起 Suwayomi + 启动桌宠。

### 配置 API
1. 打开桌宠 → 点「设置」。
2. 填入 API 服务商、模型、API Key。
   - 推荐 DeepSeek `deepseek-flash`（文字 + 视觉都可用）
   - 视觉模型可选 `deepseek-flash` / `qwen-vl-plus` / `glm-4v-plus`
3. 保存后即可对话。

### 配置漫画（Suwayomi）
`setup.bat` 会自动探测/下载 Suwayomi。手动管理：
```powershell
powershell -ExecutionPolicy Bypass -File scripts\suwayomi.ps1 -Action start   # 启动
powershell -ExecutionPolicy Bypass -File scripts\suwayomi.ps1 -Action stop    # 停止
```

## 📁 目录结构

```
├── electron/              桌宠壳（main.cjs / preload.cjs / renderer/）
│   ├── character.json     角色卡（铃木佳奈人设、说话风格）
│   ├── status-phrases.json 状态文案（数据驱动，{title} {format} 占位符）
│   ├── api-providers.json 服务商预置
│   └── settings.json      API 配置（含 Key，已 gitignore）
├── assets/portraits/      差分立绘 + manifest.json（情绪/情境映射）
├── src/                   检索核心（TypeScript：电子书/论文聚合检索）
├── scripts/               Suwayomi 安装与管理脚本
├── test/                  单元测试
├── setup.bat              首次运行安装
└── start.bat              启动
```

## 🔧 配置说明

- `electron/settings.json`：API 配置、字体、图标缩放、Suwayomi 地址（**含 API Key，勿提交**）。
- `electron/character.json`：角色卡（人设、口癖、边界）。
- `electron/config.json`：窗口尺寸、协议、数据目录。
- `electron/status-phrases.json`：检索/下载的状态文案。
- `.env.example`：检索核心的可选环境变量（书/论文源）。

## 🧪 测试

```bash
pnpm typecheck   # 类型检查
pnpm test        # 单元测试
pnpm smoke       # 在线自检
```

## 路线图

见 [PLAN.md](PLAN.md)。
