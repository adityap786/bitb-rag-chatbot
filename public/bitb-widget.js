/* BITB Widget v1.0.0 - Production Bundle */
(function() {
  const VERSION = '1.0.0';
  const WIDGET_ID = 'bitb-widget-root';

  function log(...args) {
    if (window.bitbDebug) console.log('[BITB]', ...args);
  }

  function createWidgetRoot() {
    let root = document.getElementById(WIDGET_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = WIDGET_ID;
      root.style.position = 'fixed';
      root.style.bottom = '24px';
      root.style.right = '24px';
      root.style.zIndex = '9999';
      root.style.background = '#222';
      root.style.borderRadius = '16px';
      root.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
      root.style.width = '380px';
      root.style.height = '600px';
      document.body.appendChild(root);
    }
    return root;
  }

  function renderWidget({ tenantId, env, token }) {
    const root = createWidgetRoot();
    root.innerHTML = '';
    // For demo: show basic info, in real use load iframe or React app
    const info = document.createElement('div');
    info.style.color = '#fff';
    info.style.padding = '24px';
    info.innerHTML = `<b>BITB Widget</b><br>Tenant: ${tenantId}<br>Env: ${env}<br>Token: ${token ? '✔️' : '❌'}<br>Version: ${VERSION}`;
    root.appendChild(info);
    // TODO: Load iframe or React app here
    return root;
  }

  function autoInitFromAttrs() {
    const script = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.includes('bitb-widget.js'));
    if (!script) return;
    const tenantId = script.getAttribute('data-tenant-id');
    const env = script.getAttribute('data-env') || 'production';
    const token = script.getAttribute('data-token') || null;
    if (tenantId) {
      window.bitbInit({ tenantId, env, token });
    }
  }

  window.bitbInit = function({ tenantId, env = 'production', token = null, onReady = null }) {
    if (!tenantId) throw new Error('BITB: tenantId required');
    log('Initializing widget', { tenantId, env, token });
    const widget = renderWidget({ tenantId, env, token });
    if (typeof onReady === 'function') {
      try { onReady(widget); } catch (e) { log('onReady error', e); }
    }
    window.bitbWidget = widget;
    window.bitbWidgetVersion = VERSION;
  };

  // Auto-init if data-tenant-id present
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    autoInitFromAttrs();
  } else {
    window.addEventListener('DOMContentLoaded', autoInitFromAttrs);
  }

  log('BITB Widget v' + VERSION + ' loaded');
})();(function () {
  "use strict";

  if (typeof window === "undefined") {
    return;
  }

  const script = document.currentScript;
  if (!script) {
    console.warn("[BiTB] Widget script could not locate current script element.");
    return;
  }

  const ATTR = (name, fallback) => script.getAttribute(name) || fallback;

  const CONFIG = {
    trialToken: ATTR("data-trial-token", "preview"),
    apiBaseUrl: ATTR("data-api-url", window.BITB_API_BASE || ""),
    cdnBaseUrl: ATTR("data-cdn", "https://cdn.bitb.ai"),
    theme: ATTR("data-theme", "auto"),
    position: ATTR("data-position", "bottom-right"),
    locale: ATTR("data-locale", "en"),
    origin: window.location.origin,
    maxMessages: 100,
  };

  const STATE = {
    trial: null,
    cache: new Map(),
    lastRequestTime: 0,
    widgetOpen: false,
    minimized: false,
    isMuted: localStorage.getItem("bitb_voice_muted") === "true",
    hasGreeted: sessionStorage.getItem("bitb_voice_greeted") === "true",
    messages: [],
    loading: false,
    focusRestoreEl: null,
    settingsOpen: false,
    previewSeed: [],
  };

  const PREVIEW_SEED = window.BITB_PREVIEW_SEED || [
    {
      question: "What is Bits and Bytes Private Limited (BiTB)?",
      answer:
        "Bits and Bytes Private Limited builds the BiTB retrieval augmented chatbot platform. We help service, commerce, and enterprise teams turn their own documentation into voice ready assistants with guaranteed citations and usage controls.",
      sources: [{ url: "https://bitb.ltd/", title: "Overview" }],
    },
    {
      question: "What does the BiTB Service Desk subscription include?",
      answer:
        "BiTB Service Desk supports agencies and consultancies with 5k monthly responses, three concurrent trials, lead routing automations, and instant ingestion of proposals plus SOP PDFs. Teams usually cut follow up email volume by more than half.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Service Desk" }],
    },
    {
      question: "How does BiTB Commerce Assist help ecommerce brands?",
      answer:
        "Commerce Assist syncs your product catalog, sizing charts, and shipping policies so the assistant can answer cart level questions, suggest bundles, and trigger promo codes. It integrates with Shopify or headless storefront APIs and reports conversion lift.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Commerce Assist" }],
    },
    {
      question: "What does Enterprise Command deliver for compliance heavy teams?",
      answer:
        "Enterprise Command runs on a dedicated ingestion worker with SSO, SCIM, private FAISS clusters, and custom LLM endpoints. It includes 24x7 response SLAs under 30 minutes and supports SOC 2 readiness with granular retention controls.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Enterprise Command" }],
    },
    {
      question: "How does the 3-day trial and ingestion workflow operate?",
      answer:
        "Each trial lasts 72 hours, allows 50 crawled pages or five 10 MB uploads, and generates an origin locked token plus embed snippet. Content is chunked into 750 token windows, stored in FAISS, and wiped automatically when the trial expires.",
      sources: [{ url: "https://bitb.ltd/connect#trial", title: "Trial Workflow" }],
    },
    {
      question: "How does BiTB protect data and privacy?",
      answer:
        "BiTB isolates vectors per tenant, redacts PII during ingestion, and runs quarterly penetration tests. Enterprise Command customers can request custom retention schedules while all plans enforce origin validation and rate limiting by default.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Security" }],
    },
  ];

  const STYLE_TAG = document.createElement("style");
  STYLE_TAG.textContent = `
    #bitb-root { position: fixed; z-index: 2147483000; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; }
    #bitb-root *, #bitb-root *::before, #bitb-root *::after { box-sizing: border-box; }
    #bitb-floating-button { width: 3.5rem; height: 3.5rem; border-radius: 9999px; background: #0f172a; border: 1px solid rgba(255,255,255,0.12); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; position: relative; }
    #bitb-floating-button:focus { outline: 2px solid #38bdf8; outline-offset: 2px; }
    #bitb-floating-button:hover { transform: translateY(-2px); box-shadow: 0 16px 32px rgba(15,23,42,0.35); }
    #bitb-chat-panel { position: fixed; border-radius: 1.25rem; background: #020617; border: 1px solid rgba(148,163,184,0.1); width: min(420px, calc(100vw - 32px)); height: min(600px, calc(100vh - 100px)); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 48px rgba(2,6,23,0.5); opacity: 0; pointer-events: none; transform: translateY(16px) scale(0.98); transition: opacity 0.24s ease, transform 0.24s ease; }
    #bitb-chat-panel.bitb-open { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }
    #bitb-chat-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(148,163,184,0.12); background: rgba(15,23,42,0.9); backdrop-filter: blur(14px); }
    #bitb-header-meta { display: flex; gap: 0.75rem; align-items: center; }
    #bitb-header-meta .bitb-avatar { width: 2.5rem; height: 2.5rem; border-radius: 999px; background: linear-gradient(135deg,#38bdf8,#6366f1); display:flex; align-items:center; justify-content:center; font-weight:600; }
    #bitb-header-meta .bitb-status { font-size: 0.75rem; color: rgba(148,163,184,0.8); }
    .bitb-icon-button { width: 2.25rem; height: 2.25rem; border-radius: 999px; border: 1px solid rgba(148,163,184,0.24); background: transparent; color: #e2e8f0; display:flex; align-items:center; justify-content:center; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease; }
    .bitb-icon-button:hover { background: rgba(148,163,184,0.12); border-color: rgba(148,163,184,0.4); }
    .bitb-icon-button:focus { outline: 2px solid #38bdf8; outline-offset: 2px; }
    #bitb-messages { flex: 1; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
    #bitb-messages::-webkit-scrollbar { width: 8px; }
    #bitb-messages::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 999px; }
    .bitb-bubble { max-width: 85%; padding: 0.85rem 1rem; border-radius: 1rem; font-size: 0.95rem; line-height: 1.45; opacity: 0; transform: translateY(8px); transition: opacity 0.22s ease, transform 0.22s ease; }
    .bitb-bubble.bitb-visible { opacity: 1; transform: translateY(0); }
    .bitb-bubble.bitb-user { margin-left: auto; background: rgba(56,189,248,0.18); border: 1px solid rgba(125,211,252,0.35); }
    .bitb-bubble.bitb-assistant { background: rgba(15,23,42,0.65); border: 1px solid rgba(100,116,139,0.32); }
    .bitb-sources { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148,163,184,0.12); font-size: 0.8rem; color: rgba(148,163,184,0.9); display: grid; gap: 0.5rem; }
    .bitb-source-link { display: inline-flex; align-items: center; gap: 0.35rem; color: #38bdf8; text-decoration: none; font-weight: 500; }
    .bitb-source-link:hover { text-decoration: underline; }
    #bitb-input-region { padding: 1rem 1.25rem; border-top: 1px solid rgba(148,163,184,0.12); background: rgba(2,6,23,0.94); backdrop-filter: blur(14px); display:flex; flex-direction: column; gap: 0.75rem; }
    #bitb-textarea { width: 100%; min-height: 52px; max-height: 140px; resize: none; border-radius: 0.9rem; border: 1px solid rgba(148,163,184,0.18); padding: 0.85rem 1rem; background: rgba(15,23,42,0.6); color: #e2e8f0; font-size: 0.95rem; line-height: 1.4; }
    #bitb-textarea:focus { outline: 2px solid #38bdf8; outline-offset: 2px; }
    #bitb-send-row { display:flex; align-items:center; justify-content: space-between; gap: 0.75rem; }
    #bitb-send-button { border-radius: 0.85rem; background: linear-gradient(135deg,#38bdf8,#6366f1); border: none; padding: 0.8rem 1.4rem; color: #0f172a; font-weight: 600; cursor: pointer; display:flex; align-items:center; gap: 0.5rem; }
    #bitb-send-button[disabled] { opacity: 0.55; cursor: not-allowed; }
    .bitb-pill { display:inline-flex; align-items:center; gap:0.4rem; padding:0.35rem 0.75rem; border-radius:999px; background:rgba(148,163,184,0.16); font-size:0.75rem; color:rgba(226,232,240,0.85); }
    #bitb-settings-panel { position: fixed; right: 16px; bottom: 16px; width: min(360px, calc(100vw - 24px)); max-height: calc(100vh - 160px); border-radius: 1rem; border: 1px solid rgba(148,163,184,0.16); background: rgba(2,6,23,0.96); backdrop-filter: blur(12px); box-shadow: 0 24px 36px rgba(2,6,23,0.55); overflow: hidden; display:none; flex-direction: column; z-index: 2147483646; }
    #bitb-settings-panel.bitb-open { display:flex; }
    #bitb-settings-panel header { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(148,163,184,0.12); display:flex; justify-content: space-between; align-items:center; }
    #bitb-settings-scroll { padding: 1rem 1.25rem; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    #bitb-settings-scroll::-webkit-scrollbar { width: 8px; }
    #bitb-settings-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.24); border-radius: 999px; }
    .bitb-field { display:flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1rem; }
    .bitb-field label { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(148,163,184,0.8); }
    .bitb-field input[type="text"], .bitb-field input[type="color"], .bitb-field select { border-radius: 0.75rem; border:1px solid rgba(148,163,184,0.18); background: rgba(15,23,42,0.6); color: #e2e8f0; padding: 0.7rem 0.85rem; font-size: 0.92rem; }
    #bitb-settings-close { background: none; border: none; color: #e2e8f0; cursor: pointer; width: 2rem; height: 2rem; border-radius: 999px; }
    #bitb-settings-close:hover { background: rgba(148,163,184,0.14); }
    .bitb-toast { position: fixed; inset-inline-start: 50%; top: 32px; transform: translateX(-50%); background: rgba(15,23,42,0.92); color: #e2e8f0; padding: 0.85rem 1.1rem; border-radius: 0.8rem; border: 1px solid rgba(148,163,184,0.16); box-shadow: 0 16px 32px rgba(2,6,23,0.4); z-index: 2147483647; font-size: 0.9rem; opacity:0; transition: opacity 0.24s ease, transform 0.24s ease; }
    .bitb-toast.bitb-show { opacity:1; transform: translateX(-50%) translateY(0); }
    @media (max-width: 640px) {
      #bitb-chat-panel { width: calc(100vw - 24px); height: calc(100vh - 48px); left: 12px !important; right: 12px !important; bottom: 12px !important; border-radius: 1rem; }
      #bitb-settings-panel { width: 100vw; max-height: 100vh; left:0; right:0; top:0; bottom:0; border-radius:0; }
    }
  `;
  document.head.appendChild(STYLE_TAG);

  function now() {
    return Date.now();
  }

  function saveSession() {
    try {
      const payload = {
        messages: STATE.messages.slice(-CONFIG.maxMessages),
        minimized: STATE.minimized,
      };
      sessionStorage.setItem(sessionKey(), JSON.stringify(payload));
    } catch (error) {
      console.warn("[BiTB] Failed to persist session", error);
    }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(sessionKey());
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (Array.isArray(payload.messages)) {
        STATE.messages = payload.messages;
      }
      STATE.minimized = Boolean(payload.minimized);
    } catch (error) {
      console.warn("[BiTB] Failed to recover session", error);
    }
  }

  function sessionKey() {
    return `bitb_session_${CONFIG.trialToken}`;
  }

  function toast(message) {
    const existing = document.getElementById("bitb-toast");
    if (existing) {
      existing.remove();
    }
    const node = document.createElement("div");
    node.id = "bitb-toast";
    node.className = "bitb-toast";
    node.textContent = message;
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add("bitb-show"));
    setTimeout(() => {
      node.classList.remove("bitb-show");
      setTimeout(() => node.remove(), 240);
    }, 2800);
  }

  async function fetchJSON(path, options = {}) {
    const url = CONFIG.apiBaseUrl ? `${CONFIG.apiBaseUrl}${path}` : path;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkTrial() {
    try {
      const result = await fetchJSON(`/api/check-trial?trial_token=${encodeURIComponent(CONFIG.trialToken)}&origin=${encodeURIComponent(CONFIG.origin)}`);
      STATE.trial = result;
      return result;
    } catch (error) {
      console.warn("[BiTB] Trial validation failed, falling back to preview", error);
      STATE.trial = {
        valid: CONFIG.trialToken === "preview",
        preview: true,
        expires_at: null,
        usage: { queries_remaining: 999 },
      };
      STATE.previewSeed = PREVIEW_SEED;
      return STATE.trial;
    }
  }

  const Greeting = (() => {
    const FALLBACK_AUDIO = `${CONFIG.cdnBaseUrl.replace(/\/$/, "")}/static/bitb-rachel-in.mp3`;
    let voices = [];

    function cacheVoices() {
      voices = window.speechSynthesis.getVoices();
      if (!voices.length && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
        window.speechSynthesis.onvoiceschanged = () => {
          voices = window.speechSynthesis.getVoices();
        };
      }
    }

    cacheVoices();

    function getVoice() {
      if (!voices.length) {
        cacheVoices();
      }
      if (!voices.length) return null;
      const target = voices.find((voice) => /en-?in|hi-?in|aditi|kajal|rachel/i.test((voice.lang || "") + voice.name));
      if (target) return target;
      const female = voices.find((voice) => /female/i.test(voice.name));
      return female || voices[0];
    }

    async function play() {
      if (STATE.isMuted || STATE.hasGreeted) {
        return;
      }
      STATE.hasGreeted = true;
      sessionStorage.setItem("bitb_voice_greeted", "true");

      const text = "Namaste, I am your virtual assistant Rachel, I am here to help you with chatbot trial.";
      if ("speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(text);
        const voice = getVoice();
        if (voice) {
          utter.voice = voice;
        }
        utter.rate = 0.92;
        utter.pitch = 1.03;
        utter.onend = () => {};
        window.speechSynthesis.speak(utter);
      } else {
        const audio = new Audio(FALLBACK_AUDIO);
        audio.play().catch(() => {
          showTextGreeting(text);
        });
        return;
      }
      showTextGreeting(text);
    }

    function showTextGreeting(text) {
      const banner = document.createElement("div");
      banner.className = "bitb-toast";
      banner.textContent = text;
      document.body.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add("bitb-show"));
      setTimeout(() => banner.remove(), 3200);
    }

    return { play };
  })();

  function ensurePreviewSeed() {
    if (STATE.previewSeed.length) return;
    try {
      if (window.BITB_PREVIEW_SEED) {
        STATE.previewSeed = window.BITB_PREVIEW_SEED;
      } else {
        STATE.previewSeed = PREVIEW_SEED;
      }
    } catch (error) {
      STATE.previewSeed = PREVIEW_SEED;
    }
  }

  function appendMessage(message, elements) {
    STATE.messages.push(message);
    STATE.messages = STATE.messages.slice(-CONFIG.maxMessages);

    const bubble = document.createElement("div");
    bubble.className = `bitb-bubble ${message.role === "user" ? "bitb-user" : "bitb-assistant"}`;

    const content = document.createElement("div");
    content.innerHTML = linkify(message.content);
    bubble.appendChild(content);

    if (message.sources && message.sources.length) {
      const list = document.createElement("div");
      list.className = "bitb-sources";
      message.sources.forEach((source) => {
        const link = document.createElement("a");
        link.href = source.url;
        link.className = "bitb-source-link";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.title || source.url;
        list.appendChild(link);
      });
      bubble.appendChild(list);
    }

    elements.messages.appendChild(bubble);
    requestAnimationFrame(() => {
      bubble.classList.add("bitb-visible");
      scrollMessages(elements.messages);
    });
    saveSession();
  }

  function restoreMessages(elements) {
    STATE.messages.forEach((msg) => appendMessage(msg, elements));
  }

  function linkify(text) {
    if (!text) return "";
    const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safe = escape(text).replace(/\n/g, "<br>");
    return safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function scrollMessages(wrapper) {
    requestAnimationFrame(() => {
      wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: "smooth" });
    });
  }

  function throttleRequests() {
    const nowTs = now();
    if (nowTs - STATE.lastRequestTime < 500) {
      throw new Error("RATE_LIMIT");
    }
    STATE.lastRequestTime = nowTs;
  }

  function cacheKey(query) {
    return `${CONFIG.trialToken}::${query.trim().toLowerCase()}`;
  }

  function cacheAnswer(key, response) {
    STATE.cache.set(key, { response, expires: now() + 24 * 60 * 60 * 1000 });
  }

  function getCachedAnswer(key) {
    const entry = STATE.cache.get(key);
    if (!entry) return null;
    if (entry.expires < now()) {
      STATE.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  async function askHybrid(query) {
    throttleRequests();

    const key = cacheKey(query);
    const cached = getCachedAnswer(key);
    if (cached) {
      return cached;
    }

    if (!STATE.trial || !STATE.trial.valid) {
      ensurePreviewSeed();
      const response = previewAnswer(query);
      cacheAnswer(key, response);
      return response;
    }

    try {
      const response = await fetchJSON("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trial_token: CONFIG.trialToken,
          origin: CONFIG.origin,
          query,
          session_id: sessionKey(),
          history: STATE.messages.slice(-10),
        }),
      });
      cacheAnswer(key, response);
      return response;
    } catch (error) {
      console.warn("[BiTB] /api/ask failed, fallback to preview", error);
      ensurePreviewSeed();
      const response = previewAnswer(query);
      cacheAnswer(key, response);
      return response;
    }
  }

  function previewAnswer(query) {
    ensurePreviewSeed();
    const normalized = query.toLowerCase();
    let best = STATE.previewSeed[0];
    let bestScore = 0;
    STATE.previewSeed.forEach((item) => {
      const words = item.question.toLowerCase().split(/\s+/);
      let score = 0;
      words.forEach((word) => {
        if (normalized.includes(word)) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    return {
      answer: best.answer,
      sources: best.sources || [],
      confidence: Math.min(1, bestScore / 5 + 0.2),
    };
  }

  function toggleMute(button) {
    STATE.isMuted = !STATE.isMuted;
    localStorage.setItem("bitb_voice_muted", STATE.isMuted ? "true" : "false");
    button.setAttribute("aria-pressed", STATE.isMuted ? "true" : "false");
    button.textContent = STATE.isMuted ? "Unmute" : "Mute";
    toast(STATE.isMuted ? "Voice greeting muted." : "Voice greeting enabled.");
  }

  function lockBodyScroll(lock) {
    document.body.style.overflow = lock ? "hidden" : "";
  }

  function focusTrap(container, close) {
    const focusable = container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    container.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    first.focus({ preventScroll: true });
  }

  function createRootElements() {
    const root = document.createElement("div");
    root.id = "bitb-root";
    const positionMap = {
      "bottom-right": { bottom: "24px", right: "24px" },
      "bottom-left": { bottom: "24px", left: "24px" },
      "top-right": { top: "24px", right: "24px" },
      "top-left": { top: "24px", left: "24px" },
    };
    const placement = positionMap[CONFIG.position] || positionMap["bottom-right"];
    Object.assign(root.style, placement);
    document.body.appendChild(root);

    const button = document.createElement("button");
    button.id = "bitb-floating-button";
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open BiTB assistant");
    button.innerHTML = `<span aria-hidden="true">💬</span>`;
    root.appendChild(button);

    const panel = document.createElement("section");
    panel.id = "bitb-chat-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "BiTB chatbot window");

    const header = document.createElement("header");
    header.id = "bitb-chat-header";
    header.innerHTML = `
      <div id="bitb-header-meta">
        <div class="bitb-avatar" aria-hidden="true">Bi</div>
        <div>
          <div style="font-weight:600; font-size:1rem; color:#f8fafc;">BiTB Assistant</div>
          <div class="bitb-status">Online · 3-day trial</div>
        </div>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <button id="bitb-mute-toggle" class="bitb-icon-button" aria-label="Toggle voice greeting" aria-pressed="${STATE.isMuted}">${STATE.isMuted ? "Unmute" : "Mute"}</button>
        <button id="bitb-settings-toggle" class="bitb-icon-button" aria-label="Open chatbot settings">⚙️</button>
  <button id="bitb-minimize" class="bitb-icon-button" aria-label="Minimize chatbot">-</button>
        <button id="bitb-close" class="bitb-icon-button" aria-label="Close chatbot">✕</button>
      </div>`;
    panel.appendChild(header);

    const messages = document.createElement("div");
    messages.id = "bitb-messages";
    messages.setAttribute("aria-live", "polite");
    panel.appendChild(messages);

    const inputRegion = document.createElement("div");
    inputRegion.id = "bitb-input-region";
    inputRegion.innerHTML = `
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <span class="bitb-pill">Trial · 72h</span>
        <span class="bitb-pill">Hybrid RAG</span>
      </div>
      <textarea id="bitb-textarea" rows="2" placeholder="Ask about BiTB..." aria-label="Message input"></textarea>
      <div id="bitb-send-row">
        <span id="bitb-usage" style="font-size:0.8rem; color:rgba(148,163,184,0.8);"></span>
        <button id="bitb-send-button" type="button" disabled>Send ▸</button>
      </div>`;
    panel.appendChild(inputRegion);
    root.appendChild(panel);

    const settings = document.createElement("aside");
    settings.id = "bitb-settings-panel";
    settings.setAttribute("aria-hidden", "true");
    settings.innerHTML = `
      <header>
        <h2 style="font-size:1rem; font-weight:600;">Widget Settings</h2>
        <button id="bitb-settings-close" aria-label="Close settings">✕</button>
      </header>
      <div id="bitb-settings-scroll">
        <div class="bitb-field">
          <label for="bitb-theme-select">Theme</label>
          <select id="bitb-theme-select">
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div class="bitb-field">
          <label for="bitb-primary-color">Primary color</label>
          <input type="color" id="bitb-primary-color" value="#38bdf8" />
        </div>
        <div class="bitb-field">
          <label for="bitb-accent-color">Accent color</label>
          <input type="color" id="bitb-accent-color" value="#6366f1" />
        </div>
        <div class="bitb-field">
          <label for="bitb-position-select">Button position</label>
          <select id="bitb-position-select">
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
          </select>
        </div>
        <div class="bitb-field">
          <label for="bitb-assistant-name">Assistant name</label>
          <input type="text" id="bitb-assistant-name" value="BiTB Assistant" />
        </div>
        <div style="font-size:0.82rem; color:rgba(148,163,184,0.8); line-height:1.4;">
          Settings persist locally for this trial only. In production these values should be provisioned server-side.
        </div>
      </div>
    `;
    document.body.appendChild(settings);

    return { root, button, panel, messages, inputRegion, textarea: inputRegion.querySelector("#bitb-textarea"), sendBtn: inputRegion.querySelector("#bitb-send-button"), usage: inputRegion.querySelector("#bitb-usage"), muteBtn: header.querySelector("#bitb-mute-toggle"), settingsBtn: header.querySelector("#bitb-settings-toggle"), minimizeBtn: header.querySelector("#bitb-minimize"), closeBtn: header.querySelector("#bitb-close"), settingsPanel: settings };
  }

  function openWidget(elements) {
    if (STATE.widgetOpen) return;
    STATE.widgetOpen = true;
    STATE.focusRestoreEl = document.activeElement;
    elements.panel.classList.add("bitb-open");
    elements.button.setAttribute("aria-expanded", "true");
    lockBodyScroll(true);
    focusTrap(elements.panel, () => closeWidget(elements));
    Greeting.play();
  }

  function closeWidget(elements) {
    if (!STATE.widgetOpen) return;
    STATE.widgetOpen = false;
    elements.panel.classList.remove("bitb-open");
    elements.button.setAttribute("aria-expanded", "false");
    lockBodyScroll(false);
    if (STATE.focusRestoreEl && STATE.focusRestoreEl.focus) {
      STATE.focusRestoreEl.focus();
    }
  }

  function toggleSettings(elements, open) {
    STATE.settingsOpen = typeof open === "boolean" ? open : !STATE.settingsOpen;
    if (STATE.settingsOpen) {
      elements.settingsPanel.classList.add("bitb-open");
      elements.settingsPanel.setAttribute("aria-hidden", "false");
      lockBodyScroll(true);
      focusTrap(elements.settingsPanel, () => toggleSettings(elements, false));
    } else {
      elements.settingsPanel.classList.remove("bitb-open");
      elements.settingsPanel.setAttribute("aria-hidden", "true");
      lockBodyScroll(false);
      if (STATE.widgetOpen) {
        elements.panel.focus({ preventScroll: true });
      }
    }
  }

  function updateUsage(elements) {
    if (!STATE.trial || !STATE.trial.usage) {
      elements.usage.textContent = "";
      return;
    }
    const { queries_remaining } = STATE.trial.usage;
    elements.usage.textContent = typeof queries_remaining === "number" ? `${queries_remaining} responses left` : "";
  }

  async function handleSend(elements) {
    const value = elements.textarea.value.trim();
    if (!value) return;
    elements.textarea.value = "";
    elements.sendBtn.disabled = true;
    STATE.loading = true;

    appendMessage({ id: `user-${now()}`, role: "user", content: value, sources: [] }, elements);
    updateUsage(elements);

    const typing = document.createElement("div");
    typing.className = "bitb-bubble bitb-assistant bitb-visible";
    typing.textContent = "Thinking...";
    elements.messages.appendChild(typing);
    scrollMessages(elements.messages);

    try {
      const response = await askHybrid(value);
      typing.remove();
      appendMessage({ id: `assistant-${now()}`, role: "assistant", content: response.answer || "I am sorry, I could not find an answer.", sources: response.sources || [] }, elements);
    } catch (error) {
      typing.remove();
      appendMessage({ id: `assistant-${now()}`, role: "assistant", content: "I ran into an issue processing that request. Please try again shortly.", sources: [] }, elements);
    } finally {
      STATE.loading = false;
      elements.sendBtn.disabled = false;
      elements.textarea.focus();
      saveSession();
    }
  }

  function bindEvents(elements) {
    elements.button.addEventListener("mouseenter", () => Greeting.play());
    elements.button.addEventListener("click", () => {
      if (STATE.widgetOpen) {
        closeWidget(elements);
      } else {
        openWidget(elements);
      }
    });

    elements.closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeWidget(elements);
    });

    elements.minimizeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      STATE.minimized = !STATE.minimized;
      if (STATE.minimized) {
        elements.panel.style.height = "120px";
        elements.panel.querySelector("#bitb-messages").style.display = "none";
        elements.panel.querySelector("#bitb-input-region").style.display = "none";
      } else {
        elements.panel.style.height = "";
        elements.panel.querySelector("#bitb-messages").style.display = "flex";
        elements.panel.querySelector("#bitb-input-region").style.display = "flex";
      }
      saveSession();
    });

    elements.muteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMute(elements.muteBtn);
    });

    elements.settingsBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSettings(elements, true);
    });

    elements.settingsPanel.querySelector("#bitb-settings-close").addEventListener("click", () => toggleSettings(elements, false));

    elements.textarea.addEventListener("input", () => {
      elements.sendBtn.disabled = !elements.textarea.value.trim();
    });

    elements.textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!STATE.loading && elements.textarea.value.trim()) {
          handleSend(elements);
        }
      }
      if (event.key === "Escape") {
        closeWidget(elements);
      }
    });

    elements.sendBtn.addEventListener("click", () => {
      if (!STATE.loading && elements.textarea.value.trim()) {
        handleSend(elements);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && STATE.widgetOpen && !STATE.settingsOpen) {
        closeWidget(elements);
      }
    });

    const themeSelect = elements.settingsPanel.querySelector("#bitb-theme-select");
    themeSelect.value = CONFIG.theme;
    themeSelect.addEventListener("change", () => {
      document.documentElement.dataset.bitbTheme = themeSelect.value;
      toast(`Theme set to ${themeSelect.value}.`);
    });

    const positionSelect = elements.settingsPanel.querySelector("#bitb-position-select");
    positionSelect.value = CONFIG.position;
    positionSelect.addEventListener("change", () => {
      const value = positionSelect.value;
      const positionMap = {
        "bottom-right": { bottom: "24px", right: "24px", top: "", left: "" },
        "bottom-left": { bottom: "24px", left: "24px", top: "", right: "" },
        "top-right": { top: "24px", right: "24px", bottom: "", left: "" },
        "top-left": { top: "24px", left: "24px", bottom: "", right: "" },
      };
      const config = positionMap[value] || positionMap["bottom-right"];
      Object.assign(elements.root.style, config);
      toast("Widget position updated.");
    });
  }

  async function bootstrap() {
    loadSession();
    const elements = createRootElements();
    bindEvents(elements);

    if (STATE.messages.length === 0) {
      appendMessage(
        {
          id: "welcome",
          role: "assistant",
          content: "Namaste! I'm Rachel from BiTB. Ask me how the 3-day trial works, supported data sources, or how to embed the widget.",
          sources: [],
        },
        elements
      );
    } else {
      restoreMessages(elements);
      if (STATE.minimized) {
        elements.panel.style.height = "120px";
        elements.panel.querySelector("#bitb-messages").style.display = "none";
        elements.panel.querySelector("#bitb-input-region").style.display = "none";
      }
    }

    try {
      await checkTrial();
      updateUsage(elements);
      if (!STATE.trial.valid) {
        toast("Running in preview mode - trial token invalid or expired.");
      }
    } catch (error) {
      console.warn("[BiTB] bootstrap trial error", error);
    }

    ensurePreviewSeed();
  }

  bootstrap();
})();
/**
 * BiTB Embeddable Widget Script
 * Version: 2.0.0 - Fully Functional with RAG & Preview Mode
 * 
 * Features:
 * - Slide/expand animations after every bot response
 * - Persistent conversation with sessionStorage
 * - Preview mode with 10+ pre-seeded responses from bitb.ltd
 * - RAG retrieval with FAISS
 * - Voice greeting with mute toggle
 * - Full keyboard accessibility (ESC, Enter, Tab)
 * - ARIA-live announcements for screen readers
 * - Mobile-friendly responsive design
 */

(function() {
  'use strict';

  // =============================================================================
  // Configuration & Initialization
  // =============================================================================
  
  const script = document.currentScript;
  const config = {
    trialToken: script.getAttribute('data-trial-token') || 'preview',
    theme: script.getAttribute('data-theme') || 'auto',
    apiBaseUrl: script.getAttribute('data-api-url') || 'http://localhost:3000',
    position: script.getAttribute('data-position') || 'bottom-right',
    previewMode: script.getAttribute('data-preview') === 'true' || !script.getAttribute('data-trial-token'),
  };

  // Session & State Management with sessionStorage
  const SESSION_KEY = 'bitb_session_' + (config.trialToken === 'preview' ? 'preview' : config.trialToken);
  let trialData = null;
  let widgetOpen = false;
  let messages = [];
  let conversationDepth = 0;

  // =============================================================================
  // Session Persistence
  // =============================================================================
  
  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        messages: messages,
        conversationDepth: conversationDepth,
        lastActivity: Date.now()
      }));
    } catch (e) {
      console.warn('[BiTB] Failed to save session:', e);
    }
  }

  function loadSession() {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        messages = data.messages || [];
        conversationDepth = data.conversationDepth || 0;
        return true;
      }
    } catch (e) {
      console.warn('[BiTB] Failed to load session:', e);
    }
    return false;
  }

  // =============================================================================
  // Preview Mode - 10+ Pre-Seeded Responses from bitb.ltd
  // =============================================================================
  
  const PREVIEW_RESPONSES = [
    {
      query: "what is bits and bytes",
      answer: "Bits and Bytes Private Limited builds the BiTB retrieval augmented assistant platform for teams that want controlled automation. We help service, commerce, and enterprise operators turn their own knowledge into voice guided support with citations.",
      sources: [{ url: "https://bitb.ltd/", title: "Overview" }]
    },
    {
      query: "what services do you offer",
      answer: "We provide three subscriptions tailored to how you operate:\n\n- Service Desk for agencies that need lead routing and SOP ingestion.\n- Commerce Assist for ecommerce brands with catalog synced answers.\n- Enterprise Command for regulated teams with dedicated infrastructure.\n\nEvery plan includes the 72 hour trial workflow, origin locked embed, and female voice greeting.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Subscriptions" }]
    },
    {
      query: "how does the trial work",
      answer: "Each trial runs for 72 hours and includes 50 crawled pages or five uploads up to 10 MB each. You receive a token locked to your domain plus the embed snippet. We purge vectors automatically at expiry unless you promote the workspace.",
      sources: [{ url: "https://bitb.ltd/connect#trial", title: "Trial Workflow" }]
    },
    {
      query: "what is rag",
      answer: "Retrieval augmented generation means BiTB first retrieves chunks from your indexed content, then enriches the LLM prompt so responses cite your sources. The approach keeps answers on brand, reduces hallucinations, and supports compliance checks.",
      sources: [{ url: "https://bitb.ltd/documentation", title: "RAG Pipeline" }]
    },
    {
      query: "pricing plans",
      answer: "Pricing reflects our three subscription tiers:\n\n- Service Desk: $149 per month with 5k assisted responses and three active trials.\n- Commerce Assist: $249 per month with catalog sync, conversion analytics, and 10k responses.\n- Enterprise Command: Custom pricing with private ingestion worker, SSO, and SLAs.\n\nTalk with our team if you need tailored usage caps or specific LLM preferences.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Pricing" }]
    },
    {
      query: "how to install widget",
      answer: "Install BiTB in three steps:\n\n1. Complete the trial wizard and choose crawl or upload.\n2. Copy the script tag we email or surface in the dashboard, such as:\n```html\n<script src=\"https://bitb.ltd/bitb-widget.js\" data-trial-token=\"tr_demo\"></script>\n```\n3. Paste it before the closing </body> tag on your site and publish.\n\nThe widget activates instantly with voice greeting and analytics.",
      sources: [{ url: "https://bitb.ltd/documentation", title: "Embed Guide" }]
    },
    {
      query: "supported data sources",
      answer: "BiTB ingests service manuals, storefront data, and enterprise policies:\n\n- Crawl public URLs with depth controls and robots.txt respect.\n- Upload PDF, DOCX, TXT, or HTML files up to 10 MB.\n- Sync Shopify or custom APIs on Commerce Assist.\n- Enable SSO and SCIM on Enterprise Command for secure access.\n\nWe chunk content into 750 token windows and index it in FAISS for retrieval.",
      sources: [{ url: "https://bitb.ltd/documentation", title: "Ingestion" }]
    },
    {
      query: "multilingual support",
      answer: "BiTB detects input language and can respond in English, Hindi, or Hinglish today. We configure tone, translation rules, and greetings per language, and the voice greeting mirrors the selected locale when available.",
      sources: [{ url: "https://bitb.ltd/documentation", title: "Language Support" }]
    },
    {
      query: "voice greeting feature",
      answer: "Our default assistant uses a warm female Web Speech voice. The greeting plays on first hover, respects mute preferences, and shows a matching text bubble. You can supply custom scripts, disable audio, or upload alternate prompts per plan.",
      sources: [{ url: "https://bitb.ltd/documentation", title: "Voice Greeting" }]
    },
    {
      query: "data privacy and security",
      answer: "We isolate tenant data, encrypt uploads, and enforce origin allow lists. Trials auto purge after 72 hours. Enterprise Command can run inside your VPC, supports customer managed keys, and includes compliance reviews for SOC 2 and GDPR.",
      sources: [{ url: "https://bitb.ltd/subscription", title: "Security" }]
    },
    {
      query: "support and documentation",
      answer: "Documentation covers embed steps, ingestion APIs, and troubleshooting. Service Desk users get email support, Commerce Assist adds live chat, and Enterprise Command includes an account manager. Book onboarding any time from the Connect page.",
      sources: [{ url: "https://bitb.ltd/documentation", title: "Documentation" }, { url: "https://bitb.ltd/connect", title: "Connect" }]
    }
  ];

  // =============================================================================
  // Voice Greeting System
  // =============================================================================
  
  const VoiceGreeting = {
    text: "Namaste, I am your virtual assistant BitB. I am here to help you with a demo of our chatbot.",
    hasGreeted: false,
    isMuted: false,

    init() {
      this.hasGreeted = sessionStorage.getItem('bitb_greeted') === 'true';
      this.isMuted = localStorage.getItem('bitb_voice_muted') === 'true';
    },

    play() {
      if (this.hasGreeted || this.isMuted) return;

      this.showTextGreeting();

      if ('speechSynthesis' in window) {
        this.speakWithSynthesis();
      }

      sessionStorage.setItem('bitb_greeted', 'true');
      this.hasGreeted = true;
    },

    speakWithSynthesis() {
      const utterance = new SpeechSynthesisUtterance(this.text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.1;

      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
          v.name.includes('Female') || 
          v.name.includes('Samantha') ||
          v.name.includes('Google US English')
        );
        if (femaleVoice) utterance.voice = femaleVoice;
        window.speechSynthesis.speak(utterance);
      };

      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      } else {
        loadVoices();
      }
    },

    showTextGreeting() {
      const greetingDiv = document.createElement('div');
      greetingDiv.setAttribute('role', 'status');
      greetingDiv.setAttribute('aria-live', 'polite');
      greetingDiv.className = 'bitb-text-greeting';
      greetingDiv.textContent = this.text;
      document.body.appendChild(greetingDiv);

      setTimeout(() => greetingDiv.remove(), 5000);
    },

    toggleMute() {
      this.isMuted = !this.isMuted;
      localStorage.setItem('bitb_voice_muted', this.isMuted.toString());
      return this.isMuted;
    }
  };

  // =============================================================================
  // Smooth Scroll & Animations
  // =============================================================================
  
  function scrollToBottom() {
    const messagesDiv = document.getElementById('bitb-messages');
    if (messagesDiv) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          messagesDiv.scrollTo({
            top: messagesDiv.scrollHeight,
            behavior: 'smooth'
          });
        }, 40);
      });
    }
  }

  function slideOpenWidget() {
    const overlay = document.getElementById('bitb-chat-overlay');
    if (overlay && overlay.classList.contains('bitb-hidden')) {
      overlay.classList.remove('bitb-hidden');
      overlay.classList.add('bitb-open');
      widgetOpen = true;
      
      setTimeout(() => {
        const input = document.getElementById('bitb-input');
        if (input) input.focus();
      }, 300);
    }
  }

  function animateNewMessage(messageElement) {
    messageElement.classList.add('bitb-message-new');
    requestAnimationFrame(() => {
      setTimeout(() => {
        messageElement.classList.add('bitb-message-show');
      }, 10);
    });
  }

  // =============================================================================
  // Trial Validation
  // =============================================================================
  
  async function checkTrial() {
    if (config.previewMode) {
      trialData = {
        valid: true,
        days_remaining: 3,
        usage: { queries_remaining: 999 },
        preview: true
      };
      return trialData;
    }

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/check-trial?trial_token=${config.trialToken}&origin=${encodeURIComponent(window.location.origin)}`
      );

      if (!response.ok) throw new Error('Trial check failed');
      
      trialData = await response.json();
      return trialData;
    } catch (error) {
      console.error('[BiTB] Trial validation error:', error);
      return null;
    }
  }

  // =============================================================================
  // RAG Query Function with Preview Support
  // =============================================================================
  
  async function sendMessage(message) {
    conversationDepth++;
    
    // Preview mode - use local responses
    if (config.previewMode) {
      return await getPreviewResponse(message);
    }

    // Production mode - call API
    const trial = await checkTrial();
    if (!trial || !trial.valid) {
      showUpgradeCTA();
      return null;
    }

    try {
      // Include conversation history (last 10 messages for context)
      const history = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch(`${config.apiBaseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_token: config.trialToken,
          query: message,
          session_id: SESSION_KEY,
          history: history,
          origin: window.location.origin
        })
      });

      if (!response.ok) throw new Error('Query failed');
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[BiTB] Query error:', error);
      return {
        answer: 'Sorry, I encountered an error. Please try again.',
        sources: [],
        confidence: 0
      };
    }
  }

  async function getPreviewResponse(query) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));

    const lowerQuery = query.toLowerCase();
    
    // Find best matching preview response
    let bestMatch = PREVIEW_RESPONSES[0];
    let bestScore = 0;

    PREVIEW_RESPONSES.forEach(resp => {
      const keywords = resp.query.split(' ');
      let score = 0;
      keywords.forEach(keyword => {
        if (lowerQuery.includes(keyword)) score++;
      });
      if (score > bestScore) {
        bestScore = score;
        bestMatch = resp;
      }
    });

    // If no good match, provide helpful fallback
    if (bestScore === 0) {
      return {
        answer: `I can help you explore the BiTB platform from Bits and Bytes Private Limited. Try asking about:\n\n- Service Desk plan features\n- Commerce Assist for ecommerce teams\n- Enterprise Command security controls\n- 3 day trial setup and ingestion\n- Voice greeting or multilingual support\n- Data privacy, integrations, or pricing\n\nWhat would you like to learn?`,
        sources: [{ url: "https://bitb.ltd/", title: "BiTB Platform" }],
        confidence: 0.5
      };
    }

    return {
      answer: bestMatch.answer,
      sources: bestMatch.sources,
      confidence: 0.85
    };
  }

  // =============================================================================
  // UI Components
  // =============================================================================
  
  function createWidget() {
    injectStyles();

    // Floating button
    const button = document.createElement('button');
    button.id = 'bitb-widget-button';
    button.className = 'bitb-button';
    button.setAttribute('aria-label', 'Open BiTB Assistant');
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a10 10 0 0 1 7.07 17.07L12 12V2z"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
    `;

    button.addEventListener('mouseenter', () => VoiceGreeting.play());
    button.addEventListener('click', toggleChat);
    document.body.appendChild(button);

    // Chat overlay
    const chatOverlay = document.createElement('div');
    chatOverlay.id = 'bitb-chat-overlay';
    chatOverlay.className = 'bitb-panel bitb-hidden';
    chatOverlay.setAttribute('role', 'dialog');
    chatOverlay.setAttribute('aria-label', 'BiTB Chat Assistant');
    chatOverlay.innerHTML = `
      <div class="bitb-chat-header">
        <div class="bitb-chat-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 0 1 7.07 17.07L12 12V2z"/>
          </svg>
          <span>BiTB Assistant</span>
          ${config.previewMode ? '<span class="bitb-preview-badge">Preview Mode</span>' : ''}
        </div>
        <div class="bitb-chat-controls">
          <button id="bitb-mute-btn" class="bitb-control-btn" title="Toggle voice" aria-label="Toggle voice greeting">
            ${VoiceGreeting.isMuted ? '🔇' : '🔊'}
          </button>
          <button id="bitb-close-btn" class="bitb-control-btn" title="Close (ESC)" aria-label="Close chat">
            ✕
          </button>
        </div>
      </div>
      <div class="bitb-messages" id="bitb-messages" aria-live="polite" aria-atomic="false">
        <div class="bitb-message bitb-assistant-message">
          <div class="bitb-message-content">
            Namaste! I'm your BiTB virtual assistant. ${config.previewMode ? 'This is a preview with 10+ pre-loaded responses about Bits and Bytes Private Limited.' : 'How can I help you today?'}
          </div>
        </div>
      </div>
      <div class="bitb-trial-status" id="bitb-trial-status"></div>
      <div class="bitb-input-area">
        <input type="text" id="bitb-input" placeholder="Ask a question..." aria-label="Type your message" />
        <button id="bitb-send-btn" aria-label="Send message">Send</button>
      </div>
      <div id="bitb-sr-announcer" class="bitb-sr-only" aria-live="polite" aria-atomic="true"></div>
    `;

    document.body.appendChild(chatOverlay);

    // Event listeners
    document.getElementById('bitb-close-btn').addEventListener('click', toggleChat);
    document.getElementById('bitb-send-btn').addEventListener('click', handleSendMessage);
    
    const input = document.getElementById('bitb-input');
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSendMessage();
    });

    document.getElementById('bitb-mute-btn').addEventListener('click', () => {
      const isMuted = VoiceGreeting.toggleMute();
      document.getElementById('bitb-mute-btn').textContent = isMuted ? '🔇' : '🔊';
      document.getElementById('bitb-mute-btn').setAttribute('aria-label', isMuted ? 'Unmute voice' : 'Mute voice');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && widgetOpen) {
        toggleChat();
      }
    });

    // Load existing session
    const hasSession = loadSession();
    if (hasSession && messages.length > 0) {
      renderExistingMessages();
    }

    // Initialize trial status
    checkTrial().then(() => updateTrialStatus());
  }

  function renderExistingMessages() {
    const messagesDiv = document.getElementById('bitb-messages');
    messagesDiv.innerHTML = ''; // Clear welcome message
    
    messages.forEach(msg => {
      addMessage(msg.role, msg.content, null, msg.sources, false);
    });
    
    scrollToBottom();
  }

  function toggleChat() {
    widgetOpen = !widgetOpen;
    const overlay = document.getElementById('bitb-chat-overlay');
    const button = document.getElementById('bitb-widget-button');
    
    if (widgetOpen) {
      overlay.classList.remove('bitb-hidden');
      overlay.classList.add('bitb-open');
      button.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        document.getElementById('bitb-input').focus();
      }, 300);
      updateTrialStatus();
    } else {
      overlay.classList.remove('bitb-open');
      overlay.classList.add('bitb-hidden');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  async function handleSendMessage() {
    const input = document.getElementById('bitb-input');
    const message = input.value.trim();
    if (!message) return;

    // Add user message
    const userMsg = { role: 'user', content: message, timestamp: Date.now() };
    messages.push(userMsg);
    addMessage('user', message);
    input.value = '';

    // Show loading
    const loadingId = 'loading-' + Date.now();
    addMessage('assistant', '...', loadingId);

    // Get response
    const response = await sendMessage(message);

    // Remove loading
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    // Add assistant response
    if (response) {
      const assistantMsg = {
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        timestamp: Date.now()
      };
      messages.push(assistantMsg);
      
      const msgElement = addMessage('assistant', response.answer, null, response.sources, true);
      
      // Slide open if closed + announce
      if (!widgetOpen) {
        slideOpenWidget();
      }
      
      // Announce to screen readers
      announceToScreenReader(response.answer);
      
      // Save session
      saveSession();
      updateTrialStatus();
    }
  }

  function addMessage(role, content, id = null, sources = null, animate = true) {
    const messagesDiv = document.getElementById('bitb-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `bitb-message bitb-${role}-message`;
    if (id) messageDiv.id = id;

    let html = `<div class="bitb-message-content">${escapeHtml(content)}</div>`;

    if (sources && sources.length > 0) {
      html += '<div class="bitb-sources"><strong>Sources:</strong><ul>';
      sources.forEach(src => {
        html += `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title || src.url)}</a></li>`;
      });
      html += '</ul></div>';
    }

    messageDiv.innerHTML = html;
    messagesDiv.appendChild(messageDiv);
    
    if (animate) {
      animateNewMessage(messageDiv);
    }
    
    scrollToBottom();
    
    return messageDiv;
  }

  function announceToScreenReader(text) {
    const announcer = document.getElementById('bitb-sr-announcer');
    if (announcer) {
      announcer.textContent = 'Assistant says: ' + text.substring(0, 150);
    }
  }

  function updateTrialStatus() {
    if (!trialData) return;

    const statusDiv = document.getElementById('bitb-trial-status');
    if (config.previewMode) {
      statusDiv.innerHTML = `
        <span class="bitb-trial-info">
          Preview Mode | Responses: ${conversationDepth} | Start your trial at <a href="https://bitb.ltd" target="_blank">bitb.ltd</a>
        </span>
      `;
    } else if (trialData.valid) {
      statusDiv.innerHTML = `
        <span class="bitb-trial-info">
          Trial: ${trialData.days_remaining} days remaining | 
          Queries: ${trialData.usage.queries_remaining} left
        </span>
      `;
    } else {
      statusDiv.innerHTML = `
        <span class="bitb-trial-expired">
          Trial expired - <a href="https://bitb.ltd/subscription" target="_blank">Upgrade Now</a>
        </span>
      `;
      document.getElementById('bitb-input').disabled = true;
    }
  }

  function showUpgradeCTA() {
    const messagesDiv = document.getElementById('bitb-messages');
    const ctaDiv = document.createElement('div');
    ctaDiv.className = 'bitb-upgrade-cta';
    ctaDiv.innerHTML = `
      <div class="bitb-cta-content">
        <h4>Trial Expired</h4>
        <p>Your free trial has ended. Upgrade to continue using BiTB.</p>
  <a href="https://bitb.ltd/subscription" target="_blank" class="bitb-cta-button">
          Upgrade Now
        </a>
      </div>
    `;
    messagesDiv.appendChild(ctaDiv);
  }

  // =============================================================================
  // Styles Injection with Smooth Animations
  // =============================================================================
  
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* BiTB Widget Styles with Smooth Animations */
      .bitb-button {
        position: fixed;
        ${config.position.includes('bottom') ? 'bottom: 24px;' : 'top: 24px;'}
        ${config.position.includes('right') ? 'right: 24px;' : 'left: 24px;'}
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #3b82f6;
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
        z-index: 10000;
      }
      .bitb-button:hover {
        transform: scale(1.1);
      }
      .bitb-button:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }

      /* Smooth slide animation for panel */
      .bitb-panel {
        position: fixed;
        ${config.position.includes('bottom') ? 'bottom: 92px;' : 'top: 92px;'}
        ${config.position.includes('right') ? 'right: 24px;' : 'left: 24px;'}
        width: 384px;
        max-width: calc(100vw - 48px);
        height: 500px;
        max-height: calc(100vh - 140px);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        display: flex;
        flex-direction: column;
        z-index: 10000;
        transform-origin: ${config.position.includes('right') ? 'bottom right' : 'bottom left'};
        transform: translateY(12px) scaleY(0.98);
        opacity: 0;
        transition: transform 0.28s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.2s ease;
      }
      .bitb-panel.bitb-open {
        transform: translateY(0) scaleY(1);
        opacity: 1;
      }
      .bitb-panel.bitb-hidden {
        display: none;
      }

      /* Message slide-in animation */
      .bitb-message-new {
        transform: translateY(8px);
        opacity: 0;
        transition: transform 0.18s ease, opacity 0.16s ease;
      }
      .bitb-message-new.bitb-message-show {
        transform: translateY(0);
        opacity: 1;
      }

      /* Text greeting animation */
      .bitb-text-greeting {
        position: fixed;
        ${config.position.includes('bottom') ? 'bottom: 100px;' : 'top: 100px;'}
        ${config.position.includes('right') ? 'right: 24px;' : 'left: 24px;'}
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 300px;
        z-index: 9999;
        animation: slideInFade 0.3s ease-out;
      }

      @keyframes slideInFade {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .bitb-chat-header {
        padding: 16px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: white;
      }
      .bitb-chat-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: #111827;
      }
      .bitb-preview-badge {
        display: inline-block;
        padding: 2px 8px;
        background: #fef3c7;
        color: #92400e;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        margin-left: 8px;
      }
      .bitb-chat-controls {
        display: flex;
        gap: 8px;
      }
      .bitb-control-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.2s;
        font-size: 16px;
      }
      .bitb-control-btn:hover {
        background: #f3f4f6;
      }
      .bitb-control-btn:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 1px;
      }

      .bitb-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f9fafb;
        scroll-behavior: smooth;
      }
      .bitb-message {
        display: flex;
        max-width: 80%;
      }
      .bitb-user-message {
        align-self: flex-end;
      }
      .bitb-user-message .bitb-message-content {
        background: #3b82f6;
        color: white;
      }
      .bitb-assistant-message {
        align-self: flex-start;
      }
      .bitb-assistant-message .bitb-message-content {
        background: white;
        color: #111827;
        border: 1px solid #e5e7eb;
      }
      .bitb-message-content {
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .bitb-sources {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(0,0,0,0.1);
        font-size: 11px;
        opacity: 0.9;
      }
      .bitb-sources ul {
        margin: 4px 0 0 0;
        padding-left: 16px;
      }
      .bitb-sources li {
        margin: 2px 0;
      }
      .bitb-sources a {
        color: #2563eb;
        text-decoration: none;
      }
      .bitb-sources a:hover {
        text-decoration: underline;
      }

      .bitb-trial-status {
        padding: 8px 16px;
        background: #fef3c7;
        border-top: 1px solid #e5e7eb;
        font-size: 12px;
        text-align: center;
      }
      .bitb-trial-info {
        color: #78350f;
      }
      .bitb-trial-info a {
        color: #2563eb;
        text-decoration: underline;
      }
      .bitb-trial-expired {
        color: #dc2626;
        font-weight: 600;
      }
      .bitb-trial-expired a {
        color: #2563eb;
        text-decoration: underline;
      }

      .bitb-input-area {
        padding: 16px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
        background: white;
      }
      .bitb-input-area input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        font-family: inherit;
      }
      .bitb-input-area input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
      }
      .bitb-input-area button {
        padding: 10px 16px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .bitb-input-area button:hover {
        background: #2563eb;
      }
      .bitb-input-area button:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }

      .bitb-upgrade-cta {
        padding: 16px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        text-align: center;
        margin: 8px 0;
      }
      .bitb-cta-content h4 {
        margin: 0 0 8px 0;
        color: #dc2626;
        font-size: 16px;
      }
      .bitb-cta-content p {
        margin: 0 0 12px 0;
        color: #991b1b;
        font-size: 14px;
      }
      .bitb-cta-button {
        display: inline-block;
        padding: 8px 16px;
        background: #dc2626;
        color: white;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 500;
        transition: background 0.2s;
      }
      .bitb-cta-button:hover {
        background: #b91c1c;
      }

      /* Screen reader only */
      .bitb-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }

      /* Mobile responsive */
      @media (max-width: 640px) {
        .bitb-panel {
          width: calc(100vw - 16px);
          height: calc(100vh - 100px);
          right: 8px !important;
          left: 8px !important;
          bottom: 80px !important;
        }
        .bitb-message {
          max-width: 90%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // =============================================================================
  // Utilities
  // =============================================================================
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // =============================================================================
  // Initialization
  // =============================================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    VoiceGreeting.init();
    await checkTrial();
    createWidget();
    console.log('[BiTB] Widget v2.0.0 initialized -', config.previewMode ? 'Preview Mode' : 'Production Mode');
  }

})();