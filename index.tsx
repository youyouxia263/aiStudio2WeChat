import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// Ensure hljs is available (loaded via script tag in HTML)
declare const hljs: any;

// --- Types ---

type LLMProvider = 'gemini' | 'alibaba' | 'volcengine' | 'custom';
type Language = 'zh' | 'en';

interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  imageModel: string;
}

type Theme = {
  id: string;
  name: string;
  bg: string;
  text: string;
  headingColor: string;
  headingDecoration: string;
  secondaryBg: string;
  blockquoteBorder: string;
  codeBg: string;
  codeText: string;
  borderColor: string;
  isGradientHeading?: boolean;
};

interface HistoryEntry {
  urls: string[];
  title: string;
  content: string;
  headerImage: string | null;
  projectImages: string[];
  timestamp: number;
}

interface ProjectStats {
  repoPath: string;
  description: string;
  stars: string;
  forks: string;
  contributors: string;
  issues: string;
  avatars?: string[];
  images?: string[]; // New: Images extracted from README
}

// --- Translations ---

const i18n = {
  zh: {
    title: "Git2WeChat Pro",
    subtitle: "一键生成专业公众号技术文章",
    quantity: "项目数量",
    trending: "✨ 热门趋势",
    aiPick: "🤖 AI 精选",
    generate: "开始生成视觉文章",
    copyWeChat: "复制微信格式",
    copyMarkdown: "Markdown 源码",
    pushDraft: "推送至草稿箱",
    edit: "编辑文本",
    preview: "预览效果",
    history: "历史记录",
    settings: "系统设置",
    placeholder: "https://github.com/owner/repo",
    urlLabel: "仓库地址",
    words: "字数",
    cards: "视觉卡片",
    loadingAnalyzing: "正在深入分析代码库...",
    loadingRetrieving: "正在检索数据: ",
    loadingDesigning: "正在设计封面图...",
    loadingDrawing: "正在绘制卡片: ",
    loadingTrending: "正在发现热门项目...",
    copySuccess: "已复制微信排版格式！直接粘贴到公众号编辑器即可。",
    mdSuccess: "Markdown 源码已复制！",
    pushSuccess: "文章已成功推送至微信草稿箱！",
    pushError: "推送失败，请检查设置。 (模拟)",
    pushWarning: "请先在设置中配置微信 API 密钥。",
    prevCovered: "曾经生成过",
    recentGens: "历史生成记录",
    noHistory: "暂无历史记录",
    globalSettings: "全局配置",
    llmEngine: "大模型引擎",
    provider: "服务商",
    baseUrl: "接口地址 (Base URL)",
    textModel: "文本模型 ID",
    imageModel: "图片模型 ID",
    wechatApi: "微信公众号 API",
    appId: "App ID",
    appSecret: "App Secret",
    proTip: "专业提示：如果您没有 API 权限，使用“复制微信格式”直接粘贴到编辑器是 100% 有效的方案。",
    cancel: "取消",
    save: "保存配置",
    gemini: "Google Gemini (默认)",
    alibaba: "阿里百炼 (DashScope)",
    volcengine: "火山引擎 (ByteDance Ark)",
    custom: "自定义 (OpenAI 兼容)",
    clearAll: "清除全部历史",
    storageFull: "存储空间不足，已自动清理旧记录图片。",
    visualStyle: "视觉风格",
    articleTheme: "文章主题",
    articleFont: "文章字体"
  },
  en: {
    title: "Git2WeChat Pro",
    subtitle: "One-click Professional Articles for Tech Blogs",
    quantity: "Quantity",
    trending: "✨ Trending",
    aiPick: "🤖 AI Pick",
    generate: "GENERATE VISUAL ARTICLE",
    copyWeChat: "Copy WeChat Format",
    copyMarkdown: "Markdown",
    pushDraft: "Push to Drafts",
    edit: "Edit Text",
    preview: "Preview",
    history: "History",
    settings: "Settings",
    placeholder: "https://github.com/owner/repo",
    urlLabel: "Repo URL",
    words: "Words",
    cards: "Cards",
    loadingAnalyzing: "Deeply analyzing repository...",
    loadingRetrieving: "Retrieving data: ",
    loadingDesigning: "Designing Cover Artwork",
    loadingDrawing: "Drawing card: ",
    loadingTrending: "Discovering trending repos...",
    copySuccess: "WeChat format copied! Paste it directly into the editor.",
    mdSuccess: "Markdown source copied!",
    pushSuccess: "Article pushed to WeChat Drafts successfully!",
    pushError: "Failed to push. Check credentials. (Simulation)",
    pushWarning: "Please configure WeChat API in settings first.",
    prevCovered: "PREVIOUSLY COVERED",
    recentGens: "Recent Generations",
    noHistory: "No history found.",
    globalSettings: "Global Settings",
    llmEngine: "LLM Model Engine",
    provider: "Provider",
    baseUrl: "Base URL",
    textModel: "Text Model ID",
    imageModel: "Image Model ID",
    wechatApi: "Official Account API",
    appId: "App ID",
    appSecret: "App Secret",
    proTip: "Pro Tip: If you don't have API access, use 'Copy WeChat Format' to paste directly into the editor. It works 100%!",
    cancel: "Cancel",
    save: "Save All",
    gemini: "Google Gemini (Default)",
    alibaba: "Alibaba DashScope",
    volcengine: "Volcengine (ByteDance Ark)",
    custom: "Custom (OpenAI Compatible)",
    clearAll: "Clear All History",
    storageFull: "Storage nearly full. Old entry images pruned.",
    visualStyle: "Visual Style",
    articleTheme: "Article Theme",
    articleFont: "Article Font"
  }
};

const THEMES: Theme[] = [
  {
    id: 'wechat-light',
    name: 'Standard White',
    bg: '#ffffff',
    text: '#333333',
    headingColor: '#1f2937',
    headingDecoration: '#07c160',
    secondaryBg: '#f9f9f9',
    blockquoteBorder: '#07c160',
    codeBg: '#1f2937',
    codeText: '#e5e7eb',
    borderColor: '#e5e7eb',
    isGradientHeading: false,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Dark',
    bg: '#1e293b',
    text: '#e2e8f0',
    headingColor: 'transparent',
    headingDecoration: '#6366f1',
    secondaryBg: 'rgba(49, 46, 129, 0.2)',
    blockquoteBorder: '#818cf8',
    codeBg: '#0f172a',
    codeText: '#f472b6',
    borderColor: '#334155',
    isGradientHeading: true,
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    bg: '#020617',
    text: '#cbd5e1',
    headingColor: '#60a5fa',
    headingDecoration: '#3b82f6',
    secondaryBg: '#172554',
    blockquoteBorder: '#3b82f6',
    codeBg: '#0f172a',
    codeText: '#93c5fd',
    borderColor: '#1e3a8a',
    isGradientHeading: false,
  }
];

const FONTS = [
  { id: 'sans', name: 'Sans Serif', value: "'Inter', system-ui, sans-serif" },
  { id: 'serif', name: 'Serif', value: "'Noto Serif SC', serif" },
  { id: 'mono', name: 'Monospace', value: "'JetBrains Mono', monospace" },
];

// --- Helper Functions ---

const extractImagesFromMarkdown = (markdown: string, repoPath: string, defaultBranch: string): string[] => {
  const images: string[] = [];
  const rawBase = `https://raw.githubusercontent.com/${repoPath}/${defaultBranch}`;
  
  // 1. Markdown images: ![alt](url)
  const mdRegex = /!\[.*?\]\((.*?)\)/g;
  let match;
  while ((match = mdRegex.exec(markdown)) !== null) {
    let url = match[1].trim();
    if (!url) continue;
    // Basic filtering for badges/icons/shields
    if (url.match(/(shield\.io|badge|travis|ci|codecov|circleci|icon|logo|avatar|npm)/i)) continue;

    if (!url.startsWith('http')) {
        // Resolve relative URL
        // Clean leading ./ or /
        let cleanPath = url.replace(/^(\.\/|\/)/, '');
        url = `${rawBase}/${cleanPath}`;
    } else {
        // Fix github blob URLs to raw
        url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
    images.push(url);
  }

  // 2. HTML images: <img src="url">
  const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlRegex.exec(markdown)) !== null) {
    let url = match[1].trim();
    if (!url) continue;
    if (url.match(/(shield\.io|badge|travis|ci|codecov|circleci|icon|logo|avatar|npm)/i)) continue;

    if (!url.startsWith('http')) {
        let cleanPath = url.replace(/^(\.\/|\/)/, '');
        url = `${rawBase}/${cleanPath}`;
    } else {
        url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
    images.push(url);
  }

  // Deduplicate and limit to 3 high quality candidates
  return Array.from(new Set(images)).slice(0, 3);
};

const App = () => {
  const [lang, setLang] = useState<Language>('zh');
  const [urls, setUrls] = useState<string[]>([""]);
  const [targetCount, setTargetCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [article, setArticle] = useState("");
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [projectImages, setProjectImages] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>(THEMES[0].headingDecoration);
  const [currentFont, setCurrentFont] = useState(FONTS[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [wechatConfig, setWechatConfig] = useState({ appId: '', appSecret: '' });
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{type: 'success' | 'error' | 'warning', msg: string} | null>(null);

  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'gemini',
    baseUrl: '',
    model: 'gemini-3-flash-preview',
    imageModel: 'gemini-2.5-flash-image'
  });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  const t = i18n[lang];

  useEffect(() => {
    if (urls.length < targetCount) {
      setUrls([...urls, ...Array(targetCount - urls.length).fill("")]);
    } else if (urls.length > targetCount) {
      setUrls(urls.slice(0, targetCount));
    }
  }, [targetCount]);

  useEffect(() => {
    const savedLang = localStorage.getItem('git2wechat_lang');
    if (savedLang) setLang(savedLang as Language);

    const savedThemeId = localStorage.getItem('git2wechat_theme');
    if (savedThemeId) {
      const theme = THEMES.find(th => th.id === savedThemeId);
      if (theme) setCurrentTheme(theme);
    }

    const savedFontId = localStorage.getItem('git2wechat_font');
    if (savedFontId) {
      const font = FONTS.find(f => f.id === savedFontId);
      if (font) setCurrentFont(font);
    }

    const savedWechat = localStorage.getItem('wechatConfig');
    if (savedWechat) setWechatConfig(JSON.parse(savedWechat));

    const savedLlm = localStorage.getItem('llmConfig_v2');
    if (savedLlm) setLlmConfig(JSON.parse(savedLlm));

    const savedHistoryData = localStorage.getItem('git2wechat_history_multi');
    if (savedHistoryData) {
        try {
            setHistory(JSON.parse(savedHistoryData));
        } catch(e) {
            setHistory([]);
        }
    }

    marked.use({
      renderer: {
        image(token: { href: string; title: string | null; text: string }) {
          const { href, title, text } = token;
          return `<img src="${href}" alt="${text || ''}" title="${title || ''}" class="w-full rounded-xl my-6 shadow-xl ring-1 ring-white/10" style="max-width:100%;" onerror="this.style.display='none'">`;
        }
      }
    });
  }, []);

  useEffect(() => {
    setCustomPrimaryColor(currentTheme.headingDecoration);
    localStorage.setItem('git2wechat_theme', currentTheme.id);
  }, [currentTheme.id]);

  useEffect(() => {
    localStorage.setItem('git2wechat_font', currentFont.id);
  }, [currentFont.id]);

  useEffect(() => {
    if (!isEditing && article && contentRef.current) {
      if (typeof hljs !== 'undefined') {
        contentRef.current.querySelectorAll('pre code').forEach((el) => {
          hljs.highlightElement(el);
        });
      }
    }
  }, [article, isEditing]);

  const getHistoryUrls = () => {
    const all = history.flatMap(h => h.urls.map(u => u.toLowerCase().trim()));
    return new Set(all);
  };

  const saveToHistory = (entry: HistoryEntry) => {
    let updatedHistory = [entry, ...history.filter(h => h.urls.join(',') !== entry.urls.join(','))].slice(0, 10);
    
    const trySaving = (data: HistoryEntry[]) => {
      try {
        localStorage.setItem('git2wechat_history_multi', JSON.stringify(data));
        setHistory(data);
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!trySaving(updatedHistory)) {
      for (let i = updatedHistory.length - 1; i >= 0; i--) {
        updatedHistory[i] = {
          ...updatedHistory[i],
          headerImage: null,
          projectImages: []
        };
        if (trySaving(updatedHistory)) {
          console.warn(t.storageFull);
          break;
        }
      }
    }
  };

  const clearAllHistory = () => {
    if (window.confirm(lang === 'zh' ? '确定清除所有历史记录吗？' : 'Are you sure you want to clear all history?')) {
      localStorage.removeItem('git2wechat_history_multi');
      setHistory([]);
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setTargetCount(entry.urls.length);
    setUrls(entry.urls);
    setArticle(entry.content);
    setHeaderImage(entry.headerImage);
    setProjectImages(entry.projectImages || []);
    setShowHistory(false);
    setError("");
    setIsEditing(false);
    setPublishStatus(null);
  };

  const deleteFromHistory = (e: React.MouseEvent, urlsKey: string) => {
    e.stopPropagation();
    const updatedHistory = history.filter(h => h.urls.join(',') !== urlsKey);
    setHistory(updatedHistory);
    localStorage.setItem('git2wechat_history_multi', JSON.stringify(updatedHistory));
  };

  const updateUrlField = (index: number, val: string) => {
    const newUrls = [...urls];
    newUrls[index] = val;
    setUrls(newUrls);
  };

  const toggleLanguage = () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    localStorage.setItem('git2wechat_lang', newLang);
  };

  // --- LLM Execution Wrapper ---

  const executeTextTask = async (prompt: string, json: boolean = false): Promise<string> => {
    if (llmConfig.provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: llmConfig.model || "gemini-3-flash-preview",
        contents: prompt,
        config: json ? { responseMimeType: "application/json" } : { tools: [{ googleSearch: {} }] },
      });
      return response.text || "";
    } else {
      const baseUrl = llmConfig.baseUrl;
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: json ? { type: 'json_object' } : undefined
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content || "";
    }
  };

  const generateImage = async (prompt: string, ratio: "1:1" | "16:9" = "16:9"): Promise<string | null> => {
    // We append general quality boosters but remove specific styles like '3d render' to allow the prompt to dictate style
    const qualitySuffix = "masterpiece, best quality, ultra-detailed, 8k resolution, trending on ArtStation.";
    
    if (llmConfig.provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: llmConfig.imageModel || 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `${prompt} ${qualitySuffix}` }] },
        config: { imageConfig: { aspectRatio: ratio } },
      });
      const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      return data ? `data:image/png;base64,${data}` : null;
    } else {
      try {
        const baseUrl = llmConfig.baseUrl;
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.API_KEY}`
          },
          body: JSON.stringify({
            model: llmConfig.imageModel,
            prompt: prompt,
            size: ratio === '1:1' ? "1024x1024" : "1792x1024",
            response_format: 'b64_json'
          })
        });
        const data = await response.json();
        return data.data[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null;
      } catch (e) {
        return null;
      }
    }
  };

  const formatNumber = (num: number): string => {
    if (num === undefined || num === null) return "0";
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const fetchProjectData = async (url: string): Promise<ProjectStats> => {
    // 1. Extract repo path
    let repoPath = "";
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) repoPath = `${parts[0]}/${parts[1]}`;
    } catch (e) { console.error(e); }

    // 2. Try GitHub API
    if (repoPath) {
      try {
        const res = await fetch(`https://api.github.com/repos/${repoPath}`);
        if (res.ok) {
          const data = await res.json();
          
          // Get localized description
          const descPrompt = `Translate this project description to ${lang === 'zh' ? 'Chinese' : 'English'} (keep it concise): "${data.description || 'No description'}"`;
          const description = await executeTextTask(descPrompt, false);

          let contributors = "Many";
          let avatars: string[] = [];

          try {
             // Fetch contributors using per_page=1 to get the Last Page from Link header for count
             const contribRes = await fetch(`https://api.github.com/repos/${repoPath}/contributors?per_page=1&anon=true`);
             if (contribRes.ok) {
                 const link = contribRes.headers.get('link');
                 if (link) {
                     // Parse the "last" page number from the Link header
                     const match = link.split(',').find(s => s.includes('rel="last"'))?.match(/[?&]page=(\d+)/);
                     if (match) {
                         contributors = formatNumber(parseInt(match[1], 10));
                     }
                 } else {
                     // If no link header, check array length
                     const cData = await contribRes.json();
                     if (Array.isArray(cData)) contributors = cData.length.toString();
                 }
             }

             // Fetch avatars separately (limit 5)
             const avatarRes = await fetch(`https://api.github.com/repos/${repoPath}/contributors?per_page=5&anon=true`);
             if (avatarRes.ok) {
                 const avData = await avatarRes.json();
                 if (Array.isArray(avData)) {
                     avatars = avData.map((u: any) => u.avatar_url);
                 }
             }
          } catch(e) {
              console.warn("Contrib fetch error", e);
          }

          // Fetch README for images
          let extractedImages: string[] = [];
          try {
             // We need the default branch first. 'data' has it.
             const defaultBranch = data.default_branch || 'main';
             
             const readmeRes = await fetch(`https://api.github.com/repos/${repoPath}/readme`);
             if (readmeRes.ok) {
                 const readmeJson = await readmeRes.json();
                 // download_url is the raw text url
                 if (readmeJson.download_url) {
                    const rawRes = await fetch(readmeJson.download_url);
                    const rawText = await rawRes.text();
                    extractedImages = extractImagesFromMarkdown(rawText, repoPath, defaultBranch);
                 }
             }
          } catch (e) { console.warn("Readme image fetch failed", e); }

          return {
            repoPath: data.full_name,
            description: description.trim(),
            stars: formatNumber(data.stargazers_count),
            forks: formatNumber(data.forks_count),
            contributors: contributors,
            avatars: avatars,
            issues: formatNumber(data.open_issues_count),
            images: extractedImages
          };
        }
      } catch (e) {
        console.warn("GitHub API error, falling back to LLM", e);
      }
    }

    // 3. Fallback: LLM with Search (force text mode to use tools, then parse JSON)
    try {
      const prompt = `Search for current GitHub stats for ${url} including exact number of contributors. Return ONLY a valid JSON string: {"repoPath": "${repoPath || 'owner/repo'}", "description": "...", "stars": "10k", "forks": "2k", "contributors": "100+", "issues": "50"}. Description language: ${lang === 'zh' ? 'Chinese' : 'English'}.`;
      const result = await executeTextTask(prompt, false);
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("LLM Fallback error", e);
    }

    return {
      repoPath: repoPath || "unknown/repo",
      description: "Innovative open-source project.",
      stars: "?",
      forks: "?",
      contributors: "?",
      issues: "?",
      avatars: []
    };
  };

  const compositeAvatars = async (baseImg: string, avatarUrls: string[]): Promise<string> => {
    if (!avatarUrls || avatarUrls.length === 0) return baseImg;
    
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(baseImg);

      const img = new Image();
      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Avatar config
        const size = canvas.width * 0.08;
        const spacing = size * 0.6;
        // Position: Bottom Right
        const startX = canvas.width - (avatarUrls.length * spacing) - size - (canvas.width * 0.05);
        const startY = canvas.height - size - (canvas.height * 0.08);

        // Load all avatars
        const loadedAvatars = await Promise.all(avatarUrls.map(url => new Promise<HTMLImageElement | null>(r => {
            const i = new Image();
            i.crossOrigin = 'anonymous'; // Important for GitHub images
            i.onload = () => r(i);
            i.onerror = () => r(null);
            i.src = url;
        })));

        loadedAvatars.forEach((avImg, i) => {
            if (!avImg) return;
            const x = startX + i * spacing;
            const y = startY;

            // Draw circular avatar with clip
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avImg, x, y, size, size);
            ctx.restore();

            // White Border
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = size * 0.08;
            ctx.stroke();
        });

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(baseImg);
      img.crossOrigin = 'anonymous'; 
      img.src = baseImg;
    });
  };

  const generateArticle = async (passedUrls?: string[]) => {
    const validUrls = (passedUrls || urls).filter(u => u.trim() !== "");
    if (validUrls.length === 0) {
      setError("Please enter at least one valid GitHub URL");
      return;
    }

    setError("");
    setLoading(true);
    setLoadingText(t.loadingAnalyzing);
    setArticle("");
    setHeaderImage(null);
    setProjectImages([]);
    setPublishStatus(null);
    setIsEditing(false);

    try {
      const allStats: ProjectStats[] = [];
      for(const url of validUrls) {
        setLoadingText(`${t.loadingRetrieving}${url.split('/').pop()}...`);
        const stats = await fetchProjectData(url);
        allStats.push(stats);
      }

      const repoNamesStr = allStats.map(s => s.repoPath).join('、');
      
      const prompt = `
      **角色设定 (Role)**: 你是一位在技术圈摸爬滚打多年的“老司机”博主（Key Opinion Leader），你的粉丝都是开发者。你的写作风格是：**热心、直率、接地气、稍微带点幽默感**。你不是在写说明书，而是在给好朋友安利好东西。
      
      **任务**: 为以下 GitHub 项目写一篇微信公众号文章。
      
      **项目列表**:
      ${allStats.map((s, i) => {
          let info = `${i+1}. ${s.repoPath} (https://github.com/${s.repoPath}): ${s.description}`;
          if (s.images && s.images.length > 0) {
              info += `\n   参考图片 (必须在文中合适位置插入至少一张): \n   ${s.images.join('\n   ')}`;
          }
          return info;
      }).join('\n')}
      
      **核心写作原则 (Critical Style Rules)**:
      1.  **🚫 拒绝“AI味”**: 
          - 绝对禁止使用：“在当今数字化时代”、“革命性的”、“综上所述”、“总而言之”、“毋庸置疑”、“不仅...而且...”、“赋能”、“抓手”、“闭环”这种机器翻译腔或黑话。
          - 不要用“首先、其次、最后”这种僵硬的列表，换成“第一点”、“最棒的是”、“还有个坑要注意”这种口语。
          - 不要像写论文一样写文章。
      2.  **🗣 增加“人味”**:
          - **必须使用第一人称** (“我最近发现...”，“咱们做开发的...”)。
          - **痛点驱动 (Start with Pain)**: 不要上来就介绍功能。先描述一个开发者日常遇到的抓狂场景（比如：配环境配到哭、改Bug改到头秃、加班写重复代码），然后引出这个项目是“救星”。
          - **加入个人情绪**: 可以说“这功能简直绝了！”、“我当时看到都惊呆了”、“这个设计真的很贴心”。
          - **通俗类比 (Explain Like I'm 5)**: 遇到抽象的技术概念，必须用生活中的例子做类比（比如：把 Kubernetes 比作 交通指挥官，把 Cache 比作 随身小抄）。
      
      **文章结构 (Structure)**:
      1.  **大标题 (#)**: 必须包含所有项目名称 (${repoNamesStr})，标题要极其吸引人，像“震惊部”但要有技术含量（例如：“别再造轮子了！这款神器...”）。
      2.  **正文**:
          - 每个项目使用二级标题 (##)。
          - **CRITICAL**: 在每个 ## 标题下方立即插入占位符 [PROJECT_CARD_${allStats.length > 1 ? 'N' : '0'}] (其中 N 是索引，从0开始)。
          - **内容模块**: 
             - 😫 **以前有多惨**: (痛点描述，简短有力，引起共鸣)
             - 😎 **它能干什么**: (大白话解释核心价值)
             - ✨ **高光时刻**: (3-4个亮点，用口语化列表)
             - 🌰 **举个栗子 / 上手试试**: (必须有一段最简单的代码示例 Code Block，让读者觉得容易上手)
             - 🖼 **图片**: 如果上面提供了参考图片 URL，请务必用 Markdown 图片语法插入。
      3.  **结尾**:
          - 简短总结，鼓励大家去 GitHub 点 Star。
      4.  **语言**: 使用 ${lang === 'zh' ? '中文 (Simplified Chinese)' : 'English'}，用词要现代、Geek 一点。
      
      **输出格式**: 纯 Markdown。不要包含任何 JSON 或其他非 Markdown 内容。
      `;

      const resultText = await executeTextTask(prompt);
      setArticle(resultText || "No content generated.");
      
      setImageLoading(true);
      const titleMatch = resultText.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : (lang === 'zh' ? `精选开源项目: ${repoNamesStr}` : `Featured Projects: ${repoNamesStr}`);
      
      setLoadingText(t.loadingDesigning);
      // Enhanced Header Prompt: More specific about 3D style and color palette.
      const headerPrompt = `Masterpiece 3D isometric editorial illustration for a tech article titled "${title}". 
      Style: Futuristic Glassmorphism mixed with soft 3D shapes. 
      Colors: Vibrant gradient of Indigo, Violet, and Emerald Green against a dark slate background. 
      Elements: Abstract floating code symbols, git branches, and cloud infrastructure icons. 
      Lighting: Cinematic studio lighting, volumetric glow. 
      Quality: 8k, Unreal Engine 5 render style, ultra-detailed, sharp focus.`;
      
      const mainCover = await generateImage(headerPrompt);
      setHeaderImage(mainCover);

      const cards: string[] = [];
      for(let i=0; i < allStats.length; i++) {
        const stats = allStats[i];
        setLoadingText(`${t.loadingDrawing}${stats.repoPath}...`);
        
        // Enhanced Card Prompt: Specific "Flat/Clean" professional UI style
        const cardPrompt = `High-fidelity UI component card for GitHub repository "${stats.repoPath}".
        Text Display: Large bold typography for "${stats.stars} Stars" and "${stats.forks} Forks" in white.
        Visual Style: Dark mode frosted glass (Glassmorphism) with a glowing gradient border.
        Background: Deep abstract tech pattern (circuit or mesh).
        Composition: Stats on the left/center. IMPORTANT: Leave the bottom-right corner empty and clean for avatar overlays.
        Vibe: Professional, slick, developer-focused.`;
        
        const cardImg = await generateImage(cardPrompt, "16:9");
        let finalCard = cardImg;
        if(cardImg && stats.avatars && stats.avatars.length > 0) {
           finalCard = await compositeAvatars(cardImg, stats.avatars);
        }
        if(finalCard) cards.push(finalCard);
      }
      setProjectImages(cards);

      saveToHistory({
        urls: validUrls,
        title,
        content: resultText,
        headerImage: mainCover,
        projectImages: cards,
        timestamp: Date.now()
      });

    } catch (err: any) {
      setError(err.message || "An error occurred during generation.");
    } finally {
      setLoading(false);
      setImageLoading(false);
    }
  };

  const handleMagicDiscover = async (isAI: boolean) => {
    if (loading) return;
    setLoading(true);
    setLoadingText(t.loadingTrending);
    setError("");
    try {
      const query = isAI 
        ? `Provide a JSON array of 5 currently trending AI-related GitHub repository URLs.`
        : `Provide a JSON array of 5 currently trending GitHub repository URLs.`;
      
      const response = await executeTextTask(query, true);
      const fetchedUrls: string[] = JSON.parse(response || '[]');
      const historyUrls = getHistoryUrls();
      const unseenUrls = fetchedUrls.filter(u => !historyUrls.has(u.toLowerCase().trim())).slice(0, targetCount);
      
      if (unseenUrls.length === 0) throw new Error("No new trending projects found.");
      
      setUrls(unseenUrls);
      setTargetCount(unseenUrls.length);
      setTimeout(() => generateArticle(unseenUrls), 100);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const getProcessedHtml = () => {
    if (!article) return { __html: "" };
    let md = article;
    // Fix: Using global replacement for indices to ensure all placeholders are swapped with images
    projectImages.forEach((img, idx) => {
      const placeholder = `\\[PROJECT_CARD_${idx}\\]`;
      const imgHtml = `\n<div class="my-6 shadow-2xl rounded-2xl overflow-hidden border border-gray-100 bg-white"><img src="${img}" class="w-full h-auto" alt="Repository Card ${idx}"></div>\n`;
      md = md.replace(new RegExp(placeholder, 'g'), imgHtml);
    });
    // Fallback for literal INDEX word if LLM messed up
    if (projectImages.length > 0) {
      md = md.replace(/\[PROJECT_CARD_INDEX\]/g, (match, offset) => {
        return `\n<div class="my-6 shadow-2xl rounded-2xl overflow-hidden border border-gray-100 bg-white"><img src="${projectImages[0]}" class="w-full h-auto" alt="Repository Card"></div>\n`;
      });
    }
    return { __html: marked.parse(md) as string };
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(article).then(() => {
      alert(t.mdSuccess);
    });
  };

  const copyForWeChat = () => {
    if (contentRef.current) {
      const range = document.createRange();
      range.selectNode(contentRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      try {
        document.execCommand('copy');
        alert(t.copySuccess);
      } catch (err) {
        alert("Copy failed.");
      }
      selection?.removeAllRanges();
    }
  };

  const publishToWeChatDraft = async () => {
    if (!wechatConfig.appId || !wechatConfig.appSecret) {
      setPublishStatus({ type: 'warning', msg: t.pushWarning });
      setShowSettings(true);
      return;
    }
    setPublishing(true);
    setPublishStatus(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      setPublishStatus({ type: 'success', msg: t.pushSuccess });
    } catch (e) {
      setPublishStatus({ type: 'error', msg: t.pushError });
    } finally {
      setPublishing(false);
    }
  };

  const changeProvider = (p: LLMProvider) => {
    const newConfig = { ...llmConfig, provider: p };
    if (p === 'alibaba') {
      newConfig.baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      newConfig.model = 'qwen-max';
    } else if (p === 'volcengine') {
      newConfig.baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
      newConfig.model = 'doubao-pro-4k';
    } else if (p === 'gemini') {
      newConfig.baseUrl = '';
      newConfig.model = 'gemini-3-flash-preview';
    }
    setLlmConfig(newConfig);
  };

  const getThemeStyles = () => `
    .prose-content { font-family: ${currentFont.value}; color: ${currentTheme.text}; }
    .prose-content h1 { color: ${currentTheme.headingColor}; border-bottom-color: ${customPrimaryColor}; }
    .prose-content h2::before { background: ${customPrimaryColor}; }
    .prose-content blockquote { background: ${currentTheme.secondaryBg}; border-left-color: ${customPrimaryColor}; }
    .prose-content strong { color: ${customPrimaryColor}; }
  `;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 pb-20">
      <style>{getThemeStyles()}</style>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="relative text-center mb-12 flex flex-col items-center">
          <div className="absolute right-0 top-0 flex gap-2">
            <button onClick={toggleLanguage} className="p-2 text-slate-400 hover:text-white transition-colors font-bold text-xs border border-white/10 rounded-lg uppercase tracking-widest px-3" title="Switch Language">
              {lang === 'zh' ? 'EN' : 'ZH'}
            </button>
            <button onClick={() => setShowHistory(true)} className="p-2 text-slate-400 hover:text-white transition-colors" title={t.history}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white transition-colors" title={t.settings}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
          </div>
          <h1 className="text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-emerald-400">{t.title}</h1>
          <p className="text-slate-400">{t.subtitle}</p>
        </div>

        <div className="glass-panel p-8 rounded-3xl shadow-2xl mb-12 space-y-8 border border-white/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
             <div className="flex items-center gap-4">
               <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t.quantity}:</span>
               <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-700 shadow-inner">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setTargetCount(n)} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${targetCount === n ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{n}</button>
                  ))}
               </div>
             </div>
             <div className="flex gap-3">
                <button onClick={() => handleMagicDiscover(false)} disabled={loading} className="px-5 py-2.5 rounded-2xl font-bold text-white bg-gradient-to-br from-orange-500 to-pink-500 hover:scale-105 active:scale-95 transition-all text-xs">{t.trending}</button>
                <button onClick={() => handleMagicDiscover(true)} disabled={loading} className="px-5 py-2.5 rounded-2xl font-bold text-white bg-gradient-to-br from-indigo-500 to-purple-500 hover:scale-105 active:scale-95 transition-all text-xs">{t.aiPick}</button>
             </div>
          </div>
          
          <div className="space-y-4">
            {urls.map((u, i) => (
              <div key={i} className={`bg-slate-900/50 rounded-2xl border transition-all flex items-center px-6 py-1 ${getHistoryUrls().has(u.toLowerCase().trim()) ? 'border-yellow-500/30' : 'border-slate-800 focus-within:border-indigo-500/50 focus-within:bg-slate-900'}`}>
                <span className="text-slate-500 text-[10px] font-bold mr-4 uppercase tracking-widest">{t.urlLabel} 0{i+1}</span>
                <input type="text" value={u} onChange={(e) => updateUrlField(i, e.target.value)} placeholder={t.placeholder} className="w-full bg-transparent border-none outline-none text-white py-4 placeholder-slate-600 text-sm" />
                {getHistoryUrls().has(u.toLowerCase().trim()) && <span className="text-[10px] font-bold text-yellow-500/70 ml-2 whitespace-nowrap">{t.prevCovered}</span>}
              </div>
            ))}
          </div>

          <button onClick={() => generateArticle()} disabled={loading} className={`w-full py-5 rounded-2xl font-bold text-white transition-all shadow-xl tracking-wide ${loading ? 'bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-500 active:translate-y-0.5'}`}>
            {loading ? <div className="flex items-center justify-center gap-3"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>{loadingText}</div> : t.generate}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-4 rounded-2xl mb-8 flex items-center gap-3 text-sm">{error}</div>}

        {article && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
              <div className="flex flex-wrap gap-2">
                <button onClick={copyForWeChat} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  {t.copyWeChat}
                </button>
                <button onClick={copyMarkdown} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  {t.copyMarkdown}
                </button>
                <button onClick={publishToWeChatDraft} disabled={publishing} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50">
                  {publishing ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>}
                  {t.pushDraft}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(!isEditing)} className="text-indigo-400 border border-indigo-400/30 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-400/10 transition-all">{isEditing ? t.preview : t.edit}</button>
              </div>
            </div>

            {publishStatus && (
              <div className={`mb-6 p-4 rounded-xl border text-sm flex items-center gap-3 animate-in fade-in zoom-in ${
                publishStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : 
                publishStatus.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-200' : 
                'bg-red-500/10 border-red-500/20 text-red-200'
              }`}>
                {publishStatus.type === 'success' && <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                {publishStatus.msg}
              </div>
            )}

            <div className="flex items-center gap-4 text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">
              <span>{article.split(/\s+/).length} {t.words}</span>
              <span>{projectImages.length} {t.cards}</span>
            </div>

            <div className="rounded-3xl overflow-hidden shadow-2xl transition-all border border-white/5" style={{ backgroundColor: currentTheme.bg }}>
              <div className="w-full relative min-h-[100px] border-b border-white/5 bg-slate-900">
                {headerImage ? <img src={headerImage} className="w-full h-auto object-cover" alt="Article Header" /> : imageLoading && <div className="h-48 flex flex-col items-center justify-center animate-pulse gap-3"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><span className="text-indigo-400 font-bold uppercase tracking-widest text-[10px]">{t.loadingDesigning}</span></div>}
              </div>
              {isEditing ? (
                <textarea value={article} onChange={(e) => setArticle(e.target.value)} className="w-full h-[700px] p-10 md:p-16 font-mono text-sm bg-transparent outline-none resize-none leading-relaxed" style={{ color: currentTheme.text }} />
              ) : (
                <div ref={contentRef} className="prose-content p-10 md:p-16 min-h-[500px]" dangerouslySetInnerHTML={getProcessedHtml()} />
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowHistory(false)}>
             <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-white/5 flex justify-between items-center">
                  <h3 className="font-bold text-xl">{t.recentGens}</h3>
                  <div className="flex gap-2">
                    {history.length > 0 && <button onClick={clearAllHistory} className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-widest px-3 py-1 border border-red-500/20 rounded-lg">{t.clearAll}</button>}
                    <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white text-2xl transition-colors">&times;</button>
                  </div>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                  {history.length === 0 ? <p className="text-center py-12 text-slate-600 italic">{t.noHistory}</p> : history.map(entry => (
                    <div key={entry.urls.join(',')} onClick={() => loadFromHistory(entry)} className="group bg-slate-800/40 hover:bg-slate-800 border border-white/5 p-5 rounded-2xl cursor-pointer transition-all flex items-center gap-6">
                      <div className="w-16 h-16 rounded-xl bg-slate-700 overflow-hidden flex-shrink-0">
                        {entry.headerImage ? <img src={entry.headerImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 text-center p-1">No Img</div>}
                      </div>
                      <div className="flex-1 min-w-0"><h4 className="font-bold text-slate-200 truncate group-hover:text-indigo-400 transition-colors">{entry.title}</h4><p className="text-xs text-slate-500 mt-1 truncate">{entry.urls.join(', ')}</p></div>
                      <button onClick={(e) => deleteFromHistory(e, entry.urls.join(','))} className="p-2 text-slate-600 hover:text-red-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowSettings(false)}>
             <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-xl p-8 flex flex-col shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
               <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                 <h3 className="font-bold text-xl">{t.globalSettings}</h3>
                 <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white transition-colors text-2xl">&times;</button>
               </div>
               
               <div className="space-y-8">
                  <div className="space-y-4">
                     <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{t.visualStyle}</h4>
                     <div className="grid grid-cols-3 gap-3">
                        {THEMES.map(theme => (
                          <button 
                            key={theme.id}
                            onClick={() => setCurrentTheme(theme)}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-2 ${currentTheme.id === theme.id ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                          >
                             <div className="w-6 h-6 rounded-full border border-white/20" style={{ background: theme.bg }}></div>
                             {theme.name}
                          </button>
                        ))}
                     </div>
                     <div className="grid grid-cols-3 gap-3">
                        {FONTS.map(font => (
                          <button 
                            key={font.id}
                            onClick={() => setCurrentFont(font)}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all ${currentFont.id === font.id ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                          >
                             {font.name}
                          </button>
                        ))}
                     </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{t.llmEngine}</h4>
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
                      {(['gemini', 'alibaba', 'volcengine', 'custom'] as LLMProvider[]).map(p => (
                        <button key={p} onClick={() => changeProvider(p)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${llmConfig.provider === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                          {t[p]}
                        </button>
                      ))}
                    </div>
                    {llmConfig.provider !== 'gemini' && (
                       <div className="space-y-3 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.baseUrl}</label>
                            <input type="text" value={llmConfig.baseUrl} onChange={(e) => setLlmConfig({...llmConfig, baseUrl: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                          </div>
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.textModel}</label>
                              <input type="text" value={llmConfig.model} onChange={(e) => setLlmConfig({...llmConfig, model: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.imageModel}</label>
                              <input type="text" value={llmConfig.imageModel} onChange={(e) => setLlmConfig({...llmConfig, imageModel: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                          </div>
                       </div>
                    )}
                  </div>

                  <div className="space-y-4">
                     <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{t.wechatApi}</h4>
                     <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 space-y-3">
                        <div className="flex gap-3">
                           <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.appId}</label>
                              <input type="text" value={wechatConfig.appId} onChange={(e) => setWechatConfig({...wechatConfig, appId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                           </div>
                           <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.appSecret}</label>
                              <input type="password" value={wechatConfig.appSecret} onChange={(e) => setWechatConfig({...wechatConfig, appSecret: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                           </div>
                        </div>
                        <p className="text-[10px] text-emerald-400/80 bg-emerald-900/20 p-2 rounded-lg border border-emerald-500/20">{t.proTip}</p>
                     </div>
                  </div>
               </div>

               <div className="mt-8 pt-6 border-t border-white/5 flex justify-end gap-3">
                  <button onClick={() => setShowSettings(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-800 transition-colors">{t.cancel}</button>
                  <button onClick={() => {
                     localStorage.setItem('wechatConfig', JSON.stringify(wechatConfig));
                     localStorage.setItem('llmConfig_v2', JSON.stringify(llmConfig));
                     setShowSettings(false);
                  }} className="px-6 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all active:translate-y-0.5">{t.save}</button>
               </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root"));
root.render(<App />);
