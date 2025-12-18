import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { marked } from "marked";

// Ensure hljs is available (loaded via script tag in HTML)
declare const hljs: any;

// --- Theme Definitions ---

type Theme = {
  id: string;
  name: string;
  bg: string;
  text: string;
  headingColor: string; // Used for H1/H2 text
  headingDecoration: string; // Used for borders/accents
  secondaryBg: string; // Used for blockquotes/cards
  blockquoteBorder: string;
  codeBg: string;
  codeText: string;
  borderColor: string;
  isGradientHeading?: boolean;
};

const THEMES: Theme[] = [
  {
    id: 'wechat-light',
    name: 'Standard White',
    bg: '#ffffff',
    text: '#333333',
    headingColor: '#1f2937',
    headingDecoration: '#07c160', // WeChat Green
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
    headingColor: 'transparent', // Gradient clip
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

// --- Proxy Configuration ---
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

// --- LLM Types ---
type LLMConfig = {
  provider: 'gemini' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
};

const LLM_PRESETS = {
  alibaba: {
    name: "Alibaba Qwen (DashScope)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus"
  },
  volcengine: {
    name: "Volcano Engine (Doubao)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "ep-2024... (Use Endpoint ID)"
  },
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat"
  }
};

const App = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [groundingUrls, setGroundingUrls] = useState<Array<{ title: string; uri: string }>>([]);
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>(THEMES[0].headingDecoration);
  const [currentFont, setCurrentFont] = useState(FONTS[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const contentRef = useRef<HTMLDivElement>(null);

  // Helper to fix relative GitHub URLs
  const fixRelativeUrl = (href: string) => {
    if (!href) return href;
    if (href.startsWith('http')) return href;
    
    // Attempt to convert github.com url to raw content url
    const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
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

    // Configure Marked
    marked.use({
      renderer: {
        // Standard marked renderer uses positional args
        image(href: string, title: string | null, text: string) {
          // If called with token (newer behavior in some configurations)
          if (typeof href === 'object' && href !== null) {
            const token = href as any;
            href = token.href || '';
            title = token.title || '';
            text = token.text || '';
          }

          const cleanHref = fixRelativeUrl(href);
          
          if (!cleanHref) return '';
          if (cleanHref.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)/)) return '';
          if (text === 'VIDEO' || cleanHref.match(/\.(mp4|webm)$/i)) return '';
      
          return `<img src="${cleanHref}" alt="${text || ''}" title="${title || ''}" class="w-full rounded-xl my-6 shadow-xl ring-1 ring-white/10" onerror="this.style.display='none'">`;
        }
      }
    });
  }, [url]);

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

  const saveSettings = () => {
    localStorage.setItem('wechatConfig', JSON.stringify(wechatConfig));
    localStorage.setItem('llmConfig', JSON.stringify(llmConfig));
    setShowSettings(false);
  };

  const applyPreset = (key: keyof typeof LLM_PRESETS) => {
    const preset = LLM_PRESETS[key];
    setLlmConfig({ ...llmConfig, provider: 'custom', baseUrl: preset.baseUrl, model: preset.model });
  };

  const generateArticle = async (overrideUrl?: string | unknown) => {
    const targetUrl = typeof overrideUrl === 'string' ? overrideUrl : url;
    if (!targetUrl.trim()) {
      setError("Please enter a valid GitHub URL");
      return;
    }
    setError("");
    setLoading(true);
    setArticle("");
    setHeaderImage(null);
    setGroundingUrls([]);
    setPublishStatus(null);
    setIsEditing(false);

    try {
      const prompt = `You are an expert tech blogger for a popular WeChat Official Account (公众号). Your task is to write a engaging, and structured article introducing the following GitHub repository: ${targetUrl}. Use Simplified Chinese. Search for README content and key features. Output in clean Markdown. Include screenshots/GIFs if found in the repo using markdown syntax.`;

      let generatedText = "";
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
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const textResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
        generatedText = textResponse.text || "No content.";
        const chunks = textResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) setGroundingUrls(chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri })));
      }

      setArticle(generatedText);
      const title = (generatedText.match(/^#\s+(.+)$/m)?.[1] || "Open Source Tech").replace(/\[.*?\]/g, '').trim();
      setImageLoading(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      generateImage(ai, title).then(img => { setHeaderImage(img || null); setImageLoading(false); });
    } catch (err: any) {
      setError(err.message || "Failed to generate.");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTrending = async (isAI: boolean = false) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const query = isAI 
        ? "Find the URL of a top trending AI, Machine Learning, or LLM-related GitHub repository today. Return ONLY the full URL."
        : "Find the URL of a top trending GitHub repository today. Return ONLY the full URL.";
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: query,
        config: { tools: [{ googleSearch: {} }] }
      });
      const match = (response.text || "").match(/https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+/);
      if (match) { 
        setUrl(match[0]); 
        await generateArticle(match[0]); 
      }
      else throw new Error("No URL found.");
    } catch (e: any) {
      setError("Failed to fetch trending: " + e.message);
      setLoading(false);
    }
  };

  const generateImage = async (ai: GoogleGenAI, title: string) => {
    try {
      // Step 1: Translate the Chinese title to a Visual English Prompt to avoid character rendering issues
      const promptResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Given this Chinese tech blog title: "${title}", describe a single, beautiful, high-quality, abstract or conceptual tech-style visual scene that represents this topic. The description must be in English. Do not include any text, letters, or words in the description. Just focus on visual metaphors, shapes, lighting, and colors.`,
      });
      
      const visualPrompt = promptResponse.text || `Abstract technology concept representing ${title}`;
      
      // Step 2: Generate the image using the English prompt and strict "no text" instruction
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `${visualPrompt}. Style: Professional 3D render, minimalist, high tech, clean aesthetic, ${currentTheme.name} colors. ABSOLUTELY NO TEXT, NO WORDS, NO CHARACTERS, NO LETTERS, NO TYPOGRAPHY.` }] },
        config: { imageConfig: { aspectRatio: "16:9" } },
      });
      
      return response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data 
        ? `data:image/png;base64,${response.candidates[0].content.parts.find(p => p.inlineData)!.inlineData!.data}` 
        : null;
    } catch (err) { 
      console.error("Image generation error:", err);
      return null; 
    }
  };

  const copyToClipboard = () => { if (article) navigator.clipboard.writeText(article).then(() => alert("Copied!")); };

  const publishToWeChat = async () => {
    if (!wechatConfig.appId || !wechatConfig.appSecret) { setShowSettings(true); return; }
    setPublishing(true);
    setPublishStatus(null);
    if (wechatConfig.appId === 'test') {
      await new Promise(r => setTimeout(r, 1000));
      setPublishStatus({ type: 'success', msg: 'Mock success!' });
      setPublishing(false);
      return;
    }
    setPublishStatus({ type: 'error', msg: 'Publishing requires backend support for file uploads. Copy Markdown for manual use.' });
    setPublishing(false);
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
          <button onClick={() => setShowSettings(true)} className="absolute right-0 top-0 p-2 text-slate-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight"><span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">Git2WeChat</span></h1>
        </div>

        <div className="glass-panel p-2 rounded-2xl shadow-2xl mb-8 flex flex-col md:flex-row gap-2">
          <div className="flex gap-2 shrink-0">
            <button onClick={() => handleTrending(false)} disabled={loading} className="px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 whitespace-nowrap hover:opacity-90 transition-opacity">🔥 Trending</button>
            <button onClick={() => handleTrending(true)} disabled={loading} className="px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-500 whitespace-nowrap hover:opacity-90 transition-opacity">🤖 AI Trending</button>
          </div>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="GitHub URL..." className="flex-1 bg-transparent border-none outline-none text-white px-4 py-4 placeholder-slate-500 text-lg" onKeyDown={(e) => e.key === 'Enter' && generateArticle()} />
          <button onClick={() => generateArticle()} disabled={loading} className={`px-8 py-4 rounded-xl font-bold text-white transition-colors ${loading ? 'bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{loading ? "Analyzing..." : "Generate"}</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-4 rounded-xl mb-8">{error}</div>}

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
              <button onClick={publishToWeChat} disabled={publishing} className="bg-green-600 px-4 py-2 rounded-lg text-sm text-white hover:bg-green-700 transition-colors">{publishing ? "Publishing..." : "Publish"}</button>
              <button onClick={copyToClipboard} className="text-indigo-400 border border-indigo-400/30 px-4 py-2 rounded-lg text-sm transition-colors hover:bg-indigo-400/10">Copy Markdown</button>
            </div>
            {publishStatus && <div className={`mb-4 p-4 rounded-lg border ${publishStatus.type === 'success' ? 'bg-green-500/10 text-green-200' : 'bg-yellow-500/10 text-yellow-200'}`}>{publishStatus.msg}</div>}
            <div className="rounded-2xl overflow-hidden shadow-2xl transition-all" style={{ backgroundColor: currentTheme.bg, border: `1px solid ${currentTheme.borderColor}` }}>
              <div className="w-full relative min-h-[100px] border-b" style={{ backgroundColor: currentTheme.codeBg, borderColor: currentTheme.borderColor }}>
                {headerImage ? <img src={headerImage} className="w-full h-auto object-cover" /> : imageLoading && <div className="h-48 flex items-center justify-center animate-pulse text-indigo-400 font-bold">Designing AI Cover (Text-free)...</div>}
              </div>
              {isEditing ? <textarea value={article} onChange={(e) => setArticle(e.target.value)} className="w-full h-[600px] p-8 md:p-12 font-mono text-sm bg-transparent outline-none resize-none" style={{ color: currentTheme.text }} /> : <div ref={contentRef} className="prose-content p-8 md:p-12 min-h-[400px]" dangerouslySetInnerHTML={getHtmlContent()} />}
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
             <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl">
                <div className="p-6 border-b border-slate-800 flex justify-between">
                  <h3 className="font-bold">Settings</h3>
                  <button onClick={() => setShowSettings(false)} className="hover:text-white transition-colors">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex gap-4 border-b border-slate-800 mb-4"><button onClick={() => setActiveTab('wechat')} className={`pb-2 transition-all ${activeTab === 'wechat' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400'}`}>WeChat</button><button onClick={() => setActiveTab('model')} className={`pb-2 transition-all ${activeTab === 'model' ? 'border-b-2 border-indigo-500 text-white font-bold' : 'text-slate-400'}`}>AI Model</button></div>
                  {activeTab === 'wechat' ? <div className="space-y-4"><div><label className="text-xs uppercase text-slate-500 font-bold">App ID</label><input type="text" value={wechatConfig.appId} onChange={e => setWechatConfig({...wechatConfig, appId: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /></div><div><label className="text-xs uppercase text-slate-500 font-bold">App Secret</label><input type="password" value={wechatConfig.appSecret} onChange={e => setWechatConfig({...wechatConfig, appSecret: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /></div></div> : <div className="space-y-4"><div><label className="text-xs uppercase text-slate-500 font-bold">Provider</label><select value={llmConfig.provider} onChange={e => setLlmConfig({...llmConfig, provider: e.target.value as any})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 outline-none focus:border-indigo-500"><option value="gemini">Gemini (Built-in)</option><option value="custom">Custom (OpenAI API)</option></select></div>{llmConfig.provider === 'custom' && <div className="space-y-2"><input placeholder="Base URL" value={llmConfig.baseUrl} onChange={e => setLlmConfig({...llmConfig, baseUrl: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /><input placeholder="API Key" type="password" value={llmConfig.apiKey} onChange={e => setLlmConfig({...llmConfig, apiKey: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /><input placeholder="Model" value={llmConfig.model} onChange={e => setLlmConfig({...llmConfig, model: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 focus:border-indigo-500 outline-none" /></div>}</div>}
                </div>
                <div className="p-6 border-t border-slate-800 flex justify-end gap-2"><button onClick={() => setShowSettings(false)} className="px-4 py-2 hover:text-white">Cancel</button><button onClick={saveSettings} className="bg-indigo-600 px-6 py-2 rounded-lg text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg">Save</button></div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);