import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// Ensure hljs is available (loaded via script tag in HTML)
declare const hljs: any;

// --- Types ---

type LLMProvider = 'gemini' | 'alibaba' | 'volcengine' | 'custom';
type Language = 'zh' | 'en';
type StructureMode = 'story' | 'tutorial' | 'analysis';

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

interface TOCItem {
  id: string;
  text: string;
  level: number;
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
    genPoster: "生成分享海报",
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
    loadingTrending: "正在抓取 GitHub Trending...",
    loadingPoster: "正在绘制海报...",
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
    articleFont: "文章字体",
    posterTitle: "朋友圈分享海报",
    posterDesc: "长按保存图片，分享到朋友圈或群聊",
    downloadPoster: "下载海报",
    humanize: "拟人化润色 (Humanizer)",
    humanizing: "正在进行拟人化重写...",
    humanizeSuccess: "文章已完成去 AI 化润色！",
    structureMode: "文章偏好",
    modeStory: "🔥 深度安利 (单项目推荐)",
    modeTutorial: "📖 实战教程 (单项目教学)",
    modeAnalysis: "📊 盘点合集 (多项目推荐)",
    toc: "文章目录"
  },
  en: {
    title: "Git2WeChat Pro",
    subtitle: "One-click Professional Articles for Tech Blogs",
    quantity: "Quantity",
    trending: "✨ Trending",
    aiPick: "🤖 AI Pick",
    generate: "GENERATE VISUAL ARTICLE",
    copyWeChat: "Copy WeChat Format",
    copyMarkdown: "Copy Markdown",
    genPoster: "Generate Poster",
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
    loadingTrending: "Scraping GitHub Trending...",
    loadingPoster: "Drawing poster...",
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
    articleFont: "Article Font",
    posterTitle: "Social Share Poster",
    posterDesc: "Long press to save and share",
    downloadPoster: "Download Image",
    humanize: "Humanize Text",
    humanizing: "Humanizing text...",
    humanizeSuccess: "Text successfully humanized!",
    structureMode: "Article Preference",
    modeStory: "🔥 Deep Dive (Single)",
    modeTutorial: "📖 Tutorial (Single)",
    modeAnalysis: "📊 Collection (Multi)",
    toc: "Table of Contents"
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

const STRUCTURES: {id: StructureMode, labelKey: keyof typeof i18n.zh}[] = [
    { id: 'story', labelKey: 'modeStory' },
    { id: 'tutorial', labelKey: 'modeTutorial' },
    { id: 'analysis', labelKey: 'modeAnalysis' },
];

// --- Helper Functions ---

const fetchGithubTrending = async (): Promise<string[]> => {
  try {
    const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://github.com/trending?since=daily'));
    if (!res.ok) throw new Error("Failed to fetch trending");
    const html = await res.text();
    const regex = /<h2[^>]*>\s*<a[^>]*href=["']\/?([^"']+)["'][^>]*>/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const path = match[1];
      if (path && path.split('/').length === 2 && !matches.includes(`https://github.com/${path}`)) {
         matches.push(`https://github.com/${path}`);
      }
      if (matches.length >= 10) break; 
    }
    return matches;
  } catch (e) {
    console.error("Trending scrape failed", e);
    return [];
  }
};

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
    url = url.trim();
    if (!url) return;
    
    if (url.match(/(shield\.io|badge|travis|ci|codecov|circleci|icon|logo|npm|sponsors|backers|contributors|graph|hit|activity|analytics|tracker)/i)) return;
    if (url.includes('avatars.githubusercontent.com')) return;
    if (url.includes('github.com/sponsors')) return;

    if (!url.startsWith('http')) {
        let cleanPath = url.replace(/^(\.\/|\/)/, '');
        url = `${rawBase}/${cleanPath}`;
    } else {
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
  return Array.from(new Set(sorted.map(c => c.url))).slice(0, 5); 
};

const slugify = (text: string) => text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');

const App = () => {
  const [lang, setLang] = useState<Language>('zh');
  const [urls, setUrls] = useState<string[]>([""]);
  const [targetCount, setTargetCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [article, setArticle] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [projectImages, setProjectImages] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [humanizing, setHumanizing] = useState(false);
  
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>(THEMES[0].headingDecoration);
  const [currentFont, setCurrentFont] = useState(FONTS[0]);
  const [structureMode, setStructureMode] = useState<StructureMode>('story');

  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [showPoster, setShowPoster] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterLoading, setPosterLoading] = useState(false);
  
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
  const [mainProjectStats, setMainProjectStats] = useState<ProjectStats | null>(null);

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
        },
        heading(token) {
           const text = token.text;
           const level = token.depth;
           const id = slugify(text);
           return `<h${level} id="${id}">${text}</h${level}>`;
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
    setArticleTitle(entry.title);
    setHeaderImage(entry.headerImage);
    setProjectImages(entry.projectImages || []);
    setShowHistory(false);
    setError("");
    setIsEditing(false);
    setPublishStatus(null);
    setMainProjectStats(null); 
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

  const parseTOC = (md: string): TOCItem[] => {
      const lines = md.split('\n');
      const toc: TOCItem[] = [];
      lines.forEach(line => {
        const match = line.match(/^(#{2,3})\s+(.*)/);
        if(match) {
           const level = match[1].length;
           const text = match[2].trim();
           const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
           toc.push({ level, text: cleanText, id: slugify(cleanText) });
        }
      });
      return toc;
  };

  const scrollToHeading = (id: string) => {
     const el = document.getElementById(id);
     if (el) {
         el.scrollIntoView({ behavior: 'smooth', block: 'start' });
     }
  };

  // --- LLM Execution Wrapper ---

  const executeTextTask = async (prompt: string, json: boolean = false, includeGrounding: boolean = false): Promise<string> => {
    if (llmConfig.provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: llmConfig.model || "gemini-3-flash-preview",
        contents: prompt,
        config: json ? { responseMimeType: "application/json" } : { tools: [{ googleSearch: {} }] },
      });
      
      let text = response.text || "";
      
      if (includeGrounding && !json && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          const chunks = response.candidates[0].groundingMetadata.groundingChunks;
          const uniqueLinks = new Map<string, string>();
          
          chunks.forEach((c: any) => {
              if (c.web?.uri && c.web?.title) {
                  uniqueLinks.set(c.web.uri, c.web.title);
              }
          });
          
          if (uniqueLinks.size > 0) {
              const header = lang === 'zh' ? '### 🔗 参考资料' : '### 🔗 References';
              text += `\n\n${header}\n`;
              uniqueLinks.forEach((title, uri) => {
                  text += `- [${title}](${uri})\n`;
              });
          }
      }
      return text;
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
    let repoPath = "";
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) repoPath = `${parts[0]}/${parts[1]}`;
    } catch (e) { console.error(e); }

    if (repoPath) {
      try {
        const res = await fetch(`https://api.github.com/repos/${repoPath}`);
        if (res.ok) {
          const data = await res.json();
          
          const descPrompt = `Translate this project description to ${lang === 'zh' ? 'Chinese' : 'English'} (keep it concise): "${data.description || 'No description'}"`;
          const description = await executeTextTask(descPrompt, false);

          let contributors = "Many";
          let avatars: string[] = [];

          try {
             const contribRes = await fetch(`https://api.github.com/repos/${repoPath}/contributors?per_page=1&anon=true`);
             if (contribRes.ok) {
                 const link = contribRes.headers.get('link');
                 if (link) {
                     const match = link.split(',').find(s => s.includes('rel="last"'))?.match(/[?&]page=(\d+)/);
                     if (match) {
                         contributors = formatNumber(parseInt(match[1], 10));
                     }
                 } else {
                     const cData = await contribRes.json();
                     if (Array.isArray(cData)) contributors = cData.length.toString();
                 }
             }

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

          let extractedImages: string[] = [];
          try {
             const defaultBranch = data.default_branch || 'main';
             
             const readmeRes = await fetch(`https://api.github.com/repos/${repoPath}/readme`);
             if (readmeRes.ok) {
                 const readmeJson = await readmeRes.json();
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

        const size = canvas.width * 0.08;
        const spacing = size * 0.6;
        const startX = canvas.width - (avatarUrls.length * spacing) - size - (canvas.width * 0.05);
        const startY = canvas.height - size - (canvas.height * 0.08);

        const loadedAvatars = await Promise.all(avatarUrls.map(url => new Promise<HTMLImageElement | null>(r => {
            const i = new Image();
            i.crossOrigin = 'anonymous'; 
            i.onload = () => r(i);
            i.onerror = () => r(null);
            i.src = url;
        })));

        loadedAvatars.forEach((avImg, i) => {
            if (!avImg) return;
            const x = startX + i * spacing;
            const y = startY;

            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avImg, x, y, size, size);
            ctx.restore();

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
    setArticleTitle("");
    setHeaderImage(null);
    setProjectImages([]);
    setPublishStatus(null);
    setIsEditing(false);
    setMainProjectStats(null);

    try {
      const allStats: ProjectStats[] = [];
      for(const url of validUrls) {
        setLoadingText(`${t.loadingRetrieving}${url.split('/').pop()}...`);
        const stats = await fetchProjectData(url);
        allStats.push(stats);
      }
      if(allStats.length > 0) setMainProjectStats(allStats[0]);

      const repoNamesStr = allStats.map(s => s.repoPath.split('/')[1]).join('、');

      const searchInstruction = lang === 'zh' 
        ? `**Grounding (Google Search)**:
           - 必须使用 Google Search 获取该项目最新的 Hacker News 评论、Reddit 讨论或官方博客更新。
           - 将这些真实评价融入文章（如“Reddit 网友评论说...”）。
           - 补充 README 中没有的实际应用案例。`
        : `**Grounding (Google Search)**:
           - Must use Google Search to find recent Hacker News comments, Reddit discussions, or official blog updates.
           - Integrate these real reviews (e.g., "A Reddit user mentioned...").
           - Add real-world use cases not found in the README.`;

      const coreGuidelines = `
      **Core Writing Rules (CRITICAL)**:
      1. **No AI Speak**: Avoid "In the digital age", "Revolutionary", "Game-changer", "Furthermore", "In conclusion". Use natural, conversational "Old Driver" (expert techie) tone.
      2. **Human Touch**: Use "I found", "We developers", "Check this out". Express excitement ("This is mind-blowing!").
      3. **Visuals**: 
         - Use Markdown \`![]()\` for images provided in Project Info.
         - **Mandatory**: Insert placeholders \`[PROJECT_CARD_index]\` exactly where specified in the structure.
      `;

      let prompt = "";

      if (allStats.length === 1) {
          const s = allStats[0];
          
          const sectionHeaders = lang === 'zh' 
            ? {
                p1: "1. 痛点与背景",
                p2: `2. 什么是 ${s.repoPath.split('/')[1]}?`,
                p3: "3. 核心功能",
                p4: "4. 快速上手",
                p5: "5. 应用场景",
                p6: "6. 总结"
              }
            : {
                p1: "1. Pain Points & Background",
                p2: `2. What is ${s.repoPath.split('/')[1]}?`,
                p3: "3. Key Features",
                p4: "4. Quick Start",
                p5: "5. Use Cases",
                p6: "6. Conclusion"
              };

          prompt = `
          **Role**: Senior Tech Reviewer for WeChat Official Account (公众号).
          **Task**: Write a "Must-Read" recommendation article for GitHub project "${s.repoPath}".
          **Style**: Similar to high-quality tech blogs like "Machine Heart" (机器之心) or "QbitAI" (量子位).
          **Preference**: ${structureMode === 'tutorial' ? 'Focus on Step-by-Step Code Tutorial' : 'Focus on Story/Problem Solving'}.
          
          **Project Info**:
          - Name: ${s.repoPath}
          - Stars: ${s.stars}
          - Desc: ${s.description}
          - Images: ${s.images?.join(', ')}
          
          ${coreGuidelines}

          **Strict Article Structure (Markdown)**:
          
          # [Write a Catchy, Click-Worthy Title with 1 Emoji]
          
          > [Write a short, punchy intro blockquote. Hook the reader immediately.]
          
          ## ${sectionHeaders.p1}
          [Start with a real-world developer pain point. "Have you ever struggled with..." or "Imagine you need to..."]
          
          ## ${sectionHeaders.p2}
          [Define the project clearly. What does it solve?]
          
          [Insert visual card placeholder here: [PROJECT_CARD_0]]
          
          ## ${sectionHeaders.p3}
          [Bulleted list of 3-5 killer features. Be specific, not generic.]
          
          ## ${sectionHeaders.p4}
          [MANDATORY: Provide clear code blocks for installation (pip/npm/go get) and a "Hello World" example. Code must be realistic.]
          
          ## ${sectionHeaders.p5}
          [Where should you use this? Where should you NOT use this?]
          
          ## ${sectionHeaders.p6}
          [Final verdict. Encourage starring the repo. Link: https://github.com/${s.repoPath}]
          
          ${searchInstruction}
          
          **Language**: ${lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.
          `;
      } else {
          // Multi Repo Prompt - Listicle/Collection Style
          // Logic: Intro -> List of Items (Each is a chapter) -> Summary
          // Adjusted for clearer chapter hierarchy per project
          
          prompt = `
          **Role**: Senior Tech Curator for WeChat Official Account.
          **Task**: Write a "Weekly Trending" or "Top Tools Collection" article.
          **Style**: Listicle, clear separation, high information density.
          
          **Projects**:
          ${allStats.map((s, i) => `${i+1}. ${s.repoPath}: ${s.description} (Stars: ${s.stars})`).join('\n')}
          
          ${coreGuidelines}

          **Strict Article Structure (Markdown)**:
          
          # [Write a Catchy Collective Title, e.g., "Top 5 Tools for X"]
          
          > [Intro blockquote summarizing the theme of this collection. Why these tools?]
          
          ${allStats.map((s, i) => `
          ---
          ## ${s.repoPath.split('/')[1]}
          
          **一句话介绍**: [Bold one-sentence summary]
          
          [Insert visual card placeholder here: [PROJECT_CARD_${i}]]
          
          **推荐理由**: 
          [Why is this in the list? What makes it special?]
          
          **核心功能**:
          - [Feature 1]
          - [Feature 2]
          
          **项目地址**: https://github.com/${s.repoPath}
          `).join('\n')}
          
          ## ${lang === 'zh' ? '总结' : 'Conclusion'}
          [Brief closing remarks.]
          
          ${searchInstruction}
          
          **Language**: ${lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.
          `;
      }

      const resultText = await executeTextTask(prompt, false, true);
      
      const titleMatch = resultText.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : (lang === 'zh' ? `精选开源项目: ${repoNamesStr}` : `Featured Projects: ${repoNamesStr}`);
      setArticleTitle(title);

      setArticle(resultText);
      
      setImageLoading(true);
      
      setLoadingText(t.loadingDesigning);
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

  const handleHumanize = async () => {
    if (!article) return;
    setHumanizing(true);
    setPublishStatus(null);
    try {
        const prompt = `
        **Role**: Text Humanizer Engine.
        **Goal**: Rewrite the article to make it flow naturally like a human tech blogger.
        **Audience**: WeChat Official Account readers.
        
        **Instructions**:
        - Maintain the Markdown structure EXACTLY. 
        - DO NOT remove headings, code blocks, or placeholders like [PROJECT_CARD_x].
        - Improve flow, remove repetition, and add "burstiness" (sentence variety).
        - Ensure tone is ${structureMode === 'tutorial' ? 'helpful and instructional' : 'enthusiastic and opinionated'}.
        
        **Input**:
        ${article}
        `;

        const humanizedText = await executeTextTask(prompt, false);
        setArticle(humanizedText);
        setPublishStatus({ type: 'success', msg: t.humanizeSuccess });
        
        if (history.length > 0) {
            const currentHistory = [...history];
            if (currentHistory[0]) {
                currentHistory[0].content = humanizedText;
                setHistory(currentHistory);
                localStorage.setItem('git2wechat_history_multi', JSON.stringify(currentHistory));
            }
        }

    } catch (e: any) {
        setError("Humanize failed: " + e.message);
    } finally {
        setHumanizing(false);
    }
  };

  const drawPoster = async () => {
     if(!headerImage || !articleTitle) return;
     setPosterLoading(true);
     setPosterUrl(null);
     
     const canvas = document.createElement('canvas');
     const ctx = canvas.getContext('2d');
     const W = 750;
     const H = 1250;
     canvas.width = W;
     canvas.height = H;
     
     ctx.fillStyle = currentTheme.bg === '#ffffff' ? '#f0f9ff' : '#020617';
     ctx.fillRect(0,0,W,H);
     
     const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
         const img = new Image();
         img.crossOrigin = 'anonymous';
         img.onload = () => resolve(img);
         img.onerror = () => reject();
         img.src = src;
     });

     try {
         const coverImg = await loadImage(headerImage);
         const coverH = W; 
         ctx.drawImage(coverImg, 0, 0, W, coverH);
         
         const gradient = ctx.createLinearGradient(0, coverH - 100, 0, coverH);
         gradient.addColorStop(0, 'rgba(0,0,0,0)');
         gradient.addColorStop(1, currentTheme.bg === '#ffffff' ? '#ffffff' : '#020617');
         ctx.fillStyle = gradient;
         ctx.fillRect(0, coverH-100, W, 100);

         ctx.fillStyle = currentTheme.id === 'wechat-light' ? '#ffffff' : '#020617';
         ctx.fillRect(0, coverH, W, H - coverH);

         ctx.fillStyle = currentTheme.id === 'wechat-light' ? '#1f2937' : '#e2e8f0';
         ctx.font = 'bold 48px "Inter", sans-serif';
         ctx.textAlign = 'left';
         
         const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
             const words = text.split('');
             let line = '';
             let testLine = '';
             for(let n = 0; n < words.length; n++) {
                 testLine = line + words[n];
                 const metrics = ctx.measureText(testLine);
                 const testWidth = metrics.width;
                 if (testWidth > maxWidth && n > 0) {
                     ctx.fillText(line, x, y);
                     line = words[n];
                     y += lineHeight;
                 } else {
                     line = testLine;
                 }
             }
             ctx.fillText(line, x, y);
             return y + lineHeight;
         };
         
         let cursorY = coverH + 80;
         cursorY = wrapText(articleTitle, 50, cursorY, W - 100, 65);

         if (mainProjectStats) {
             cursorY += 40;
             const drawStat = (label: string, val: string, x: number) => {
                 ctx.fillStyle = '#6366f1'; 
                 ctx.font = 'bold 36px sans-serif';
                 ctx.fillText(val, x, cursorY);
                 ctx.fillStyle = '#94a3b8';
                 ctx.font = '24px sans-serif';
                 ctx.fillText(label, x, cursorY + 35);
             };
             
             drawStat('Stars', mainProjectStats.stars, 50);
             drawStat('Forks', mainProjectStats.forks, 250);
             drawStat('Contributors', mainProjectStats.contributors, 450);
         }

         const qrSize = 250;
         const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(urls[0] || 'https://github.com')}`;
         const qrImg = await loadImage(qrUrl);
         
         const qrY = H - qrSize - 80;
         const qrX = (W - qrSize) / 2;
         
         ctx.fillStyle = '#ffffff';
         ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
         ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
         
         ctx.fillStyle = '#94a3b8';
         ctx.font = '24px sans-serif';
         ctx.textAlign = 'center';
         ctx.fillText('Generated by Git2WeChat Pro', W/2, H - 30);

         setPosterUrl(canvas.toDataURL('image/png'));
         
     } catch (e) {
         console.error(e);
         setError("Failed to generate poster. CORS issue likely with images.");
     } finally {
         setPosterLoading(false);
     }
  };

  const handleMagicDiscover = async (isAI: boolean) => {
    if (loading) return;
    setLoading(true);
    setLoadingText(t.loadingTrending);
    setError("");
    try {
      let fetchedUrls: string[] = [];
      
      if (isAI) {
        const query = `Provide a JSON array of 5 currently trending AI-related GitHub repository URLs.`;
        const response = await executeTextTask(query, true);
        fetchedUrls = JSON.parse(response || '[]');
      } else {
        fetchedUrls = await fetchGithubTrending();
        
        if (fetchedUrls.length === 0) {
           const query = `Provide a JSON array of 5 currently trending GitHub repository URLs.`;
           const response = await executeTextTask(query, true);
           fetchedUrls = JSON.parse(response || '[]');
        }
      }

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
    projectImages.forEach((img, idx) => {
      const placeholder = `\\[PROJECT_CARD_${idx}\\]`;
      const imgHtml = `\n<div class="my-6 shadow-2xl rounded-2xl overflow-hidden border border-gray-100 bg-white"><img src="${img}" class="w-full h-auto" alt="Repository Card ${idx}"></div>\n`;
      md = md.replace(new RegExp(placeholder, 'g'), imgHtml);
    });
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
    /* TOC Styles */
    .toc-link:hover { color: ${customPrimaryColor}; border-left-color: ${customPrimaryColor}; }
  `;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 pb-20">
      <style>{getThemeStyles()}</style>
      <div className="max-w-6xl mx-auto px-4 py-12">
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

        <div className="glass-panel p-8 rounded-3xl shadow-2xl mb-12 space-y-8 border border-white/5 max-w-4xl mx-auto">
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
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {STRUCTURES.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => setStructureMode(s.id)}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${structureMode === s.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg scale-105' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                     {t[s.labelKey]}
                  </button>
              ))}
          </div>

          <button onClick={() => generateArticle()} disabled={loading} className={`w-full py-5 rounded-2xl font-bold text-white transition-all shadow-xl tracking-wide ${loading ? 'bg-slate-800' : 'bg-indigo-600 hover:bg-indigo-500 active:translate-y-0.5'}`}>
            {loading ? <div className="flex items-center justify-center gap-3"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>{loadingText}</div> : t.generate}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-4 rounded-2xl mb-8 flex items-center gap-3 text-sm">{error}</div>}

        {article && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col xl:flex-row gap-8 items-start">
            
            <div className="flex-1 w-full min-w-0">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyForWeChat} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    {t.copyWeChat}
                  </button>
                  <button onClick={() => { setShowPoster(true); drawPoster(); }} className="bg-pink-600 hover:bg-pink-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    {t.genPoster}
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
                  <button onClick={handleHumanize} disabled={humanizing} className={`text-purple-400 border border-purple-400/30 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-purple-400/10 transition-all flex items-center gap-2 ${humanizing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {humanizing ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>}
                      {humanizing ? t.humanizing : t.humanize}
                  </button>
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

            {!isEditing && article && (
               <div className="hidden xl:block w-64 shrink-0 sticky top-8 animate-in fade-in slide-in-from-right-4 duration-700 delay-300">
                  <div className="glass-panel p-5 rounded-2xl border border-white/10">
                      <h4 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-4 pb-2 border-b border-white/5 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        {t.toc}
                      </h4>
                      <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
                         {parseTOC(article).map((item, i) => (
                             <button 
                                key={i}
                                onClick={() => scrollToHeading(item.id)}
                                className={`toc-link text-left text-xs py-2 px-3 border-l-2 transition-all hover:bg-white/5 rounded-r-lg ${item.level === 1 ? 'font-bold text-white border-transparent' : item.level === 2 ? 'pl-4 text-slate-300 border-transparent' : 'pl-6 text-slate-500 border-transparent font-normal'}`}
                             >
                                 {item.text}
                             </button>
                         ))}
                      </div>
                  </div>
               </div>
            )}
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