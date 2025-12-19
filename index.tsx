import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// Ensure hljs is available (loaded via script tag in HTML)
declare const hljs: any;

// --- Types ---

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
  timestamp: number;
}

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
    id: 'paper',
    name: 'Warm Paper',
    bg: '#fdfbf7',
    text: '#433422',
    headingColor: '#78350f',
    headingDecoration: '#d97706',
    secondaryBg: '#f5f0e6',
    blockquoteBorder: '#d97706',
    codeBg: '#271c19',
    codeText: '#fde68a',
    borderColor: '#e7e5e4',
    isGradientHeading: false,
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

const PROXIES = [
  "https://corsproxy.io/?",
  "https://api.codetabs.com/v1/proxy?quest="
];

async function fetchWithProxy(targetUrl: string, options?: RequestInit) {
  let lastError: any;
  const isWeChat = targetUrl.includes('api.weixin.qq.com');

  if (!isWeChat) {
    try {
      const response = await fetch(targetUrl, options);
      return response;
    } catch (e) {
      console.warn(`Direct fetch failed for ${targetUrl}, attempting proxies...`, e);
      lastError = e;
    }
  }
  
  for (const proxyBase of PROXIES) {
    try {
      const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl, options);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`Proxy ${proxyBase} returned ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  
  throw lastError || new Error("Failed to fetch: Unable to connect via direct link or proxies.");
}

type LLMConfig = {
  provider: 'gemini' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
};

const App = () => {
  const [urls, setUrls] = useState<string[]>([""]);
  const [targetCount, setTargetCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [article, setArticle] = useState("");
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>(THEMES[0].headingDecoration);
  const [currentFont, setCurrentFont] = useState(FONTS[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'wechat' | 'model'>('wechat');
  
  const [wechatConfig, setWechatConfig] = useState({ appId: '', appSecret: '' });
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'gemini',
    baseUrl: '',
    apiKey: '',
    model: ''
  });

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const contentRef = useRef<HTMLDivElement>(null);

  // Sync urls with targetCount
  useEffect(() => {
    if (urls.length < targetCount) {
      setUrls([...urls, ...Array(targetCount - urls.length).fill("")]);
    } else if (urls.length > targetCount) {
      setUrls(urls.slice(0, targetCount));
    }
  }, [targetCount]);

  const fixRelativeUrl = (href: string, baseRepoUrl: string) => {
    if (!href) return href;
    if (href.startsWith('http')) return href;
    const githubMatch = baseRepoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (githubMatch) {
      const [_, owner, repo] = githubMatch;
      const cleanPath = href.startsWith('./') ? href.slice(2) : href.startsWith('/') ? href.slice(1) : href;
      return `https://raw.githubusercontent.com/${owner}/${repo}/main/${cleanPath}`;
    }
    return href;
  };

  useEffect(() => {
    const savedWechat = localStorage.getItem('wechatConfig');
    if (savedWechat) setWechatConfig(JSON.parse(savedWechat));

    const savedLlm = localStorage.getItem('llmConfig');
    if (savedLlm) setLlmConfig(JSON.parse(savedLlm));

    const savedHistory = localStorage.getItem('git2wechat_history_multi');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    marked.use({
      renderer: {
        image(href: string, title: string | null, text: string) {
          if (typeof href === 'object' && href !== null) {
            const token = href as any;
            href = token.href || '';
            title = token.title || '';
            text = token.text || '';
          }
          const cleanHref = fixRelativeUrl(href, urls[0] || "");
          if (!cleanHref) return '';
          if (cleanHref.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)/)) return '';
          if (text === 'VIDEO' || cleanHref.match(/\.(mp4|webm)$/i)) return '';
          return `<img src="${cleanHref}" alt="${text || ''}" title="${title || ''}" class="w-full rounded-xl my-6 shadow-xl ring-1 ring-white/10" onerror="this.style.display='none'">`;
        }
      }
    });
  }, [urls]);

  useEffect(() => {
    setCustomPrimaryColor(currentTheme.headingDecoration);
  }, [currentTheme.id]);

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
    const updatedHistory = [entry, ...history.filter(h => h.urls.join(',') !== entry.urls.join(','))].slice(0, 50);
    setHistory(updatedHistory);
    localStorage.setItem('git2wechat_history_multi', JSON.stringify(updatedHistory));
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setTargetCount(entry.urls.length);
    setUrls(entry.urls);
    setArticle(entry.content);
    setHeaderImage(entry.headerImage);
    setShowHistory(false);
    setError("");
    setIsEditing(false);
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

  const generateArticle = async (passedUrls?: string[]) => {
    const validUrls = (passedUrls || urls).filter(u => u.trim() !== "");
    if (validUrls.length === 0) {
      setError("Please enter at least one valid GitHub URL");
      return;
    }

    setError("");
    setLoading(true);
    setLoadingText(passedUrls ? "Magic Discovering..." : "Analyzing Projects...");
    setArticle("");
    setHeaderImage(null);
    setPublishStatus(null);
    setIsEditing(false);

    try {
      const isSingle = validUrls.length === 1;
      const prompt = `You are an expert tech blogger for a popular WeChat Official Account (公众号). 
      Your task is to write a ${isSingle ? 'comprehensive deep-dive' : `curated selection`} article introducing ${isSingle ? 'this GitHub repository' : `these ${validUrls.length} GitHub repositories`}:
      ${validUrls.map((u, i) => `${i+1}. ${u}`).join('\n')}
      
      Requirements:
      1. Use Simplified Chinese.
      2. Article Style: ${isSingle ? 'Professional review' : 'Roundup/Weekly recommendation'}.
      3. For EACH project, use a clear numbered heading (e.g., "01. Project Name").
      4. Include: a one-sentence catchy catchphrase, detailed description, key technical highlights (3-5 points), and the repository link.
      5. Add an engaging intro and a conclusion.
      6. Output in clean Markdown with proper hierarchy.
      7. Try to find and include markdown image links if available in the repo context.
      8. Aesthetics: Use emojis and modern WeChat blog layout styles.`;

      let generatedText = "";
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      if (llmConfig.provider === 'custom') {
        if (!llmConfig.baseUrl || !llmConfig.apiKey) throw new Error("Custom Provider missing config.");
        const endpoint = `${llmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const response = await fetchWithProxy(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmConfig.apiKey}` },
          body: JSON.stringify({
            model: llmConfig.model || 'gpt-3.5-turbo',
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await response.json();
        generatedText = data.choices?.[0]?.message?.content || "No content.";
      } else {
        const textResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
        generatedText = textResponse.text || "No content.";
      }

      setArticle(generatedText);
      const title = (generatedText.match(/^#\s+(.+)$/m)?.[1] || (isSingle ? "开源项目深度解析" : "精选开源项目集锦")).replace(/\[.*?\]/g, '').trim();
      
      setImageLoading(true);
      const img = await generateImage(ai, title);
      setHeaderImage(img || null);
      setImageLoading(false);

      saveToHistory({
        urls: validUrls,
        title,
        content: generatedText,
        headerImage: img || null,
        timestamp: Date.now()
      });

    } catch (err: any) {
      setError(err.message || "Failed to generate.");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicDiscover = async (isAI: boolean = false) => {
    if (loading) return;
    setLoading(true);
    setLoadingText("Searching for unseen projects...");
    setError("");
    
    const historyUrls = getHistoryUrls();
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const query = isAI 
        ? `Find the URLs of 10 top trending AI or Machine Learning GitHub repositories today. Return a JSON array of strings containing ONLY the full URLs.`
        : `Find the URLs of 10 top trending GitHub repositories today. Return a JSON array of strings containing ONLY the full URLs.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: query,
        config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
      });
      
      let fetchedUrls: string[] = [];
      try {
        fetchedUrls = JSON.parse(response.text);
      } catch {
        fetchedUrls = (response.text || "").match(/https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+/g) || [];
      }

      // Filter out history
      const unseenUrls = fetchedUrls.filter(u => !historyUrls.has(u.toLowerCase().trim())).slice(0, targetCount);

      if (unseenUrls.length === 0) {
        throw new Error("I checked the latest trending projects but you've already covered all of them! Try again in a few hours or change settings.");
      }

      setUrls(unseenUrls);
      if (unseenUrls.length < targetCount) {
        setTargetCount(unseenUrls.length);
      }
      
      // Auto-generate
      setTimeout(() => generateArticle(unseenUrls), 100);

    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const generateImage = async (ai: GoogleGenAI, title: string) => {
    try {
      const promptResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Given this WeChat article title: "${title}", describe a single, beautiful, high-quality cover image representing tech innovation. Description in English. NO TEXT.`,
      });
      const visualPrompt = promptResponse.text || `Abstract tech collection cover for ${title}`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `${visualPrompt}. Professional digital art, cinematic lighting, ${currentTheme.name} color palette. NO TEXT.` }] },
        config: { imageConfig: { aspectRatio: "16:9" } },
      });
      return response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data 
        ? `data:image/png;base64,${response.candidates[0].content.parts.find(p => p.inlineData)!.inlineData!.data}` 
        : null;
    } catch (err) { 
      return null; 
    }
  };

  const getHtmlContent = () => {
    if (!article) return { __html: "" };
    try {
      return { __html: marked.parse(article) as string };
    } catch (e) {
      return { __html: `<p class="text-red-500">Error parsing content: ${e}</p>` };
    }
  };

  const getThemeStyles = () => `
    .prose-content { font-family: ${currentFont.value}; color: ${currentTheme.text}; }
    .prose-content h1 { color: ${currentTheme.isGradientHeading ? 'transparent' : currentTheme.headingColor}; border-bottom-color: ${customPrimaryColor}; }
    .prose-content h2::before { background: ${customPrimaryColor}; }
    .prose-content blockquote { background: ${currentTheme.secondaryBg}; border-left-color: ${customPrimaryColor}; }
    .prose-content strong { color: ${customPrimaryColor}; }
  `;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 pb-20 overflow-x-hidden">
      <style>{getThemeStyles()}</style>
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        <div className="relative text-center mb-12">
          <div className="absolute right-0 top-0 flex gap-2">
            <button onClick={() => setShowHistory(true)} className="p-2 text-slate-400 hover:text-white transition-colors flex items-center gap-1" title="History">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              {history.length > 0 && <span className="bg-indigo-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{history.length}</span>}
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white transition-colors" title="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
          </div>
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight"><span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">Git2WeChat</span></h1>
          <p className="text-slate-400 text-sm italic">Never cover the same repo twice. Smart discovery enabled.</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl shadow-2xl mb-8 space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-3">
               <span className="text-sm font-bold text-slate-400">Count:</span>
               <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700">
                  {[1, 2, 3].map(n => (
                    <button 
                      key={n} 
                      onClick={() => setTargetCount(n)}
                      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${targetCount === n ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {n}
                    </button>
                  ))}
               </div>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => handleMagicDiscover(false)} 
                  disabled={loading} 
                  className="px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:scale-105 active:scale-95 transition-all text-xs flex items-center gap-2"
                >
                  ✨ Magic Generate
                </button>
                <button 
                  onClick={() => handleMagicDiscover(true)} 
                  disabled={loading} 
                  className="px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:scale-105 active:scale-95 transition-all text-xs flex items-center gap-2"
                >
                  🤖 Magic AI
                </button>
             </div>
          </div>
          
          <div className="space-y-3">
            {urls.map((u, i) => {
              const isDuplicate = getHistoryUrls().has(u.toLowerCase().trim());
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className={`bg-slate-900 rounded-xl border transition-all flex items-center px-4 ${isDuplicate ? 'border-yellow-500/50' : 'border-slate-700 focus-within:border-indigo-500'}`}>
                    <span className="text-slate-500 text-xs font-bold mr-3">{i+1}.</span>
                    <input 
                      type="text" 
                      value={u} 
                      onChange={(e) => updateUrlField(i, e.target.value)} 
                      placeholder="https://github.com/owner/repo" 
                      className="w-full bg-transparent border-none outline-none text-white py-3 placeholder-slate-600"
                    />
                    {isDuplicate && (
                      <span className="text-[9px] uppercase font-bold text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded whitespace-nowrap ml-2">Already Introduced</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button 
            onClick={() => generateArticle()} 
            disabled={loading} 
            className={`w-full px-8 py-4 rounded-xl font-bold text-white transition-all shadow-lg ${loading ? 'bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'}`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 {loadingText}
              </div>
            ) : targetCount === 1 ? "Generate Deep-Dive" : "Generate Roundup"}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-4 rounded-xl mb-8 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          {error}
        </div>}

        <div className="mb-6 bg-slate-800/50 rounded-xl p-4 flex flex-wrap gap-6 justify-between items-center">
          <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
            {THEMES.map(t => <button key={t.id} onClick={() => setCurrentTheme(t)} className={`px-3 py-1.5 rounded-md text-xs transition-all ${currentTheme.id === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>{t.name}</button>)}
          </div>
          <div className="flex items-center gap-2"><input type="color" value={customPrimaryColor} onChange={(e) => setCustomPrimaryColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none" /><span className="text-xs font-mono">{customPrimaryColor}</span></div>
          <select value={currentFont.id} onChange={(e) => setCurrentFont(FONTS.find(f => f.id === e.target.value) || FONTS[0])} className="bg-slate-900 text-xs px-3 py-1.5 rounded-lg border border-slate-700">{FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        </div>

        {article && (
          <div className="fade-in-up">
            <div className="flex justify-end gap-3 mb-4">
              <button onClick={() => setIsEditing(!isEditing)} className="text-indigo-400 border border-indigo-400/30 px-4 py-2 rounded-lg text-sm transition-colors hover:bg-indigo-400/10">{isEditing ? "Preview" : "Edit"}</button>
              <button onClick={() => navigator.clipboard.writeText(article).then(() => alert("Markdown copied!"))} className="text-indigo-400 border border-indigo-400/30 px-4 py-2 rounded-lg text-sm transition-colors hover:bg-indigo-400/10">Copy Markdown</button>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-2xl transition-all" style={{ backgroundColor: currentTheme.bg, border: `1px solid ${currentTheme.borderColor}` }}>
              <div className="w-full relative min-h-[100px] border-b" style={{ backgroundColor: currentTheme.codeBg, borderColor: currentTheme.borderColor }}>
                {headerImage ? <img src={headerImage} className="w-full h-auto object-cover" /> : imageLoading && <div className="h-48 flex items-center justify-center animate-pulse text-indigo-400 font-bold">Designing Content Cover...</div>}
              </div>
              {isEditing ? <textarea value={article} onChange={(e) => setArticle(e.target.value)} className="w-full h-[600px] p-8 md:p-12 font-mono text-sm bg-transparent outline-none resize-none" style={{ color: currentTheme.text }} /> : <div ref={contentRef} className="prose-content p-8 md:p-12 min-h-[400px]" dangerouslySetInnerHTML={getHtmlContent()} />}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
             <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2">Project History</h3>
                  <button onClick={() => setShowHistory(false)} className="hover:text-white transition-colors">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto space-y-3">
                  {history.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 italic">No history yet. Magic Discover will find something new for you!</div>
                  ) : (
                    history.map(entry => (
                      <div key={entry.urls.join(',')} onClick={() => loadFromHistory(entry)} className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/50 p-4 rounded-xl cursor-pointer transition-all flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {entry.headerImage ? <img src={entry.headerImage} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-slate-500">GIT</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-200 truncate">{entry.title}</h4>
                          <p className="text-xs text-slate-500 truncate">{entry.urls.join(', ')}</p>
                          <p className="text-[10px] text-slate-600 mt-1">{new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                        <button onClick={(e) => deleteFromHistory(e, entry.urls.join(','))} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
             <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-800 flex justify-between">
                  <h3 className="font-bold">Settings</h3>
                  <button onClick={() => setShowSettings(false)} className="hover:text-white transition-colors">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex gap-4 border-b border-slate-800 mb-4"><button onClick={() => setActiveTab('wechat')} className={`pb-2 transition-all ${activeTab === 'wechat' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400'}`}>WeChat</button><button onClick={() => setActiveTab('model')} className={`pb-2 transition-all ${activeTab === 'model' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400'}`}>AI Model</button></div>
                  {activeTab === 'wechat' ? <div className="space-y-4"><div><label className="text-xs uppercase text-slate-500 font-bold">App ID</label><input type="text" value={wechatConfig.appId} onChange={e => setWechatConfig({...wechatConfig, appId: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /></div><div><label className="text-xs uppercase text-slate-500 font-bold">App Secret</label><input type="password" value={wechatConfig.appSecret} onChange={e => setWechatConfig({...wechatConfig, appSecret: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /></div></div> : <div className="space-y-4"><div><label className="text-xs uppercase text-slate-500 font-bold">Provider</label><select value={llmConfig.provider} onChange={e => setLlmConfig({...llmConfig, provider: e.target.value as any})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 outline-none focus:border-indigo-500"><option value="gemini">Gemini (Built-in)</option><option value="custom">Custom (OpenAI API)</option></select></div>{llmConfig.provider === 'custom' && <div className="space-y-2"><input placeholder="Base URL" value={llmConfig.baseUrl} onChange={e => setLlmConfig({...llmConfig, baseUrl: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /><input placeholder="API Key" type="password" value={llmConfig.apiKey} onChange={e => setLlmConfig({...llmConfig, apiKey: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /><input placeholder="Model" value={llmConfig.model} onChange={e => setLlmConfig({...llmConfig, model: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /></div>}</div>}
                </div>
                <div className="p-6 border-t border-slate-800 flex justify-end gap-2"><button onClick={() => setShowSettings(false)} className="px-4 py-2 hover:text-white">Cancel</button><button onClick={() => setShowSettings(false)} className="bg-indigo-600 px-6 py-2 rounded-lg text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg">Save</button></div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);