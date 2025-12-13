"use client";

import Header from '@/components/Header';
import { Code, FileText, Layers3, PackageCheck, Workflow, Zap, Shield, Sparkles, ArrowRight, Copy, Check, BookOpen, Terminal, Rocket, ChevronRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";

// Animated counter hook
function useCountUp(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [started, target, duration]);

  return { count, ref };
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-300 group"
      title="Copy code"
    >
      {copied ? (
        <Check className="w-4 h-4 text-emerald-400" />
      ) : (
        <Copy className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
      )}
    </button>
  );
}

// Animated section wrapper
function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
    >
      {children}
    </div>
  );
}

const guides = [
  {
    title: "Widget Embed",
    subtitle: "Go live in 60 seconds",
    icon: Code,
    color: "from-blue-500/20 to-cyan-500/20",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    steps: [
      "Copy the script tag generated during the trial flow.",
      "Paste it before your site's closing </body> tag.",
      "Visit your site - the BiTB bubble appears bottom-right by default.",
      "Use data attributes like data-theme, data-position, and data-api-url for advanced control.",
    ],
    snippet: `<script src="https://bitb.ltd/bitb-widget.js"
  data-trial-token="tr_xxx"
  data-theme="dark"
  data-api-url="https://api.bitb.ltd">
</script>`,
  },
  {
    title: "Query API",
    subtitle: "Ask anything, get grounded answers",
    icon: Workflow,
    color: "from-purple-500/20 to-pink-500/20",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
    steps: [
      "Send the current user question and optional history to the ask endpoint.",
      "The server normalizes history, performs retrieval, then streams a grounded answer.",
      "Responses include sources, confidence, and remaining query credits.",
    ],
    snippet: `curl -X POST https://bitb.ltd/api/ask \\
  -H "Content-Type: application/json" \\
  -d '{
    "trial_token": "tr_demo",
    "query": "What industries do you support?",
    "session_id": "sess_123"
  }'`,
  },
  {
    title: "Ingestion Pipeline",
    subtitle: "Feed your knowledge base",
    icon: Layers3,
    color: "from-emerald-500/20 to-teal-500/20",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-400",
    steps: [
      "Call /api/start-trial with your origin, admin email, and theme preferences.",
      "We respond with a trial token, embed code, and ingestion job id.",
      "Upload files or trigger a crawl via /api/ingest with multipart/form-data.",
      "Poll /api/ingest/status/:jobId for completion.",
    ],
    snippet: `fetch('/api/start-trial', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site_origin: 'https://example.com',
    admin_email: 'ops@example.com',
    data_source: { 
      type: 'url', 
      url: 'https://example.com', 
      crawl_depth: 2 
    }
  })
});`,
  },
];

const stats = [
  { label: "Response Time", value: 150, suffix: "ms", icon: Zap },
  { label: "Uptime SLA", value: 99.9, suffix: "%", icon: Shield },
  { label: "Happy Teams", value: 500, suffix: "+", icon: Sparkles },
];

const features = [
  {
    icon: Terminal,
    title: "Developer First",
    description: "Clean APIs, typed responses, and comprehensive error handling. Built by developers, for developers.",
  },
  {
    icon: Rocket,
    title: "Ship Fast",
    description: "From zero to production in minutes. No complex setup, no DevOps headaches.",
  },
  {
    icon: BookOpen,
    title: "Well Documented",
    description: "Every endpoint, parameter, and edge case covered. Copy-paste examples that just work.",
  },
];

const workerNotes = [
  { text: 'Python 3.9+, sentence-transformers, FAISS, BeautifulSoup4, and tiktoken required.', icon: PackageCheck },
  { text: 'Workers poll the Next.js API for new ingestion jobs and report status updates back.', icon: Workflow },
  { text: 'Chunker splits content to ~750 tokens with semantic overlap to maximise retrieval quality.', icon: Layers3 },
  { text: 'Expired trials trigger purge jobs that delete vectors and cached completions.', icon: Shield },
];

const quickLinks = [
  { label: "Widget Embed", href: "#widget-embed" },
  { label: "Query API", href: "#query-api" },
  { label: "Ingestion", href: "#ingestion-pipeline" },
  { label: "Worker Setup", href: "#worker" },
];

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll("section[id]");
      let current = "";
      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 150) {
          current = section.id;
        }
      });
      setActiveSection(current);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <Header />
      <div className="min-h-screen bg-black pt-20">
        {/* Hero Section */}
        <AnimatedSection>
          <section className="relative overflow-hidden px-6 py-24 lg:py-32">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-3xl pointer-events-none" />
            
            <div className="relative max-w-6xl mx-auto">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
                <div className="space-y-6 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white/60">
                    <BookOpen className="w-4 h-4" />
                    <span>Documentation</span>
                    <span className="w-1 h-1 rounded-full bg-white/40" />
                    <span className="text-emerald-400">v2.0</span>
                  </div>
                  
                  <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                    Build intelligent
                    <span className="block bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                      AI assistants
                    </span>
                    with confidence.
                  </h1>
                  
                  <p className="text-lg text-white/60 leading-relaxed">
                    Everything you need to embed, configure, and ship production-ready AI assistants. 
                    Clear guides, working code, and patterns that scale.
                  </p>
                  
                  <div className="flex flex-wrap gap-4 pt-4">
                    <a
                      href="#widget-embed"
                      className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-white/90 transition-all duration-300"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </a>
                    <a
                      href="#query-api"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-medium text-sm hover:bg-white/20 transition-all duration-300 border border-white/10"
                    >
                      View API Reference
                    </a>
                  </div>
                </div>
                
                {/* Quick Links Card */}
                <div className="lg:w-80 rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Quick Navigation
                  </h3>
                  <ul className="space-y-2">
                    {quickLinks.map((link) => (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-300 group ${
                            activeSection === link.href.slice(1)
                              ? "bg-white/10 text-white"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* Stats Section */}
        <AnimatedSection delay={100}>
          <section className="px-6 py-16 border-y border-white/10">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {stats.map((stat, i) => {
                  const { count, ref } = useCountUp(stat.value);
                  return (
                    <div
                      key={stat.label}
                      ref={ref}
                      className="text-center p-8 rounded-2xl bg-gradient-to-b from-white/5 to-transparent border border-white/10 hover:border-white/20 transition-all duration-500 group"
                    >
                      <stat.icon className="w-8 h-8 mx-auto mb-4 text-white/40 group-hover:text-white/60 transition-colors" />
                      <div className="text-4xl font-bold text-white mb-2">
                        {stat.value % 1 !== 0 ? count.toFixed(1) : count}
                        <span className="text-white/40">{stat.suffix}</span>
                      </div>
                      <div className="text-sm text-white/60">{stat.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* Features Grid */}
        <AnimatedSection delay={200}>
          <section className="px-6 py-20">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-white mb-4">Why developers love our docs</h2>
                <p className="text-white/60 max-w-2xl mx-auto">
                  We obsess over developer experience. Every example is tested, every edge case is covered.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {features.map((feature, i) => (
                  <div
                    key={feature.title}
                    className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-500"
                  >
                    <feature.icon className="w-10 h-10 text-white/40 group-hover:text-white/60 transition-colors mb-6" />
                    <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-sm text-white/60 leading-relaxed">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* Guides Section */}
        <section className="px-6 py-20">
          <div className="max-w-6xl mx-auto space-y-12">
            <AnimatedSection>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-white mb-4">Integration Guides</h2>
                <p className="text-white/60 max-w-2xl mx-auto">
                  Step-by-step instructions with copy-paste code. Ship in minutes, not days.
                </p>
              </div>
            </AnimatedSection>

            {guides.map((guide, index) => (
              <AnimatedSection key={guide.title} delay={index * 100}>
                <section
                  id={guide.title.toLowerCase().replace(/\s+/g, '-')}
                  className={`rounded-3xl border ${guide.borderColor} bg-gradient-to-br ${guide.color} p-8 lg:p-10 hover:shadow-2xl hover:shadow-white/5 transition-all duration-500`}
                >
                  <div className="flex flex-col lg:flex-row gap-10">
                    {/* Left: Info */}
                    <div className="lg:w-2/5 space-y-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center ${guide.iconColor}`}>
                          <guide.icon className="w-7 h-7" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-white">{guide.title}</h2>
                          <p className="text-sm text-white/60">{guide.subtitle}</p>
                        </div>
                      </div>
                      
                      <ul className="space-y-4">
                        {guide.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-4 group">
                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-white/80 group-hover:bg-white/20 transition-colors">
                              {i + 1}
                            </span>
                            <span className="text-sm text-white/70 leading-relaxed pt-1">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    {/* Right: Code */}
                    <div className="lg:flex-1 relative">
                      <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black/40 to-transparent rounded-t-2xl flex items-center px-4 gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/60" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                        <div className="w-3 h-3 rounded-full bg-green-500/60" />
                        <span className="text-xs text-white/40 ml-2 font-mono">code</span>
                      </div>
                      <div className="rounded-2xl bg-black/60 border border-white/10 p-6 pt-12 font-mono text-sm text-white/80 overflow-x-auto">
                        <CopyButton text={guide.snippet} />
                        <pre className="whitespace-pre-wrap leading-relaxed">{guide.snippet}</pre>
                      </div>
                    </div>
                  </div>
                </section>
              </AnimatedSection>
            ))}
          </div>
        </section>

        {/* Worker Section */}
        <AnimatedSection delay={100}>
          <section id="worker" className="px-6 py-20">
            <div className="max-w-6xl mx-auto">
              <div className="rounded-3xl border border-dashed border-white/20 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-10 lg:p-12">
                <div className="flex flex-col lg:flex-row gap-12">
                  <div className="lg:w-3/5 space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs text-amber-300">
                      <Terminal className="w-3 h-3" />
                      Python Worker
                    </div>
                    
                    <h2 className="text-4xl font-bold text-white leading-tight">
                      Keep your knowledge base
                      <span className="text-amber-400"> fresh & fast.</span>
                    </h2>
                    
                    <p className="text-white/60 text-lg leading-relaxed">
                      A lightweight Python worker polls jobs, processes crawls, persists vectors, and calls back when ready. 
                      Use the provided requirements.txt or swap in your own infrastructure.
                    </p>
                    
                    <ul className="space-y-4 pt-4">
                      {workerNotes.map((note, i) => (
                        <li key={i} className="flex items-start gap-4 group">
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                            <note.icon className="w-5 h-5 text-amber-400" />
                          </div>
                          <span className="text-sm text-white/70 leading-relaxed pt-2">{note.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="lg:w-2/5 flex items-center">
                    <div className="w-full rounded-2xl bg-black/40 border border-white/10 p-6">
                      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">REQUIREMENTS.md</p>
                          <p className="text-xs text-white/40">Architecture & checklist</p>
                        </div>
                      </div>
                      <p className="text-sm text-white/60 mb-4">
                        Full architecture overview, security posture, and onboarding checklist included in the repo.
                      </p>
                      <p className="text-xs text-white/40 flex items-center gap-2">
                        <Sparkles className="w-3 h-3" />
                        Need more? Email docs@bitb.ai for tailored playbooks.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* CTA Section */}
        <AnimatedSection delay={100}>
          <section className="px-6 py-24">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold text-white mb-6">
                Ready to build something amazing?
              </h2>
              <p className="text-lg text-white/60 mb-10 max-w-2xl mx-auto">
                Start your free trial today. No credit card required. 
                Go from zero to production-ready AI assistant in minutes.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="/#trial"
                  className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all duration-300"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <a
                  href="/connect"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-all duration-300 border border-white/10"
                >
                  Talk to Sales
                </a>
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* Footer spacer */}
        <div className="h-20" />
      </div>
    </>
  );
}
