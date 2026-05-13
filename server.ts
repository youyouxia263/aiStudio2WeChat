import express from 'express';
import { createServer as createViteServer } from 'vite';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import { marked } from 'marked';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// --- In-Memory Task Store ---
interface Task {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  url: string;
  content?: string;
  title?: string;
  error?: string;
  createdAt: number;
}

const tasks: Record<string, Task> = {};

// --- Helper Functions (Duplicated from frontend for now) ---

const extractImagesFromMarkdown = (markdown: string, repoPath: string, defaultBranch: string): string[] => {
  const candidates: { url: string; score: number }[] = [];
  const rawBase = `https://raw.githubusercontent.com/${repoPath}/${defaultBranch}`;
  
  const SCORE = {
    FEATURE_KEYWORD: 10,
    DIAGRAM_KEYWORD: 5,
    ANIMATION: 8,
    STANDARD: 1
  };

  const processUrl = (url: string, altText: string = "") => {
    url = url.trim().split(/\s+/)[0]; // Remove markdown titles if any
    if (!url) return;
    
    if (url.match(/(shield\.io|badge|travis|ci|codecov|circleci|icon|logo|npm|sponsors|backers|contributors|graph|hit|activity|analytics|tracker)/i)) return;
    if (url.includes('avatars.githubusercontent.com')) return;
    if (url.includes('github.com/sponsors')) return;

    if (!url.startsWith('http')) {
        let cleanPath = url.replace(/^(\.\/|\/)/, '');
        url = `${rawBase}/${cleanPath}`;
    } else if (url.includes('github.com') && url.includes('/blob/')) {
        url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }

    let score = SCORE.STANDARD;
    const lowerUrl = url.toLowerCase();
    const lowerAlt = altText.toLowerCase();

    const highPriority = ['demo', 'screenshot', 'preview', 'example', 'usage', 'gui', 'ui', 'interface', 'screen', 'showcase'];
    if (highPriority.some(k => lowerUrl.includes(k) || lowerAlt.includes(k))) score += SCORE.FEATURE_KEYWORD;

    const mediumPriority = ['diagram', 'architecture', 'flow', 'structure', 'overview'];
    if (mediumPriority.some(k => lowerUrl.includes(k) || lowerAlt.includes(k))) score += SCORE.DIAGRAM_KEYWORD;

    if (lowerUrl.endsWith('.gif') || lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm')) score += SCORE.ANIMATION;

    candidates.push({ url, score });
  };

  const mdRegex = /!\[(.*?)\]\((.*?)\)/g;
  let match;
  while ((match = mdRegex.exec(markdown)) !== null) {
    processUrl(match[2], match[1]);
  }

  const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlRegex.exec(markdown)) !== null) {
    processUrl(match[1], ""); 
  }

  const sorted = candidates.sort((a, b) => b.score - a.score);
  return Array.from(new Set(sorted.map(c => c.url))).slice(0, 15); 
};

async function processTask(taskId: string, repoUrl: string) {
  const task = tasks[taskId];
  if (!task) return;

  task.status = 'processing';

  try {
    // 1. Parse Repo Info
    let repoPath = repoUrl.replace('https://github.com/', '').replace(/\/$/, '');
    if (repoPath.split('/').length > 2) repoPath = repoPath.split('/').slice(0, 2).join('/');

    // 2. Fetch Repo Data
    const repoRes = await fetch(`https://api.github.com/repos/${repoPath}`);
    if (!repoRes.ok) throw new Error(`GitHub Repo Not Found: ${repoRes.status}`);
    const repoData = await repoRes.json();

    // 3. Fetch README
    const readmeRes = await fetch(`https://api.github.com/repos/${repoPath}/readme`);
    if (!readmeRes.ok) throw new Error("README Not Found");
    const readmeData = await readmeRes.json();
    const readmeContent = atob(readmeData.content);

    // 4. Extract Images
    const images = extractImagesFromMarkdown(readmeContent, repoPath, repoData.default_branch);

    // 5. Generate Content with Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const coreGuidelines = `
      **Core Writing Rules (Based on README)**:
      1. **Fact-First**: 
         - Write **strictly based on the provided README content**.
      2. **Strict Chapter Levels**:
         - Article must strictly follow this H2 hierarchy:
           - ## Introduction
           - ## Key Features
           - ## Installation & Usage
           - ## Use Cases (Optional)
           - ## 写在最后
         - Insert \`[PROJECT_CARD_index]\` placeholder after the Introduction.
      3. **Formatting**: 
         - Code blocks must specify language.
         - Use bullet points.
      4. **Visuals (CRITICAL & ABSOLUTELY MANDATORY)**:
         - **Strict Rule**: Regardless of the writing style, if the 'Available Images' list is not empty, you **MUST** interleave these real project images throughout the article.
         - **Storytelling Logic**: Use the images to enhance the story's logic, flow, and readability (e.g., placing UI screenshots right after describing a feature, or architecture diagrams when explaining how it works).
         - **Format**: Use standard Markdown image syntax \`![description](<url>)\`.
         - **Source**: ONLY use URLs from the "Available Images" list below. Do NOT hallucinate URLs.
      5. **Safety & Compliance (CRITICAL)**:
         - **Absolute Prohibition**: The generated article MUST NOT contain any descriptions of illegal activities or guide users towards illegal behaviors.
         - Strictly prohibited topics include: violative content against constitution, subversion of state power, endangering national security, terrorism, violence, gambling, pornography, superstition, discrimination, spreading rumors, and defamation. Maintain adherence to all public order and moral standards.
      6. **Tone & Style (CRITICAL & STRICT)**:
         - **Extreme Brevity (极简短句)**: Use very short, punchy sentences. Break long sentences into smaller ones. Write like a casual WeChat Moments post or a tweet.
         - **Data & Facts First**: Highlight numbers immediately (e.g., "两个月从零冲到 1.4 万的Star", "有 30 个专业 Agent 角色").
         - **Conversational & Grounded (极度接地气)**: Write as if chatting with a developer friend. Use casual connectors like "跟...一样", "直接", "就行", "还支持".
         - **BANNED WORDS (绝对禁用)**: Do NOT use any marketing fluff, corporate jargon, or formal transitions. You are FORBIDDEN from using phrases like: "正是为了解决这一痛点而生", "旨在", "致力于", "提供了一套", "不仅...更...", "跃迁", "赋能", "生态", "矩阵", "往往会陷入...迷茫".
         - **Clean Markdown Emphasis**: For text emphasis (bolding, coloring), ONLY use standard Markdown `**bold**` syntax. NEVER use HTML tags like `<font>`, `<span>`, or `<b>`.
         - **Example Style**: "oh-my-codex 跟上面那个 oh-my-claudecode 是同一个作者。把类似的多 Agent 编排理念移植到了 OpenAI Codex CLI 上。两个月从零冲到 1.4 万的Star，增长速度在开源项目里相当少见。有 30 个专业 Agent 角色和 40 多个 Skill。支持在 tmux 里启动最多 20 个 Worker 并行干活。npm install -g oh-my-codex 之后 omx setup 就行。"
    `;

    const prompt = `
      **Role**: Engaging Tech Storyteller and Developer Advocate.
      **Task**: Write a structured, in-depth introduction article for the GitHub project "${repoPath}".
      
      **Input Data**:
      - Name: ${repoPath}
      - Description: ${repoData.description}
      - **README Content**: 
      """
      ${readmeContent.slice(0, 15000)} 
      """
      - Available Images: 
      ${images.length > 0 ? images.map((img, i) => `${i+1}. ${img}`).join('\n      ') : 'None'}
      
      ${coreGuidelines}

      **Strict Article Structure (Markdown)**:
      
      # (Generate a clear, benefit-oriented Title)
      
      > (One sentence summary)
      
      ## 项目简介 (Introduction)
      (Write 3-4 extremely short, casual sentences explaining what it is, who made it, and any impressive stats like stars/growth. Do NOT use any banned marketing words. Be direct and conversational.)
      
      [Insert visual card placeholder here: [PROJECT_CARD_0]]
      
      ## 核心功能 (Key Features)
      (List the features using very short, casual bullet points. E.g., "支持在 tmux 里启动最多 20 个 Worker 并行干活。")
      
      (REPLACE THIS LINE WITH ACTUAL MARKDOWN IMAGES FROM THE 'Available Images' LIST, e.g., ![demo](url))
      
      ## 快速开始 (Quick Start)
      (Provide the installation command and a casual 1-sentence explanation. E.g., "npm install -g oh-my-codex 之后 omx setup 就行。")
      
      ## 写在最后
      (Brief verdict, link to repo: https://github.com/${repoPath})
      
      **Language**: Chinese (Simplified).
    `;

    const model = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract Title
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `开源项目介绍: ${repoPath.split('/')[1]}`;

    task.status = 'success';
    task.content = text;
    task.title = title;

  } catch (err: any) {
    console.error(`Task ${taskId} failed:`, err);
    task.status = 'error';
    task.error = err.message || "Unknown error";
  }
}

// --- API Routes ---

app.post('/api/proxy', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Missing url' });
      return;
    }
    const response = await fetch(url);
    if (!response.ok) {
        res.status(response.status).json({ error: `Fetch failed: ${response.statusText}` });
        return;
    }
    const text = await response.text();
    res.json({ content: text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/generate', (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('github.com')) {
    res.status(400).json({ error: 'Invalid GitHub URL' });
    return;
  }

  const taskId = uuidv4();
  tasks[taskId] = {
    id: taskId,
    status: 'pending',
    url,
    createdAt: Date.now()
  };

  // Start async processing
  processTask(taskId, url);

  res.json({ 
    taskId, 
    status: 'pending',
    message: 'Task submitted successfully. Check status at /api/status/:taskId' 
  });
});

app.get('/api/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks[taskId];

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json(task);
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files (if built)
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
