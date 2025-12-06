"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, BrainCircuit, CircuitBoard, Headphones, LineChart, Lock, MessageCircle, ServerCog, ShieldCheck, LogIn, UserPlus, FileText, Briefcase, Phone } from "lucide-react";

import dynamic from "next/dynamic";
import BusinessApplicationsSection from "./BusinessApplicationsSection";

const TrialOnboardingWizardGSAP = dynamic(() => import("@/components/trial/TrialOnboardingWizardGSAP"), { ssr: false });

const featureCards = [
  {
    title: "Embed in minutes",
    description: "Drop-in widget script with origin locking, theme controls, and voice greeting support.",
    icon: MessageCircle,
  },
  {
    title: "Own your vectors",
    description: "Local FAISS store powered by free sentence-transformer embeddings. No managed lock-in.",
    icon: ServerCog,
  },
  {
    title: "Trial safe",
    description: "3-day previews auto-purge content and throttle usage without touching production data.",
    icon: ShieldCheck,
  },
  {
    title: "Service-first",
    description: "Designed for agencies, studios, and support teams that need on-brand answers, every time.",
    icon: Headphones,
  },
];

const pipelineSteps = [
  {
    id: "01",
    title: "Ingest",
    blurb: "Crawl your public website or upload PDFs, DOCX, TXT, and HTML. Files stay encrypted at rest.",
    detail: "BiTB normalizes structure, strips boilerplate, and chunks into retrieval-ready passages.",
  },
  {
    id: "02",
    title: "Embed",
    blurb: "Run local MiniLM embeddings or swap to Hugging Face / OpenAI. No GPU required.",
    detail: "Embeddings land in FAISS with cosine ranking, cached per trial token for instant recall.",
  },
  {
    id: "03",
    title: "Answer",
    blurb: "LangChain orchestrates retrieval + synthesis with guardrails for relevance and tone.",
    detail: "We provide out-of-the-box prompt templates tuned for service and support workflows.",
  },
];

const metrics = [
  { label: "3 day", sub: "hands-on free trial", emphasis: "free" },
  { label: "5 min", sub: "average ingest time for 30 pages", emphasis: "fast" },
  { label: "100%", sub: "sessions tracked via origin-locked tokens", emphasis: "secure" },
];

const productPlans = [
  {
    name: "Service Desk",
    audience: "For service businesses",
    description: "Ingest proposals, SOPs, and onboarding guides so leads get precise answers and can book time instantly.",
    bullets: ["Lead routing into Calendly or HubSpot", "5k monthly responses with smart limits", "Voice greeting tuned for consultations"],
  },
  {
    name: "Commerce Assist",
    audience: "For ecommerce brands",
    description: "Sync product catalogs, sizing charts, and policies to reduce returns while lifting conversion at checkout.",
    bullets: ["Shopify or headless API integration", "Dynamic bundle and promo suggestions", "Conversion and return analytics"],
  },
  {
    name: "Enterprise Command",
    audience: "For compliance-heavy teams",
    description: "Deploy on dedicated infrastructure with SSO, SCIM, and custom LLM endpoints plus 24x7 SLAs.",
    bullets: ["Private FAISS clusters or VPC deployment", "Automated PII redaction and audit logs", "Custom retention schedules and support"],
  },
];

export default function HomePage() {
  const reduceMotion = useReducedMotion();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [mountIframe, setMountIframe] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;

    const rafId = requestAnimationFrame(() => {
      setMountIframe(true);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [reduceMotion]);

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/80 p-6 md:p-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_70%)]" aria-hidden="true" />
        
        <div className="relative mx-auto w-full max-w-7xl flex gap-6 items-start">
          {/* Spline Container */}
          <div className="relative w-full flex-1">
            <div className="relative h-[90vh] max-h-[90vh] w-full overflow-hidden rounded-3xl border border-white/10 bg-black/70 shadow-[0_0_160px_-50px_rgba(255,255,255,0.9)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_65%)]" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-black via-black/70 to-transparent" aria-hidden="true" />
              {mountIframe && !reduceMotion ? (
                <iframe
                  title="BiTB Retrofuturism Animation"
                  src="https://my.spline.design/retrofuturismbganimation-VWD1dy9Y8KXFP8MjHSBuiHNK/?low=1"
                  loading="lazy"
                  frameBorder="0"
                  allow="autoplay; fullscreen; xr-spatial-tracking"
                  onLoad={() => setIframeLoaded(true)}
                  className={`relative z-10 h-full w-full origin-center transition-opacity duration-700 ease-out [backface-visibility:hidden] [transform:scale(1.45)_translateY(-3%)] [transform-origin:center] ${iframeLoaded ? "opacity-100" : "opacity-0"}`}
                />
              ) : (
                <div className="relative z-10 flex h-full w-full items-center justify-center bg-black/60 text-xs uppercase tracking-[0.4em] text-white/30">
                  Spline preview disabled
                </div>
              )}
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 h-32 bg-gradient-to-t from-black via-black/90 to-transparent" aria-hidden="true" />
            </div>
          </div>

          {/* Vertical Navigation Menu - Right Side (No Background) */}
          <nav className="hidden lg:flex flex-col gap-6 pt-32 min-w-[200px]">
            {/* Account Actions */}
            <div className="flex flex-col gap-4 pb-6 border-b border-white/20">
              <Link
                href="/login"
                className="text-center text-white/70 transition hover:text-white text-lg font-medium"
                title="Login"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="text-center text-white transition hover:text-white/80 text-lg font-semibold"
                title="Sign Up"
              >
                Sign Up
              </Link>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-col gap-5">
              <Link
                href="/case-studies"
                className="text-center text-white/60 transition hover:text-white text-base font-medium"
                title="Case Studies"
              >
                Case Studies
              </Link>
              <Link
                href="/subscriptions"
                className="text-center text-white/60 transition hover:text-white text-base font-medium"
                title="Subscriptions"
              >
                Subscriptions
              </Link>
              <Link
                href="/documentation"
                className="text-center text-white/60 transition hover:text-white text-base font-medium"
                title="Documentation"
              >
                Documentation
              </Link>
              <Link
                href="/company"
                className="text-center text-white/60 transition hover:text-white text-base font-medium"
                title="Company"
              >
                Company
              </Link>
              <Link
                href="/connect"
                className="text-center text-white/60 transition hover:text-white text-base font-medium"
                title="Connect"
              >
                Connect
              </Link>
            </div>
          </nav>
        </div>
      </section>

        {/* GSAP-powered Interactive Tenant Onboarding Wizard for 3-Day Trial */}
        <div className="my-16">
          <TrialOnboardingWizardGSAP />
        </div>

        {/* Business Applications Section (Third Section) */}
        <section className="my-16">
          <BusinessApplicationsSection />
        </section>
      <section className="rounded-3xl border border-white/10 bg-black/70 p-8 md:p-12 shadow-[0_0_140px_-45px_rgba(255,255,255,0.65)] backdrop-blur">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-6">
            <span className="w-fit rounded-full border border-white/20 bg-black/60 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/60">
              Built on retrieval augmented generation
            </span>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Dark-mode SaaS marketing site with a production-ready BiTB RAG chatbot widget.
            </h1>
            <p className="text-lg text-white/70 md:text-xl">
              Launch a voice-enabled assistant that knows your services, pricing, and processes. Free trial spins up in minutes, powered by LangChain, FAISS, and cost-efficient LLMs.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/connect#trial"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Try the widget <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/documentation"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
              >
                Read docs
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/60 p-6 shadow-[0_0_120px_-40px_rgba(255,255,255,0.8)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <BrainCircuit className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-white/50">Trial control</p>
                <p className="text-lg font-semibold text-white">Session snapshot</p>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm text-white/70">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.4em] text-white/40">Token</p>
                <p className="mt-1 font-mono text-sm text-white">tr_demo_superco</p>
                <p className="mt-2 text-xs text-white/50">Expires in 3 days · 100 query credits remaining</p>
              </div>
              <p>
                Origin lock, quota tracking, and auto-purge guardrails protect your PII. The widget opens with a voice greeting and stays invisible to unauthorized domains.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  <span>Origin validation + rate limiting baked in</span>
                </li>
                <li className="flex items-center gap-2">
                  <CircuitBoard className="h-4 w-4 text-sky-400" />
                  <span>Hybrid context: structured snippets + vector search</span>
                </li>
                <li className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-indigo-400" />
                  <span>Session analytics ready for downstream BI</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

    <section className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-white/10 bg-black/50 px-6 py-8 text-center"
          >
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">{metric.emphasis}</p>
            <p className="mt-2 text-4xl font-semibold text-white">{metric.label}</p>
            <p className="mt-2 text-sm text-white/60">{metric.sub}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {featureCards.map((card) => (
          <div
            key={card.title}
            className="group rounded-2xl border border-white/10 bg-black/60 p-6 transition hover:border-white/30 hover:bg-white/5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
              <card.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-white">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{card.description}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {productPlans.map((plan) => (
          <div key={plan.name} className="rounded-2xl border border-white/10 bg-white/5 px-6 pt-6 pb-4">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">{plan.audience}</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{plan.name}</h3>
            <p className="mt-2 text-sm text-white/70">{plan.description}</p>
            <ul className="mt-3 space-y-2 text-xs text-white/60">
              {plan.bullets.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-[2px] text-white/40">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/60 p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="lg:max-w-sm">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Pipeline</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Retrieval-first architecture tuned for service businesses.</h2>
            <p className="mt-3 text-sm text-white/70">
              Every trial spins up an isolated knowledge base with job tracking, ingestion metrics, and cache warming. No production interference, no surprise invoices.
            </p>
          </div>
          <div className="flex-1 space-y-6">
            {pipelineSteps.map((step) => (
              <div key={step.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between text-white/50">
                  <span className="text-xs font-semibold uppercase tracking-[0.4em]">{step.id}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-white/70">{step.blurb}</p>
                <p className="mt-3 text-xs text-white/50">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-white/20 bg-black/30 p-8 text-sm text-white/70">
        <h2 className="text-2xl font-semibold text-white">How the free trial works</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/50 p-6">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Step 1</p>
            <h3 className="mt-3 text-lg font-semibold text-white">Generate your token</h3>
            <p className="mt-2">Run the wizard on the Connect page. We issue a trial token scoped to your origin with 100 query credits.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/50 p-6">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Step 2</p>
            <h3 className="mt-3 text-lg font-semibold text-white">Ingest your data</h3>
            <p className="mt-2">Upload docs or crawl up to 50 pages. Monitor ingestion status in real time while we build your vector store.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/50 p-6">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Step 3</p>
            <h3 className="mt-3 text-lg font-semibold text-white">Embed the widget</h3>
            <p className="mt-2">Copy the script tag into your site footer. The assistant greets visitors with a human voice and stays on-brand.</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-10 text-center shadow-[0_0_140px_-40px_rgba(255,255,255,0.7)]">
        <h2 className="text-3xl font-semibold text-white">See Real Results from Real Businesses</h2>
        <p className="mt-4 text-lg text-white/70">
          500+ businesses across India are delivering user ecstasy with BitB AI chatbots.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/case-studies"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            View case studies <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/subscriptions"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
          >
            See pricing
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Link
          href="/company"
          className="group rounded-3xl border border-white/10 bg-black/60 p-8 transition hover:border-white/30 hover:bg-white/5"
        >
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">Company</p>
          <h3 className="mt-3 text-2xl font-semibold text-white group-hover:underline">
            Built in India. Scaling globally.
          </h3>
          <p className="mt-3 text-sm text-white/70">
            Learn about our mission, meet the team, and explore our resources library.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm text-white/80">
            Read our story <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
        <Link
          href="/connect"
          className="group rounded-3xl border border-white/10 bg-black/60 p-8 transition hover:border-white/30 hover:bg-white/5"
        >
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">Get Started</p>
          <h3 className="mt-3 text-2xl font-semibold text-white group-hover:underline">
            Let&apos;s talk chatbots
          </h3>
          <p className="mt-3 text-sm text-white/70">
            Book a demo, start your free trial, or just say hi. We respond within 2-4 hours.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm text-white/80">
            Contact us <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      </section>
    </div>
  );
}
