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
           - ## Conclusion
         - Insert \`[PROJECT_CARD_index]\` placeholder after the Introduction.
      3. **Formatting**: 
         - Code blocks must specify language.
         - Use bullet points.
      4. **Visuals (CRITICAL & ABSOLUTELY MANDATORY)**:
         - If the 'Available Images' list is NOT empty, you MUST embed at least 1-3 images into the article.
         - **Placement**: Insert images immediately after the section they illustrate (e.g., UI screenshots in "Key Features").
         - **Format**: Use standard Markdown image syntax: \`![description](<url>)\`.
         - **Source**: ONLY use URLs from the "Available Images" list below. Do not make up URLs.
      5. **Technical Depth**:
         - Use professional developer terminology. Avoid over-simplification. Assume the reader is a senior engineer.
      6. **Spoken Broadcast Script (1-Minute Video Script)**:
         - At the very end of the output, add a horizontal rule \`---\`.
         - Add a heading \`## 🎙️ 1分钟口播文案 (1-Minute Spoken Script)\`.
         - Write an engaging, fast-paced script for a short video (Douyin/TikTok/Reels).
         - Length: ~200-250 characters (about 1 minute of speaking).
         - Structure: 3-second hook -> Core pain point solved -> Magic feature -> Call to action (Star the repo).
    `;

    const prompt = `
      **Role**: Senior Technical Editor for an Expert Developer Blog.
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
      (Briefly explain what problem this project solves based on the README.)
      
      [Insert visual card placeholder here: [PROJECT_CARD_0]]
      
      ## 核心功能 (Key Features)
      (List the features found in the README using bullet points.)
      
      (REPLACE THIS LINE WITH ACTUAL MARKDOWN IMAGES FROM THE 'Available Images' LIST, e.g., ![demo](url))
      
      ## 快速开始 (Quick Start)
      (Provide the installation command and a simple usage code example from the README. Wrap in code blocks.)
      
      ## 总结 (Conclusion)
      (Brief verdict, link to repo: https://github.com/${repoPath})
      
      ---
      
      ## 🎙️ 1分钟口播文案
      (1-minute engaging spoken script here)
      
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
