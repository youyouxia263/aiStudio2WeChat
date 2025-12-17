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
  
  for (const proxyBase of PROXIES) {
    try {
      // Encode URL for the proxy
      const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl, options);
      
      if (response.ok) {
        return response;
      }
      
      // If the proxy returns an error status (e.g., 403, 500), try the next one
      console.warn(`Proxy ${proxyBase} returned status ${response.status} for ${targetUrl}`);
      lastError = new Error(`Proxy ${proxyBase} returned ${response.status}`);
    } catch (err) {
      console.warn(`Proxy ${proxyBase} connection failed:`, err);
      lastError = err;
    }
  }
  
  throw lastError || new Error("All proxy services failed to connect.");
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
  
  // Theme State
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]); // Default to White
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>(THEMES[0].headingDecoration);
  const [currentFont, setCurrentFont] = useState(FONTS[0]);

  // Editor State
  const [isEditing, setIsEditing] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'wechat' | 'model'>('wechat');
  
  // WeChat Config
  const [wechatConfig, setWechatConfig] = useState({ appId: '', appSecret: '' });
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  // LLM Config
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'gemini',
    baseUrl: '',
    apiKey: '',
    model: ''
  });

  const contentRef = useRef<HTMLDivElement>(null);

  // Load Configs from local storage on mount
  useEffect(() => {
    const savedWechat = localStorage.getItem('wechatConfig');
    if (savedWechat) setWechatConfig(JSON.parse(savedWechat));

    const savedLlm = localStorage.getItem('llmConfig');
    if (savedLlm) setLlmConfig(JSON.parse(savedLlm));

    // Configure Marked Renderer for Custom Media (Videos/YouTube)
    marked.use({
      renderer: {
        image(token: any) {
          const cleanHref = token.href || '';
          const cleanTitle = token.title || '';
          const cleanText = token.text || '';

          // Defensive check: ensure href is a string
          if (typeof cleanHref !== 'string') {
             return ''; 
          }

          // Filter out YouTube links
          if (cleanHref.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)/)) {
             return ''; 
          }
          
          // Filter out Video files or "VIDEO" alt text
          if (cleanText === 'VIDEO' || cleanHref.match(/\.(mp4|webm)$/i)) {
             return '';
          }
      
          // Standard Image
          return `<img src="${cleanHref}" alt="${cleanText}" title="${cleanTitle || ''}" class="w-full rounded-xl my-6 shadow-xl ring-1 ring-white/10">`;
        }
      }
    });

  }, []);

  // Update primary color when theme switches
  useEffect(() => {
    setCustomPrimaryColor(currentTheme.headingDecoration);
  }, [currentTheme.id]);

  // Initialize highlight.js
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
    alert("Configuration saved!");
  };

  const applyPreset = (key: keyof typeof LLM_PRESETS) => {
    const preset = LLM_PRESETS[key];
    setLlmConfig({
      ...llmConfig,
      provider: 'custom',
      baseUrl: preset.baseUrl,
      model: preset.model
    });
  };

  // --- Generation Logic ---

  const generateArticle = async (overrideUrl?: string | unknown) => {
    // Determine the URL to use: either the override string or the current state
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
      const prompt = `
        You are an expert tech blogger for a popular WeChat Official Account (公众号). 
        Your task is to write a "cool", engaging, and structured article introducing the following GitHub repository: ${targetUrl}.

        The article must follow this structure (output in Markdown):
        
        # [Emoji] [Catchy Title in Chinese, e.g. "Github High Star Recommendation: ..."]
        
        > [Brief, punchy intro blockquote explaining why this repo is useful or what pain point it solves.]

        ## 🚀 What is it? (project overview)
        [Explanation]
        
        [MEDIA INSTRUCTION: Check for a demo GIF or screenshot in the repo. If found, include it here. Use standard markdown image syntax \`![Alt](URL)\`. Do NOT include videos.]

        ## ✨ Key Features
        * [Feature 1]
        * [Feature 2]
        ...

        ## 🛠️ Quick Start (Code Snippets)
        [Provide a code block example of how to install or use it. Use the repository language.]

        ## 💡 Application Scenarios
        [Where can this be used?]

        ## 🔗 Conclusion
        [Summary and call to action to check out the repo.]

        **Style & Content Requirements:**
        * Language: Chinese (Simplified) mixed with English technical terms.
        * Tone: Enthusiastic, professional, developer-friendly.
        * Visuals: Use emojis liberally to make it look "cool" and modern.
        * Formatting: Use bolding (**text**) for emphasis.
        * **MEDIA IMPORTANCE**: Search diligently for visual content (screenshots, GIFs) in the repository README or website. **Automatically import** them into the Markdown. Do not use videos.
        * IMPORTANT: If you do not have real-time internet access, use your internal knowledge about this repository.
      `;

      let generatedText = "";

      if (llmConfig.provider === 'custom') {
        // --- CUSTOM PROVIDER (OpenAI Compatible) ---
        if (!llmConfig.baseUrl || !llmConfig.apiKey) {
           throw new Error("Custom Provider selected but Base URL or API Key is missing in Settings.");
        }

        const endpoint = `${llmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
        
        const response = await fetchWithProxy(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${llmConfig.apiKey}`
          },
          body: JSON.stringify({
            model: llmConfig.model || 'gpt-3.5-turbo',
            messages: [
              { role: "system", content: "You are a helpful technical writer." },
              { role: "user", content: prompt }
            ],
            stream: false
          })
        });

        const data = await response.json();
        if (data.error) {
           throw new Error(`Provider Error: ${data.error.message || JSON.stringify(data.error)}`);
        }
        generatedText = data.choices?.[0]?.message?.content || "No content generated.";
      
      } else {
        // --- GOOGLE GEMINI (Default) ---
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const textResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        generatedText = textResponse.text || "No content generated.";

        // Process grounding only for Gemini
        const chunks = textResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sources: Array<{ title: string; uri: string }> = [];
        if (chunks) {
          chunks.forEach((chunk: any) => {
            if (chunk.web) {
              sources.push({ title: chunk.web.title, uri: chunk.web.uri });
            }
          });
        }
        setGroundingUrls(sources);
      }

      setArticle(generatedText);

      // --- Image Generation (Gemini only for now) ---
      // We try to generate an image regardless of text provider, relying on the internal Gemini key
      // If the internal key is missing (e.g. env var), this might fail, which is handled gracefully.
      const titleMatch = generatedText.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].replace(/\[.*?\]/g, '').trim() : "Open Source Tech";
      
      setImageLoading(true);
      const aiForImage = new GoogleGenAI({ apiKey: process.env.API_KEY });
      generateImage(aiForImage, title).then((imgData) => {
        if (imgData) setHeaderImage(imgData);
        setImageLoading(false);
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate article. Please check your network or model settings.");
      setImageLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTrending = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    setArticle("");
    setHeaderImage(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Find the URL of the #1 top trending GitHub repository for today. Return ONLY the full URL starting with https://github.com/. Do not write any other text.",
        config: { tools: [{ googleSearch: {} }] }
      });
      
      const text = response.text || "";
      const match = text.match(/https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+/);
      
      if (match) {
        const foundUrl = match[0];
        setUrl(foundUrl);
        // Directly call generateArticle with the found URL
        await generateArticle(foundUrl); 
      } else {
        throw new Error("Could not find a valid GitHub URL for today's trending repo.");
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to fetch trending repo: " + e.message);
      setLoading(false);
    }
  };

  const generateImage = async (ai: GoogleGenAI, title: string) => {
    try {
      // Adjust prompt style based on current theme
      const styleDesc = currentTheme.id === 'wechat-light' 
        ? "Minimalist, Apple Style, Soft lighting" 
        : "Cyberpunk, Neon, Dark Mode, Glowing circuits";

      const imagePrompt = `A high quality header image for a tech blog post about "${title}". Style: ${styleDesc}. Colors: ${currentTheme.id === 'wechat-light' ? 'White, Silver, bright Blue' : 'Deep Purple, Cyan, Neon Blue'}. No text.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: imagePrompt }] },
        config: { imageConfig: { aspectRatio: "16:9" } },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) {
      console.warn("Image generation failed silently (check API Key):", e);
    }
    return null;
  };

  const copyToClipboard = () => {
    if (!article) return;
    navigator.clipboard.writeText(article).then(() => {
      alert("Markdown copied to clipboard!");
    });
  };

  // --- WeChat Publishing Logic ---
  const publishToWeChat = async () => {
    if (!wechatConfig.appId || !wechatConfig.appSecret) {
      setShowSettings(true);
      setActiveTab('wechat');
      return;
    }

    setPublishing(true);
    setPublishStatus(null);
    
    // MOCK MODE: Allow users to test the flow without real credentials
    if (wechatConfig.appId.toLowerCase() === 'test' || wechatConfig.appId.toLowerCase() === 'mock') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        setPublishStatus({ type: 'success', msg: 'Mock Publish Successful! (Note: Use real credentials to publish to actual WeChat)' });
        setPublishing(false);
        return;
    }

    try {
      // 1. Get Access Token
      const targetTokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wechatConfig.appId}&secret=${wechatConfig.appSecret}`;
      
      const tokenRes = await fetchWithProxy(targetTokenUrl);
      const tokenData = await tokenRes.json();
      
      if (tokenData.errcode) {
        throw new Error(`WeChat Auth Error (${tokenData.errcode}): ${tokenData.errmsg}. Ensure your IP is whitelisted in WeChat Admin.`);
      }
      const accessToken = tokenData.access_token;

      // 2. Upload Cover Image (if exists)
      let thumb_media_id = null;
      if (headerImage) {
        try {
          // Convert Base64 to Blob
          const byteString = atob(headerImage.split(',')[1]);
          const mimeString = headerImage.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], {type: mimeString});
          const formData = new FormData();
          formData.append("media", blob, "cover.png");

          const targetUploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`;
          
          const uploadRes = await fetchWithProxy(targetUploadUrl, { method: 'POST', body: formData });
          const uploadData = await uploadRes.json();
          
          if (uploadData.media_id) {
            thumb_media_id = uploadData.media_id;
          } else {
             console.warn("Image upload failed:", uploadData);
          }
        } catch (imgErr) {
          console.warn("Image upload skipped due to proxy limitation:", imgErr);
        }
      }

      // 3. Create Draft
      const htmlContent = marked.parse(article) as string;
      const styledContent = `<div style="font-family: sans-serif;">${htmlContent}</div>`;
      
      const titleMatch = article.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].replace(/\[.*?\]/g, '').trim() : "Tech Article";

      const draftPayload = {
        articles: [
          {
            title: title,
            author: "Git2WeChat",
            digest: "Generated by Git2WeChat AI",
            content: styledContent,
            content_source_url: url,
            thumb_media_id: thumb_media_id || "",
            need_open_comment: 1,
            only_fans_can_comment: 0
          }
        ]
      };

      const targetDraftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`;
      
      const draftRes = await fetchWithProxy(targetDraftUrl, {
        method: 'POST',
        body: JSON.stringify(draftPayload),
        headers: { 'Content-Type': 'application/json' }
      });
      const draftData = await draftRes.json();

      if (draftData.media_id) {
        setPublishStatus({ type: 'success', msg: 'Draft created successfully! Check your WeChat Admin panel.' });
      } else if (draftData.errcode) {
        throw new Error(`Draft Creation Error (${draftData.errcode}): ${draftData.errmsg}`);
      } else {
        throw new Error("Unknown response from WeChat API during draft creation.");
      }

    } catch (e: any) {
      console.error(e);
      let errMsg = e.message || "Unknown error";
      if (errMsg.includes("Failed to fetch") || errMsg.includes("Proxy")) {
        errMsg = "Network/Proxy Error: Unable to reach WeChat API. This app runs in the browser and relies on public proxies which may be unstable. Try using 'test' as App ID for a mock run.";
      }
      setPublishStatus({ 
        type: 'error', 
        msg: errMsg 
      });
    } finally {
      setPublishing(false);
    }
  };

  const getHtmlContent = () => {
    if (!article) return { __html: "" };
    return { __html: marked.parse(article) as string };
  };

  // --- Dynamic CSS Injection ---
  const getThemeStyles = () => {
    const headingGradient = 'linear-gradient(to right, #818cf8, #c084fc)';
    
    return `
      .prose-content {
        font-family: ${currentFont.value};
        color: ${currentTheme.text};
      }
      .prose-content h1 {
        color: ${currentTheme.isGradientHeading ? 'transparent' : currentTheme.headingColor};
        background: ${currentTheme.isGradientHeading ? headingGradient : 'none'};
        -webkit-background-clip: ${currentTheme.isGradientHeading ? 'text' : 'border-box'};
        border-bottom-color: ${customPrimaryColor};
      }
      .prose-content h2 {
        color: ${currentTheme.headingColor === 'transparent' ? customPrimaryColor : currentTheme.headingColor};
      }
      .prose-content h2::before {
        background: ${customPrimaryColor};
      }
      .prose-content h3 {
        color: ${currentTheme.headingColor === 'transparent' ? '#cbd5e1' : currentTheme.text};
        opacity: 0.9;
      }
      .prose-content code {
        background-color: ${currentTheme.secondaryBg};
        color: ${currentTheme.id === 'wechat-light' ? '#c7254e' : '#f472b6'};
      }
      .prose-content pre {
        background-color: ${currentTheme.codeBg} !important;
        border: 1px solid ${currentTheme.borderColor};
        color: ${currentTheme.codeText};
      }
      .prose-content pre code {
        color: inherit;
      }
      .prose-content blockquote {
        background: ${currentTheme.secondaryBg};
        border-left-color: ${customPrimaryColor};
        color: ${currentTheme.text};
      }
      .prose-content strong {
        color: ${customPrimaryColor};
      }
      .prose-content a {
        color: ${customPrimaryColor};
        text-decoration: underline;
      }
      textarea::placeholder {
        opacity: 0.5;
      }
    `;
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-indigo-500 selection:text-white pb-20">
      <style>{getThemeStyles()}</style>

      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900 rounded-full blur-[120px] opacity-30"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900 rounded-full blur-[120px] opacity-30"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {/* Header with Settings Icon */}
        <div className="relative text-center mb-12">
          <button 
            onClick={() => setShowSettings(true)}
            className="absolute right-0 top-0 p-2 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            title="Configuration"
          >
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
             <span className="text-xs font-bold uppercase tracking-widest hidden md:inline">Settings</span>
          </button>
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
              Git2WeChat
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            Transform GitHub repositories into stunning WeChat articles using {llmConfig.provider === 'custom' ? 'Custom LLM' : 'Gemini AI'}.
          </p>
        </div>

        {/* Input Section */}
        <div className="glass-panel p-2 rounded-2xl shadow-2xl shadow-indigo-500/10 mb-8 flex flex-col md:flex-row gap-2 transition-all hover:shadow-indigo-500/20">
          <button
             onClick={handleTrending}
             disabled={loading}
             className="px-4 py-2 rounded-xl font-bold text-white transition-all duration-300 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 whitespace-nowrap flex items-center gap-2"
             title="Fetch current #1 trending repo and generate article"
          >
             <span>🔥 Trending</span>
          </button>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/username/repository"
            className="flex-1 bg-transparent border-none outline-none text-white px-4 py-4 placeholder-slate-500 text-lg w-full"
            onKeyDown={(e) => e.key === 'Enter' && generateArticle()}
          />
          <button
            onClick={() => generateArticle()}
            disabled={loading}
            className={`
              px-8 py-4 rounded-xl font-bold text-white transition-all duration-300
              ${loading 
                ? 'bg-slate-700 cursor-wait' 
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30 hover:scale-[1.02]'
              }
            `}
          >
            {loading ? "Analyzing..." : "Generate"}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-4 rounded-xl mb-8">
            {error}
          </div>
        )}

        {/* Customization Toolbar */}
        <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-xl p-4 backdrop-blur-sm">
           <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
             
             {/* Theme Select */}
             <div className="flex items-center gap-3">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Theme</span>
               <div className="flex bg-slate-900 rounded-lg p-1 gap-1">
                 {THEMES.map(t => (
                   <button
                     key={t.id}
                     onClick={() => setCurrentTheme(t)}
                     className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${currentTheme.id === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                   >
                     {t.name}
                   </button>
                 ))}
               </div>
             </div>

             {/* Color Picker */}
             <div className="flex items-center gap-3">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Accent</span>
               <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                  <input 
                    type="color" 
                    value={customPrimaryColor}
                    onChange={(e) => setCustomPrimaryColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
                    title="Choose Accent Color"
                  />
                  <span className="text-xs font-mono text-slate-300">{customPrimaryColor}</span>
               </div>
             </div>

             {/* Font Picker */}
             <div className="flex items-center gap-3">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Font</span>
               <select 
                  value={currentFont.id}
                  onChange={(e) => setCurrentFont(FONTS.find(f => f.id === e.target.value) || FONTS[0])}
                  className="bg-slate-900 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500"
               >
                 {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
               </select>
             </div>

           </div>
        </div>

        {/* Result Area */}
        {article && (
          <div className="fade-in-up">
            <div className="flex justify-end gap-3 mb-4">
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors text-sm font-medium border border-indigo-400/30 px-4 py-2 rounded-lg hover:bg-indigo-400/10"
              >
                {isEditing ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    Preview
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Edit
                  </>
                )}
              </button>
              <button 
                onClick={publishToWeChat}
                disabled={publishing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all
                  ${publishing ? 'bg-green-700 cursor-wait' : 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-600/20'}`}
              >
                 {publishing ? "Publishing..." : "Publish to WeChat"}
              </button>
              <button 
                onClick={copyToClipboard}
                className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors text-sm font-medium border border-indigo-400/30 px-4 py-2 rounded-lg hover:bg-indigo-400/10"
              >
                Copy Markdown
              </button>
            </div>
            
            {publishStatus && (
              <div className={`mb-4 p-4 rounded-lg border ${publishStatus.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-200' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200'}`}>
                {publishStatus.msg}
              </div>
            )}

            {/* The Article Preview/Edit Container */}
            <div 
              className="rounded-2xl overflow-hidden shadow-2xl transition-all duration-500"
              style={{ 
                backgroundColor: currentTheme.bg,
                border: `1px solid ${currentTheme.borderColor}`
              }}
            >
              <div 
                className="px-4 py-3 flex items-center gap-2 border-b"
                style={{ 
                  backgroundColor: currentTheme.id === 'wechat-light' || currentTheme.id === 'paper' ? '#f1f5f9' : 'rgba(15, 23, 42, 0.5)', 
                  borderColor: currentTheme.borderColor 
                }}
              >
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                <div 
                  className="ml-4 px-3 py-1 rounded-full text-xs flex-1 text-center font-mono opacity-60"
                  style={{ color: currentTheme.text, backgroundColor: currentTheme.secondaryBg }}
                >
                  {isEditing ? 'Editing Markdown' : 'WeChat Preview'}
                </div>
              </div>

              <div 
                className="w-full relative min-h-[200px] border-b"
                style={{ backgroundColor: currentTheme.codeBg, borderColor: currentTheme.borderColor }}
              >
                {headerImage ? (
                  <img src={headerImage} alt="Article Header" className="w-full h-auto object-cover" />
                ) : imageLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
                    <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium animate-pulse" style={{ color: currentTheme.codeText }}>Designing cover image with AI...</span>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center opacity-50" style={{ color: currentTheme.codeText }}>
                    <span className="text-sm">Cover image placeholder</span>
                  </div>
                )}
              </div>
              
              {isEditing ? (
                <textarea
                  value={article}
                  onChange={(e) => setArticle(e.target.value)}
                  className="w-full h-[600px] p-8 md:p-12 font-mono text-sm resize-y focus:outline-none"
                  spellCheck="false"
                  style={{
                    backgroundColor: 'transparent',
                    color: currentTheme.text,
                    fontFamily: "'JetBrains Mono', monospace"
                  }}
                  placeholder="Type your markdown here..."
                />
              ) : (
                <div 
                  ref={contentRef}
                  className="prose-content p-8 md:p-12"
                  dangerouslySetInnerHTML={getHtmlContent()}
                />
              )}
            </div>

            {/* Grounding Sources */}
            {groundingUrls.length > 0 && (
              <div className="mt-8 p-6 rounded-xl border border-slate-800 bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Sources Used</h3>
                <div className="flex flex-wrap gap-2">
                  {groundingUrls.map((source, idx) => (
                    <a 
                      key={idx} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-indigo-400 px-3 py-1.5 rounded-full transition-colors border border-slate-700 truncate max-w-[200px]"
                    >
                      {source.title || source.uri}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Improved Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
             <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-0 shadow-2xl flex flex-col max-h-[90vh]">
                
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white">Configuration</h3>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 px-6">
                  <button 
                    onClick={() => setActiveTab('wechat')}
                    className={`py-4 mr-6 text-sm font-medium transition-all border-b-2 ${activeTab === 'wechat' ? 'text-white border-indigo-500' : 'text-slate-400 border-transparent hover:text-slate-200'}`}
                  >
                    WeChat Publishing
                  </button>
                  <button 
                    onClick={() => setActiveTab('model')}
                    className={`py-4 text-sm font-medium transition-all border-b-2 ${activeTab === 'model' ? 'text-white border-indigo-500' : 'text-slate-400 border-transparent hover:text-slate-200'}`}
                  >
                    Model Settings (LLM)
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  
                  {activeTab === 'wechat' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <p className="text-sm text-slate-400 bg-slate-800/50 p-4 rounded-lg">
                        Enter credentials to enable one-click publishing. Use <code className="text-yellow-500">test</code> as App ID to simulate.
                      </p>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">App ID</label>
                        <input 
                          type="text" 
                          value={wechatConfig.appId} 
                          onChange={(e) => setWechatConfig({...wechatConfig, appId: e.target.value})}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">App Secret</label>
                        <input 
                          type="password" 
                          value={wechatConfig.appSecret} 
                          onChange={(e) => setWechatConfig({...wechatConfig, appSecret: e.target.value})}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === 'model' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                       {/* Provider Select */}
                       <div>
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-2">AI Provider</label>
                         <div className="flex gap-4">
                           <button 
                             onClick={() => setLlmConfig({...llmConfig, provider: 'gemini'})}
                             className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all ${llmConfig.provider === 'gemini' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                           >
                             Google Gemini
                           </button>
                           <button 
                             onClick={() => setLlmConfig({...llmConfig, provider: 'custom'})}
                             className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all ${llmConfig.provider === 'custom' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
                           >
                             Custom (OpenAI Compatible)
                           </button>
                         </div>
                       </div>

                       {llmConfig.provider === 'gemini' ? (
                          <div className="p-4 bg-slate-800/50 rounded-lg text-sm text-slate-400">
                             Using built-in Google Gemini 2.5 Flash model with Search Grounding. API Key is handled securely via the backend/env.
                          </div>
                       ) : (
                          <div className="space-y-4">
                            {/* Presets */}
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quick Presets</label>
                               <div className="flex flex-wrap gap-2">
                                  <button onClick={() => applyPreset('alibaba')} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs text-white">Alibaba Qwen</button>
                                  <button onClick={() => applyPreset('volcengine')} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs text-white">Volcengine (Doubao)</button>
                                  <button onClick={() => applyPreset('deepseek')} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs text-white">DeepSeek</button>
                               </div>
                            </div>

                            <hr className="border-slate-800"/>

                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Base URL</label>
                               <input 
                                 type="text" 
                                 placeholder="https://api.example.com/v1"
                                 value={llmConfig.baseUrl}
                                 onChange={(e) => setLlmConfig({...llmConfig, baseUrl: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                               />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-2">API Key</label>
                               <input 
                                 type="password" 
                                 placeholder="sk-..."
                                 value={llmConfig.apiKey}
                                 onChange={(e) => setLlmConfig({...llmConfig, apiKey: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                               />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Model Name</label>
                               <input 
                                 type="text" 
                                 placeholder="e.g. qwen-max, ep-2024..."
                                 value={llmConfig.model}
                                 onChange={(e) => setLlmConfig({...llmConfig, model: e.target.value})}
                                 className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                               />
                               <p className="text-xs text-slate-500 mt-1">For Volcengine, use the Endpoint ID as the model name.</p>
                            </div>
                          </div>
                       )}
                    </div>
                  )}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-900 rounded-b-2xl">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveSettings}
                    className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/20"
                  >
                    Save Configuration
                  </button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);