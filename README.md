# Git2WeChat Pro - 智能公众号文章生成器

## 简介

**Git2WeChat Pro** 是一款专为技术博主和公众号运营者打造的 AI 效率工具。利用 Google Gemini 等先进大模型的多模态能力，它可以一键将 GitHub 仓库链接转化为排版精美、内容详实、且包含专业视觉卡片的微信公众号文章。

无需手动截图、翻译文档或设计封面，Git2WeChat Pro 帮您全自动搞定，让技术分享更简单、更高效。

## ✨ 核心功能

*   **🚀 智能数据解析**: 
    *   自动调用 GitHub API 获取仓库的 Star、Fork、Issue 数量。
    *   精准计算贡献者（Contributors）数量（支持自动翻页统计）。
    *   抓取前排贡献者头像。
*   **📝 AI 深度写作**: 
    *   生成符合微信阅读习惯的 Viral 风格文章。
    *   自动构建清晰的章节结构：核心功能、快速开始、应用场景等。
    *   智能优化排版，使用列表和代码块提升可读性。
*   **🎨 自动化视觉设计**:
    *   **AI 绘图**: 根据项目内容自动生成高质量的文章头图。
    *   **动态卡片**: 为每个项目生成专属的数据展示卡片（Glassmorphism 玻璃拟态风格）。
    *   **头像合成**: 自动将真实的 GitHub 贡献者头像合成到项目卡片中，增加真实感。
*   **🌍 多语言与多模型**: 
    *   支持中/英双语界面与内容生成。
    *   兼容多种 LLM 服务商：Google Gemini (默认), 阿里百炼 (Qwen), 火山引擎 (Doubao), 以及 OpenAI 兼容接口。
*   **🔮 魔法发现**: 内置 AI 推荐引擎，一键发现热门趋势或 AI 精选项目。
*   **🛠 个性化定制**:
    *   提供多种文章视觉主题（标准白、赛博朋克、午夜蓝）。
    *   支持字体切换与自定义配色。
*   **📋 一键发布**:
    *   **复制微信格式**: 完美保留样式与代码高亮，直接粘贴至公众号后台。
    *   **复制 Markdown**: 获取源码以便二次编辑。

## 📦 部署与使用指南

### 1. 本地部署 (Local Deployment)

本项目采用纯前端架构（HTML + Babel Standalone），无需复杂的 Node.js 构建流程（如 Webpack/Vite），只要启动一个静态 Web 服务即可运行。

**依赖**: 任意静态文件服务器 (如 `python`, `http-server`, `live-server`, `nginx` 等)。

**步骤**:

1.  **获取代码**:
    ```bash
    git clone https://github.com/your-repo/git2wechat-pro.git
    cd git2wechat-pro
    ```

2.  **启动服务**:
    为了避免浏览器的跨域限制 (CORS) 和模块加载安全策略，**请勿直接双击 `index.html` 打开**，请使用命令行启动 HTTP 服务：

    *   **使用 Python (推荐)**:
        ```bash
        # Python 3
        python3 -m http.server 8000
        ```
    *   **使用 Node.js (http-server)**:
        ```bash
        npx http-server .
        ```

3.  **访问**: 打开浏览器访问 `http://localhost:8000`。

### 2. 国内网络环境配置 (China Network Support)

由于 Google Gemini API 在国内网络环境下通常无法直接连接，我们提供了多种无需“魔法”的解决方案：

#### 方案 A: 切换至国内大模型 (稳定推荐)
Git2WeChat Pro 内置了对国内主流大模型的支持，速度快且稳定。

1.  启动应用后，点击右上角的 **⚙️ 系统设置**。
2.  在 **“大模型引擎”** 栏目中选择：
    *   **阿里百炼 (Alibaba)**: 需申请 DashScope API Key，默认使用 `qwen-max` 模型。
    *   **火山引擎 (Volcengine)**: 需申请火山引擎 API Key，默认使用 `doubao-pro` 系列模型。
3.  填入对应的 API Key 保存即可。

#### 方案 B: 使用自定义代理 (OpenAI 格式)
如果你购买了第三方的模型中转服务（通常兼容 OpenAI 接口格式）：

1.  在设置中选择 **“自定义 (Custom)”**。
2.  **Base URL**: 填入中转服务商提供的接口地址（例如 `https://api.openai-proxy.com/v1`）。
3.  **API Key**: 填入中转 Key。
4.  **Model ID**: 手动填入该服务商支持的模型名称（如 `gpt-4o`, `gemini-1.5-pro` 等）。

#### 方案 C: 本地代理转发
如果你希望使用 Gemini 且本地有代理工具：
1.  确保你的代理工具接管了系统流量，或浏览器配置了正确的代理。
2.  确保代理规则覆盖了 `generativelanguage.googleapis.com`。

### 3. 在线/云端部署 (Static Hosting)

本项目是纯静态页面，非常适合免费托管在各大静态网站平台：

*   **Vercel / Netlify / Cloudflare Pages**:
    1.  Fork 本项目到你的 GitHub。
    2.  在托管平台（如 Vercel）导入该仓库。
    3.  **Build Settings**:
        *   Build Command: (留空)
        *   Output Directory: `.` (根目录)
    4.  点击部署。
    *   *注意：Vercel 分配的 `*.vercel.app` 域名在国内可能无法访问，建议在 Vercel 后台绑定一个自定义域名以确保国内直连。*

## 📖 操作流程

1.  **配置 API Key**: 首次进入页面，请先点击右上角设置，填入你的 LLM API Key（Gemini 或其他）。
2.  **输入地址**: 在输入框粘贴 GitHub 仓库链接，或点击“✨ 热门趋势”让 AI 自动推荐。
3.  **选择模式**:
    *   🔥 **深度安利**: 适合单个项目，生成痛点分析、详细教程。
    *   📊 **盘点合集**: 适合输入多个链接，生成项目对比列表。
4.  **生成**: 点击按钮，等待 AI 分析代码、撰写文案并绘制图表（通常需要 30-60 秒）。
5.  **导出**: 预览无误后，点击“复制微信格式”，直接粘贴到微信公众号后台编辑器即可发布。

## ⚙️ 技术栈

*   **前端框架**: React 18 (通过 ESM 引入，无构建步骤)
*   **样式方案**: Tailwind CSS (CDN)
*   **AI SDK**: `@google/genai`
*   **Markdown 渲染**: `marked` & `highlight.js`
*   **运行环境**: 浏览器端直接编译 (@babel/standalone)

## ⚠️ 免责声明

本项目生成的文章内容基于大模型推理，虽然经过 Prompt 优化，但建议在发布前进行人工校对，以确保技术细节的绝对准确。