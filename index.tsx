import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// Ensure hljs is available (loaded via script tag in HTML)
declare const hljs: any;

// --- Types ---

type LLMProvider = 'gemini' | 'alibaba' | 'volcengine' | 'custom';
type Language = 'zh' | 'en';
type Platform = 'wechat' | 'zhihu' | 'csdn' | 'toutiao';
type LoginMethod = 'qrcode' | 'cookie' | 'password';

interface LLMConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  imageModel: string;
}

interface PlatformConfig {
  id: Platform;
  name: string;
  icon: React.ReactNode;
  credentials: Record<string, string>;
  isConnected: boolean;
  loginMethod?: LoginMethod;
  avatar?: string;
  username?: string;
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
  readmeContent?: string; // New: Full text content of README
}

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface PublishLog {
  platform: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  msg: string;
}

// --- Icons ---
const Icons = {
  WeChat: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M8.5,13.5A1.5,1.5 0 1,1 7,15A1.5,1.5 0 0,1 8.5,13.5M16.5,13.5A1.5,1.5 0 1,1 15,15A1.5,1.5 0 0,1 16.5,13.5M12,2C6.48,2 2,5.58 2,10C2,12.5 3.39,14.74 5.57,16.22C5.38,16.92 5,18.5 4.5,19.5C4.47,19.56 5.33,19.23 6.69,18.3C7.03,18.06 7.4,17.9 7.79,17.91C9.07,18.5 10.47,18.8 12,18.8C17.52,18.8 22,15.21 22,10.8C22,6.38 17.52,2 12,2Z" /></svg>,
  Zhihu: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M13.5 5.9c.7 0 1.4.1 2 .2-1.3 2-2.8 3.9-4.5 5.5l1.6 1.4c2.2-2.2 4.1-4.7 5.7-7.3 1.1.5 2 1.3 2.7 2.3-.9 1.4-1.9 2.7-3.1 3.9l.6.6c1.6-1.5 3-3.2 4.1-5 1.1 1.7 1.8 3.6 2 5.6h-2.5c-.2-1.2-.6-2.4-1.2-3.4H13.5V5.9zm-4.1 6.8c-.8 1.4-1.8 2.6-3 3.6l1.2 1.4c1.5-1.3 2.8-2.8 3.7-4.5l-1.9-.5zm-4.2-2c-.5-1-1.1-1.9-1.8-2.8l-1.5 1c.7 1 1.3 2 1.9 3.1l1.4-1.3zM4.9 3C3.5 4.6 2.3 6.4 1.4 8.3L3 9.2c.8-1.7 1.8-3.3 3.1-4.7L4.9 3z" /></svg>,
  CSDN: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3 3h18v18H3V3zm15 15V6H6v12h12zM8 8h8v2H8V8zm0 4h8v2H8v-2z" /></svg>,
  Toutiao: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v2H8V8zm0 4h5v2H8v-2z" /></svg> // Simplified placeholder
};

// --- Translations ---

const i18n = {
  zh: {
    title: "Git2WeChat Pro",
    subtitle: "GitHub 项目介绍文章生成器",
    quantity: "项目数量",
    trending: "✨ 热门趋势",
    aiPick: "🤖 AI 精选",
    generate: "一键生成介绍文章",
    copyWeChat: "复制微信格式",
    copyMarkdown: "Markdown 源码",
    genPoster: "生成分享海报",
    pushDraft: "多平台发布",
    edit: "编辑文本",
    preview: "预览效果",
    history: "历史记录",
    settings: "系统设置",
    placeholder: "https://github.com/owner/repo",
    urlLabel: "仓库地址",
    words: "字数",
    cards: "视觉卡片",
    loadingAnalyzing: "正在解析 README 文档...",
    loadingRetrieving: "正在获取项目信息: ",
    loadingDesigning: "正在梳理文章章节与结构...", 
    loadingDrawing: "正在绘制卡片: ",
    loadingTrending: "正在抓取 GitHub Trending...",
    loadingPoster: "正在绘制海报...",
    copySuccess: "已复制微信排版格式！直接粘贴到公众号编辑器即可。",
    mdSuccess: "Markdown 源码已复制！",
    pushSuccess: "发布流程已完成！",
    pushError: "发布失败，请检查配置。",
    pushWarning: "请先连接至少一个平台账号。",
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
    humanize: "拟人化润色",
    humanizing: "正在进行拟人化重写...",
    humanizeSuccess: "文章已完成去 AI 化润色！",
    structureMode: "文章偏好",
    toc: "文章目录",
    publishCenter: "多平台发布中心",
    connect: "连接账号",
    connected: "已连接",
    publishNow: "立即发布",
    publishing: "正在发布...",
    publishingTo: "正在发布至",
    publishSuccess: "发布成功",
    publishFailed: "发布失败",
    configPlatform: "配置平台信息",
    tokenLabel: "认证信息 (Cookie/Token)",
    tokenPlaceholder: "粘贴浏览器控制台获取的 Cookie 或 Token",
    loginTip: "提示: 这是一个纯前端应用。直接发布需要您手动提供各平台的登录凭证 (Cookie/Token)。推荐使用'复制格式'功能手动发布。",
    platforms: {
      wechat: "微信公众号",
      zhihu: "知乎",
      csdn: "CSDN",
      toutiao: "今日头条"
    },
    loginMethods: {
      qrcode: "扫码登录",
      cookie: "Cookie/Token",
      password: "账号密码"
    },
    scanQrTip: "请使用手机 App 扫码登录",
    scanSuccess: "扫码成功，正在登录...",
    loginSuccess: "登录成功",
    manualInput: "手动输入凭证",
    disconnect: "断开连接",
    statusConnected: "已连接",
    statusNotConnected: "未连接"
  },
  en: {
    title: "Git2WeChat Pro",
    subtitle: "GitHub Project Intro Generator",
    quantity: "Quantity",
    trending: "✨ Trending",
    aiPick: "🤖 AI Pick",
    generate: "Generate Intro Article",
    copyWeChat: "Copy WeChat Format",
    copyMarkdown: "Copy Markdown",
    genPoster: "Generate Poster",
    pushDraft: "Multi-Platform Publish",
    edit: "Edit Text",
    preview: "Preview",
    history: "History",
    settings: "Settings",
    placeholder: "https://github.com/owner/repo",
    urlLabel: "Repo URL",
    words: "Words",
    cards: "Cards",
    loadingAnalyzing: "Analyzing README...",
    loadingRetrieving: "Retrieving data: ",
    loadingDesigning: "Structuring chapters...",
    loadingDrawing: "Drawing card: ",
    loadingTrending: "Scraping GitHub Trending...",
    loadingPoster: "Drawing poster...",
    copySuccess: "WeChat format copied! Paste it directly into the editor.",
    mdSuccess: "Markdown source copied!",
    pushSuccess: "Publish workflow completed!",
    pushError: "Publish failed. Check config.",
    pushWarning: "Please connect at least one platform.",
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
    toc: "Table of Contents",
    publishCenter: "Multi-Platform Publishing",
    connect: "Connect",
    connected: "Connected",
    publishNow: "Publish Now",
    publishing: "Publishing...",
    publishingTo: "Publishing to",
    publishSuccess: "Published Successfully",
    publishFailed: "Publish Failed",
    configPlatform: "Configure Platform",
    tokenLabel: "Auth (Cookie/Token)",
    tokenPlaceholder: "Paste Cookie or Token from Browser DevTools",
    loginTip: "Note: This is a client-side app. Direct publishing requires you to manually provide login credentials (Cookie/Token). 'Copy Format' is recommended.",
    platforms: {
      wechat: "WeChat",
      zhihu: "Zhihu",
      csdn: "CSDN",
      toutiao: "Toutiao"
    },
    loginMethods: {
      qrcode: "Scan QR",
      cookie: "Cookie/Token",
      password: "Password"
    },
    scanQrTip: "Please scan with mobile app",
    scanSuccess: "Scanned successfully, logging in...",
    loginSuccess: "Login Successful",
    manualInput: "Manual Input",
    disconnect: "Disconnect",
    statusConnected: "Connected",
    statusNotConnected: "Not Connected"
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

const fetchGithubTrending = async (): Promise<string[]> => {
  try {
    // Switch to GitHub Search API which is more stable than scraping
    // Query: created within last 7 days, sort by stars
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateString = date.toISOString().split('T')[0];
    
    const res = await fetch(`https://api.github.com/search/repositories?q=created:>${dateString}&sort=stars&order=desc&per_page=10`);
    
    if (!res.ok) {
       // If rate limited or error, throw to trigger fallback
       throw new Error(`GitHub API Error: ${res.status}`);
    }
    
    const data = await res.json();
    if (!data.items || !Array.isArray(data.items)) return [];
    
    return data.items.map((item: any) => item.html_url);
  } catch (e) {
    console.error("Trending fetch failed", e);
    return []; // Return empty to trigger AI fallback
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

  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [showPoster, setShowPoster] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterLoading, setPosterLoading] = useState(false);
  
  // Platform Publish State
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{type: 'success' | 'error' | 'warning', msg: string} | null>(null);
  const [publishLogs, setPublishLogs] = useState<PublishLog[]>([]);
  
  // Platform Login Logic
  const [loginModalPlatform, setLoginModalPlatform] = useState<Platform | null>(null);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('qrcode');
  const [qrCodeState, setQrCodeState] = useState<'loading' | 'active' | 'scanned' | 'success'>('loading');
  
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([
    { id: 'wechat', name: 'WeChat', icon: Icons.WeChat, credentials: {}, isConnected: false },
    { id: 'zhihu', name: 'Zhihu', icon: Icons.Zhihu, credentials: {}, isConnected: false },
    { id: 'csdn', name: 'CSDN', icon: Icons.CSDN, credentials: {}, isConnected: false },
    { id: 'toutiao', name: 'Toutiao', icon: Icons.Toutiao, credentials: {}, isConnected: false }
  ]);

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

    const savedPlatforms = localStorage.getItem('git2wechat_platforms');
    if (savedPlatforms) {
        try {
            const parsed = JSON.parse(savedPlatforms);
            setPlatforms(prev => prev.map(p => {
                const saved = parsed.find((sp: any) => sp.id === p.id);
                return saved ? { ...p, ...saved, icon: p.icon } : p;
            }));
        } catch(e) {}
    }

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

  const savePlatforms = (newPlatforms: PlatformConfig[]) => {
      setPlatforms(newPlatforms);
      const toSave = newPlatforms.map(({id, credentials, isConnected, avatar, username}) => ({id, credentials, isConnected, avatar, username}));
      localStorage.setItem('git2wechat_platforms', JSON.stringify(toSave));
  };

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
           const rawText = match[2].trim();
           // Clean text for display
           let cleanText = rawText.replace(/\*\*/g, '').replace(/\*/g, '');
           // Remove content in brackets (including parentheses and full-width parentheses) for TOC display
           cleanText = cleanText.replace(/\s*\(.*?\)/g, '').replace(/\s*（.*?）/g, '');
           // Remove leading numbering (e.g., "1. ", "1、", "1 ")
           cleanText = cleanText.replace(/^\d+[\.\、\s]+\s*/, '');
           
           const lowerText = cleanText.toLowerCase();
           if (
               !lowerText.includes('参考资料') && 
               !lowerText.includes('references') &&
               !lowerText.includes('应用场景') && // Remove Application Scenarios from TOC
               !lowerText.includes('use cases')   // Remove English equivalent
           ) {
               // Use rawText for ID generation to match marked's behavior so links work
               toc.push({ level, text: cleanText.trim(), id: slugify(rawText) });
           }
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
    
    // Attempt to handle "owner/repo" format manually
    if (/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/.test(url)) {
        repoPath = url;
    } else {
        try {
            // Check if it's a valid URL to avoid "Invalid URL" constructor error
            if (url && (url.startsWith('http') || url.startsWith('www'))) {
                const urlObj = new URL(url.startsWith('www') ? `https://${url}` : url);
                const parts = urlObj.pathname.split('/').filter(Boolean);
                if (parts.length >= 2) repoPath = `${parts[0]}/${parts[1]}`;
            }
        } catch (e) { 
            // Silently ignore invalid URLs during typing
        }
    }

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
          let readmeContent = "";
          try {
             const defaultBranch = data.default_branch || 'main';
             
             const readmeRes = await fetch(`https://api.github.com/repos/${repoPath}/readme`);
             if (readmeRes.ok) {
                 const readmeJson = await readmeRes.json();
                 if (readmeJson.download_url) {
                    const rawRes = await fetch(readmeJson.download_url);
                    const rawText = await rawRes.text();
                    // Extract images for card generation
                    extractedImages = extractImagesFromMarkdown(rawText, repoPath, defaultBranch);
                    // Store text content for LLM summary (truncated to avoid overkill, though models handle large context now)
                    readmeContent = rawText.slice(0, 50000); 
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
            images: extractedImages,
            readmeContent: readmeContent
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
      // console.error("LLM Fallback error", e);
    }

    return {
      repoPath: repoPath || "unknown/repo",
      description: "Innovative open-source project.",
      stars: "?",
      forks: "?",
      contributors: "?",
      issues: "?",
      avatars: [],
      images: [],
      readmeContent: ""
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

      // Enhanced Guidelines for strict chapter levels
      const coreGuidelines = lang === 'zh' ? `
      **核心写作原则 (基于 README)**:
      1. **事实优先**: 
         - 你必须**严格基于提供的 README 内容**进行写作。
         - 如果 README 中有明确的功能列表、安装步骤或示例代码，直接引用并整理。
      2. **严格的章节层次**:
         - 文章必须严格遵循以下 Markdown 二级标题结构 (H2):
           - ## 项目简介
           - ## 核心功能
           - ## 快速开始 (或 安装使用)
           - ## 应用场景 (可选)
           - ## 总结
         - 在"项目简介"后，必须插入 \`[PROJECT_CARD_index]\` 占位符。
      3. **排版规范**: 
         - 代码块必须指明语言 (如 \`\`\`bash, \`\`\`python)。
         - 关键信息使用列表 (Bullet points)。
      4. **视觉插图**:
         - 如果 README 提供了图片 URL (见 Images 列表)，请在"核心功能"或"演示"部分挑选 1-2 张插入。
      ` : `
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
      4. **Visuals**:
         - If Images are provided, use 1-2 real URLs in relevant sections.
      `;

      let prompt = "";

      if (allStats.length === 1) {
          const s = allStats[0];
          
          prompt = `
          **Role**: Technical Editor for a Developer Blog.
          **Task**: Write a structured introduction article for the GitHub project "${s.repoPath}".
          
          **Input Data**:
          - Name: ${s.repoPath}
          - Description: ${s.description}
          - **README Content**: 
          """
          ${s.readmeContent || "No README content found. Please search online for details."}
          """
          - Available Images: ${s.images && s.images.length > 0 ? s.images.join(', ') : 'None'}
          
          ${coreGuidelines}

          **Strict Article Structure (Markdown)**:
          
          # (Generate a clear, benefit-oriented Title)
          
          > (One sentence summary)
          
          ## 项目简介 (Introduction)
          (Briefly explain what problem this project solves based on the README.)
          
          [Insert visual card placeholder here: [PROJECT_CARD_0]]
          
          ## 核心功能 (Key Features)
          (List the features found in the README using bullet points.)
          
          ## 快速开始 (Quick Start)
          (Provide the installation command and a simple usage code example from the README. Wrap in code blocks.)
          
          ## 总结 (Conclusion)
          (Brief verdict, link to repo: https://github.com/${s.repoPath})
          
          **Language**: ${lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.
          `;
      } else {
          // Logic for multiple repos (Collections)
          prompt = `
          **Role**: Open Source Curator.
          **Task**: Write a "Weekly Collection" introducing these tools based on their READMEs.
          
          **Projects**:
          ${allStats.map((s, i) => `
          --- Project ${i+1} ---
          Name: ${s.repoPath}
          README Snippet: ${s.readmeContent ? s.readmeContent.slice(0, 2000) : 'N/A'}
          Images: ${s.images && s.images.length > 0 ? s.images.join(', ') : 'None'}
          `).join('\n')}
          
          ${coreGuidelines}

          **Structure**:
          
          # (Collection Title)
          
          > (Brief Intro)
          
          ${allStats.map((s, i) => `
          ---
          ## ${i+1}. ${s.repoPath.split('/')[1]}
          
          [Insert visual card placeholder here: [PROJECT_CARD_${i}]]
          
          ### 项目简介
          (Summary based on README)

          ### 核心亮点
          (Bullet points from README)
          
          **项目地址**: https://github.com/${s.repoPath}
          `).join('\n')}
          
          ## 总结
          
          **Language**: ${lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.
          `;
      }

      const resultText = await executeTextTask(prompt, false, true);
      
      const titleMatch = resultText.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : (lang === 'zh' ? `开源项目介绍: ${repoNamesStr}` : `Project Intro: ${repoNamesStr}`);
      setArticleTitle(title);

      setArticle(resultText);
      
      setImageLoading(true);
      
      setLoadingText(t.loadingDesigning);
      
      setHeaderImage(null);

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
        headerImage: null, // No header image
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
        const prompt = lang === 'zh' ? `
        **角色**: 资深技术编辑。
        **任务**: 润色这篇文章，使其更自然、流畅，但保持技术准确性。
        
        **严格指令**:
        1. **结构保持**: 绝对保留 Markdown 结构，包括标题 (H2, H3)、代码块和 [PROJECT_CARD_x] 占位符。
        2. **语言风格**: 
           - 去除机器翻译感。
           - 保持专业、客观。
        
        **输入文章**:
        ${article}
        ` : `
        **Role**: Technical Editor.
        **Task**: Polish this article to sound natural but professionally accurate.
        
        **Instructions**:
        1. KEEP Markdown structure, headers (H2, H3), code, and placeholders [PROJECT_CARD_x].
        2. Fix robotic phrasing.
        
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
     if(!articleTitle) return; // Removed headerImage check
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
         // Draw Header placeholder pattern instead of image
         const coverH = W; 
         const patternGradient = ctx.createLinearGradient(0, 0, W, coverH);
         patternGradient.addColorStop(0, '#4f46e5');
         patternGradient.addColorStop(1, '#06b6d4');
         ctx.fillStyle = patternGradient;
         ctx.fillRect(0, 0, W, coverH);
         
         // Add some simple geometric shapes
         ctx.strokeStyle = 'rgba(255,255,255,0.1)';
         ctx.lineWidth = 2;
         for(let i=0; i<10; i++) {
             ctx.beginPath();
             ctx.arc(Math.random()*W, Math.random()*coverH, Math.random()*100 + 50, 0, Math.PI*2);
             ctx.stroke();
         }
         
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

  const handleMultiPlatformPublish = async () => {
      const connected = platforms.filter(p => p.isConnected);
      if (connected.length === 0) {
          setPublishStatus({type: 'warning', msg: t.pushWarning});
          return;
      }
      
      setPublishing(true);
      setPublishStatus(null);
      
      // Initialize logs
      setPublishLogs(connected.map(p => ({
          platform: p.name,
          status: 'pending',
          msg: t.publishing
      })));

      for (let i = 0; i < connected.length; i++) {
          const p = connected[i];
          
          // Update current to processing
          setPublishLogs(prev => prev.map((log, idx) => idx === i ? { ...log, status: 'processing', msg: `${t.publishingTo} ${p.name}...` } : log));

          // Simulate API network delay
          await new Promise(r => setTimeout(r, 1500));
          
          // Check credentials (mock validation)
          const success = !!p.credentials.token && p.credentials.token.length > 5;

          // Update result
          setPublishLogs(prev => prev.map((log, idx) => idx === i ? { 
              ...log, 
              status: success ? 'success' : 'error', 
              msg: success ? t.publishSuccess : t.publishFailed 
          } : log));
      }

      setPublishing(false);
      setPublishStatus({type: 'success', msg: t.pushSuccess});
  };

  const openLoginModal = (p: PlatformConfig) => {
    setLoginModalPlatform(p.id);
    setLoginMethod('qrcode'); // Default to QR
    setQrCodeState('loading');
    setTimeout(() => {
       if (loginModalPlatform === p.id) setQrCodeState('active');
    }, 1000);
  };

  const simulateQrScan = () => {
     if (qrCodeState !== 'active') return;
     setQrCodeState('scanned');
     setTimeout(() => {
        setQrCodeState('success');
        saveLogin(loginModalPlatform!, 'MOCK_TOKEN_VIA_QR');
     }, 2000);
  };

  const saveLogin = (platformId: Platform, token: string) => {
      const newPlatforms = platforms.map(pl => 
         pl.id === platformId ? { 
             ...pl, 
             isConnected: true, 
             credentials: { token },
             loginMethod: loginMethod
         } : pl
      );
      savePlatforms(newPlatforms);
      setLoginModalPlatform(null);
  };

  const togglePlatformConnect = (p: PlatformConfig) => {
      if (p.isConnected) {
         // Disconnect
         const newPlatforms = platforms.map(pl => pl.id === p.id ? { ...pl, isConnected: false, credentials: {} } : pl);
         savePlatforms(newPlatforms);
      } else {
         openLoginModal(p);
      }
  };

  const saveCredentials = (creds: string) => {
      if (!loginModalPlatform) return;
      const newPlatforms = platforms.map(pl => 
         pl.id === loginModalPlatform ? { ...pl, isConnected: true, credentials: { token: creds } } : pl
      );
      savePlatforms(newPlatforms);
      setLoginModalPlatform(null);
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
    .prose-content { font-family: ${currentFont.value}; color: ${currentTheme.text}; line-height: 2; }
    .prose-content p { margin-bottom: 2rem; }
    .prose-content h1 { color: ${currentTheme.headingColor}; border-bottom-color: ${customPrimaryColor}; margin-bottom: 2.5rem; }
    .prose-content h2 { margin-top: 3.5rem; margin-bottom: 2rem; color: ${currentTheme.headingColor}; }
    .prose-content h2::before { background: ${customPrimaryColor}; }
    .prose-content h3 { margin-top: 2.5rem; margin-bottom: 1.5rem; color: ${currentTheme.text}; opacity: 0.9; border-left: 3px solid ${customPrimaryColor}; padding-left: 10px; }
    .prose-content blockquote { background: ${currentTheme.secondaryBg}; border-left-color: ${customPrimaryColor}; margin-bottom: 2.5rem; }
    .prose-content strong { color: ${customPrimaryColor}; }
    .prose-content ul, .prose-content ol { margin-bottom: 2.5rem; }
    .prose-content li { margin-bottom: 1rem; }
    .prose-content img { margin-top: 2rem; margin-bottom: 2rem; }
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
                  <button onClick={() => setShowPublishModal(true)} disabled={publishing} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
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

              <div className="rounded-3xl overflow-hidden shadow-2xl transition-all border border-white/5" style={{ backgroundColor: currentTheme.bg }}>
                {headerImage && (
                    <div className="w-full relative min-h-[100px] border-b border-white/5 bg-slate-900">
                      <img src={headerImage} className="w-full h-auto object-cover" alt="Article Header" />
                    </div>
                )}
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

        {/* Multi-Platform Publish Modal */}
        {showPublishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => !loginModalPlatform && setShowPublishModal(false)}>
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl p-8 flex flex-col shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                  <h3 className="font-bold text-xl flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                     {t.publishCenter}
                  </h3>
                  <button onClick={() => setShowPublishModal(false)} className="text-slate-500 hover:text-white transition-colors text-2xl">&times;</button>
                </div>

                {!loginModalPlatform && !publishing && !publishStatus && (
                   <div className="bg-blue-500/10 border border-blue-500/20 text-blue-200 p-4 rounded-xl mb-6 text-xs leading-relaxed">
                      {t.loginTip}
                   </div>
                )}
                
                {/* Publishing Logs Display */}
                {publishLogs.length > 0 && !loginModalPlatform && (
                   <div className="mb-8 space-y-2 bg-slate-950 p-4 rounded-xl border border-white/5 max-h-[200px] overflow-y-auto">
                      {publishLogs.map((log, i) => (
                         <div key={i} className="flex items-center gap-3 text-sm">
                            <span className="w-4 h-4 flex items-center justify-center">
                               {log.status === 'processing' && <svg className="animate-spin h-3 w-3 text-indigo-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                               {log.status === 'success' && <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
                               {log.status === 'error' && <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>}
                               {log.status === 'pending' && <div className="w-2 h-2 rounded-full bg-slate-600"></div>}
                            </span>
                            <span className={`${log.status === 'success' ? 'text-emerald-300' : log.status === 'error' ? 'text-red-300' : 'text-slate-300'}`}>{log.msg}</span>
                         </div>
                      ))}
                   </div>
                )}

                {/* Main List of Platforms */}
                {!loginModalPlatform && (
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 ${publishing ? 'opacity-50 pointer-events-none' : ''}`}>
                      {platforms.map(p => (
                        <div key={p.id} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${p.isConnected ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${p.isConnected ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                              {p.icon}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-white">{t.platforms[p.id]}</div>
                              <div className={`text-[10px] font-bold uppercase tracking-wider ${p.isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {p.isConnected ? t.statusConnected : t.statusNotConnected}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => togglePlatformConnect(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${p.isConnected ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10'}`}
                          >
                            {p.isConnected ? t.disconnect : t.connect}
                          </button>
                        </div>
                      ))}
                    </div>
                )}
                
                {/* Specific Login Modal Area */}
                {loginModalPlatform && (
                    <div className="bg-slate-800 p-6 rounded-2xl border border-white/10 mb-8 animate-in fade-in zoom-in-95 relative">
                       <button onClick={() => setLoginModalPlatform(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">&times;</button>
                       <h4 className="font-bold text-sm mb-6 flex items-center gap-2">
                           {platforms.find(p=>p.id===loginModalPlatform)?.icon}
                           {t.configPlatform}: {t.platforms[loginModalPlatform]}
                       </h4>

                       {/* Login Method Tabs */}
                       <div className="flex border-b border-slate-700 mb-6">
                           <button onClick={() => setLoginMethod('qrcode')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${loginMethod === 'qrcode' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                               {t.loginMethods.qrcode}
                           </button>
                           <button onClick={() => setLoginMethod('cookie')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${loginMethod === 'cookie' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                               {t.loginMethods.cookie}
                           </button>
                           {loginModalPlatform !== 'wechat' && (
                               <button onClick={() => setLoginMethod('password')} className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${loginMethod === 'password' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                                   {t.loginMethods.password}
                               </button>
                           )}
                       </div>

                       {/* QR Code Scan Flow */}
                       {loginMethod === 'qrcode' && (
                           <div className="flex flex-col items-center py-4">
                               <div className="w-48 h-48 bg-white p-2 rounded-xl mb-4 relative overflow-hidden group cursor-pointer" onClick={simulateQrScan}>
                                   {qrCodeState === 'loading' ? (
                                       <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-lg">
                                           <svg className="animate-spin h-8 w-8 text-slate-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                       </div>
                                   ) : (
                                       <>
                                         <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=LOGIN_MOCK_${loginModalPlatform}_${Date.now()}`} className={`w-full h-full object-contain transition-opacity ${qrCodeState === 'scanned' || qrCodeState === 'success' ? 'opacity-20' : 'opacity-100'}`} alt="Login QR" />
                                         {(qrCodeState === 'scanned' || qrCodeState === 'success') && (
                                             <div className="absolute inset-0 flex items-center justify-center">
                                                 <div className="bg-emerald-500 rounded-full p-2 animate-in zoom-in">
                                                     <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                 </div>
                                             </div>
                                         )}
                                       </>
                                   )}
                                   {qrCodeState === 'active' && <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">Click to Simulate Scan</div>}
                               </div>
                               <p className="text-sm text-slate-400 mb-2 font-bold">{
                                   qrCodeState === 'loading' ? 'Loading QR...' : 
                                   qrCodeState === 'active' ? t.scanQrTip : 
                                   qrCodeState === 'scanned' ? t.scanSuccess : 
                                   t.loginSuccess
                               }</p>
                           </div>
                       )}

                       {/* Cookie/Token Input Flow */}
                       {loginMethod === 'cookie' && (
                           <div className="space-y-3">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t.tokenLabel}</label>
                              <div className="flex gap-2">
                                 <input 
                                    type="password" 
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors" 
                                    placeholder={t.tokenPlaceholder}
                                    onKeyDown={(e) => {
                                       if(e.key === 'Enter') saveCredentials((e.target as HTMLInputElement).value);
                                    }}
                                 />
                                 <button onClick={(e) => saveCredentials(((e.target as HTMLElement).previousSibling as HTMLInputElement).value)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-lg text-xs font-bold">{t.save}</button>
                              </div>
                           </div>
                       )}
                       
                       {/* Password Flow (Mock) */}
                        {loginMethod === 'password' && (
                           <div className="space-y-3">
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Username / Phone</label>
                                  <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Password</label>
                                  <input type="password" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
                              </div>
                              <button onClick={() => saveLogin(loginModalPlatform!, 'MOCK_PWD_TOKEN')} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-bold mt-2">Login</button>
                           </div>
                       )}
                    </div>
                )}

                {!loginModalPlatform && (
                    <div className="mt-auto flex justify-end gap-3 pt-6 border-t border-white/5">
                      <button onClick={() => setShowPublishModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-800 transition-colors">{t.cancel}</button>
                      <button onClick={handleMultiPlatformPublish} disabled={publishing} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all active:translate-y-0.5 flex items-center gap-2">
                         {publishing && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                         {publishing ? t.publishing : t.publishNow}
                      </button>
                    </div>
                )}
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
               </div>

               <div className="mt-8 pt-6 border-t border-white/5 flex justify-end gap-3">
                  <button onClick={() => setShowSettings(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-800 transition-colors">{t.cancel}</button>
                  <button onClick={() => {
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