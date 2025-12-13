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

const surface = "relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-black/70 shadow-[0_24px_120px_-70px_rgba(255,255,255,0.85)]";
const subtleGrid =
  "absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.06),transparent_28%),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:260px_260px,220px_220px,120px_120px,120px_120px]";

const securityHighlights = [
  {
    title: "Self-hosted or VPC-first",
    copy: "Deploy inside your cloud, keep the model and vectors under your keys. Nothing leaves unless you say so.",
    meta: "AWS · GCP · Azure · DO · On-prem",
  },
  {
    title: "Zero data retention",
    copy: "Inputs are never stored or reused. Every token stays ephemeral unless you opt in for observability.",
    meta: "No shadow logging",
  },
  {
    title: "Encryption end-to-end",
    copy: "TLS 1.3 everywhere, AES-256 at rest, signed URLs for every artifact, scoped tokens for every tenant.",
    meta: "Transport + rest + artifact signing",
  },
  {
    title: "Granular access control",
    copy: "RBAC, per-surface permissions, origin-locking, and kill-switches for any connector or model.",
    meta: "RBAC · domain lock · quotas",
  },
  {
    title: "Full auditability",
    copy: "Every prompt, decision, and downstream action is logged with actor, time, and payload hashes.",
    meta: "Trace-ready logs",
  },
  {
    title: "Compliance runway",
    copy: "Architected for GDPR, SOC2, HIPAA. Default PII scrubbing and retention controls ship with the stack.",
    meta: "Default PII scrubbing",
  },
];

const integrationStacks = [
  {
    label: "CRM",
    tools: ["HubSpot", "Salesforce", "Zoho", "Pipedrive"],
    note: "Sync leads, deals, and timelines with read/write actions.",
  },
  {
    label: "ERP",
    tools: ["SAP", "Oracle NetSuite", "Odoo", "Dynamics"],
    note: "Move inventory, invoices, and payables with guardrails.",
  },
  {
    label: "LMS",
    tools: ["Moodle", "TalentLMS", "Teachmint", "Canvas"],
    note: "Keep cohorts, assessments, and completions in sync.",
  },
  {
    label: "Support",
    tools: ["Freshdesk", "Zendesk", "Intercom", "Crisp", "Gorgias"],
    note: "Open, update, and resolve tickets without tab-switching.",
  },
  {
    label: "Commerce",
    tools: ["Shopify", "WooCommerce", "Magento", "BigCommerce"],
    note: "Products, orders, returns—kept consistent across channels.",
  },
  {
    label: "Comms",
    tools: ["WhatsApp API", "Twilio", "Mailchimp", "Klaviyo", "Slack", "Teams"],
    note: "Trigger outreach, alerts, and journeys from any conversation.",
  },
];

const resultSignals = [
  {
    metric: "90%",
    label: "Faster response",
    detail: "Seconds instead of minutes. Origin-locked, quota-safe.",
  },
  {
    metric: "78%",
    label: "Lead qualification",
    detail: "Precision scoring with CRM writes baked in.",
  },
  {
    metric: "40-70%",
    label: "Manual work cut",
    detail: "Tickets, intake, and updates automated with guardrails.",
  },
  {
    metric: "↗",
    label: "Conversion lift",
    detail: "Bundles, nudges, and follow-ups tuned per funnel.",
  },
  {
    metric: "↗",
    label: "CSAT",
    detail: "Voice-first empathy with bilingual tone control.",
  },
  {
    metric: "↘",
    label: "Ops cost",
    detail: "Less swivel chair, more resolved conversations.",
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
        <section id="trial" className="my-16 scroll-mt-24">
          <TrialOnboardingWizardGSAP />
        </section>

        {/* Business Applications Section (Third Section) */}
        <section className="my-16">
          <BusinessApplicationsSection />
        </section>

        {/* Security & Privacy Section */}
        <section className="relative my-16 overflow-hidden rounded-3xl border border-white/12 bg-black/80 p-8 md:p-12 shadow-[0_32px_140px_-90px_rgba(255,255,255,0.8)]">
          <div className={subtleGrid} aria-hidden="true" />
          <div className="relative grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-black/60 px-4 py-1 text-[11px] uppercase tracking-[0.4em] text-white/70">
                Security & Privacy
                <span className="h-1 w-8 rounded-full bg-gradient-to-r from-white/80 to-white/30" aria-hidden="true" />
              </span>
              <h2 className="text-4xl font-semibold text-white sm:text-5xl">
                Built for teams that treat data as sacred.
              </h2>
              <p className="text-lg text-white/70">
                Security-first foundation. Privacy by design. Zero data leakage.
              </p>
              <p className="max-w-3xl text-base leading-relaxed text-white/60">
                Keep sensitive knowledge, vectors, and runtime inside your walls. Our stack is engineered to respect boundaries: self-hostable, origin-locked, auditable, and built to withstand procurement.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/5 p-4 text-sm text-white/80">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-white/50">Guardrails</p>
                  <p className="mt-2 text-white">Origin lock · quota ceilings · kill switches per connector.</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/5 p-4 text-sm text-white/80">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-white/50">PII safe</p>
                  <p className="mt-2 text-white">Default scrubbing, signed URLs, and per-tenant retention controls.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {securityHighlights.map((item) => (
                <div key={item.title} className={`${surface} p-6`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/0 opacity-60" aria-hidden="true" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.08),transparent_45%)] opacity-50" aria-hidden="true" />
                  <div className="relative space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/60">
                      <Lock className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                      {item.meta}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-white/70">{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-10 rounded-3xl border border-dashed border-white/15 bg-gradient-to-r from-white/5 via-white/0 to-white/5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              {["AWS", "GCP", "Azure", "DigitalOcean", "On-Prem"].map((item) => (
                <span key={item} className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/70">
                  {item}
                </span>
              ))}
              <span className="text-sm text-white/60">Deploy anywhere. Keep every secret inside your perimeter.</span>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm italic text-white/60">“Your data stays yours.”</p>
            <p className="mt-2 text-xs text-white/45">Enterprise-grade security without enterprise-level bureaucracy.</p>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="my-16 rounded-3xl border border-white/10 bg-black/70 p-8 md:p-12">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="inline-block rounded-full border border-white/20 bg-black/60 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/60">
                Integrations
              </span>
              <h2 className="mt-6 text-4xl font-semibold text-white sm:text-5xl">
                Plug Into the Tools That Run Your Business
              </h2>
              <p className="mt-4 text-lg text-white/70">
                Native integrations with your CRM, ERP, LMS, support system, e-commerce stack, marketing tools & more.
              </p>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-white/60">
                Your chatbot becomes the operational brain across multiple business systems—connecting once to automate everywhere.
              </p>
            </div>

            <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">CRMs</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>HubSpot</li>
                  <li>Salesforce</li>
                  <li>Zoho CRM</li>
                  <li>Pipedrive</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">ERPs</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>SAP</li>
                  <li>Oracle NetSuite</li>
                  <li>Odoo</li>
                  <li>Tally Prime</li>
                  <li>Microsoft Dynamics</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">LMS / Training</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>Moodle</li>
                  <li>TalentLMS</li>
                  <li>Teachmint</li>
                  <li>Canvas LMS</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">Helpdesk & Support</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>Freshdesk</li>
                  <li>Zendesk</li>
                  <li>Intercom</li>
                  <li>Crisp</li>
                  <li>Gorgias</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">E-commerce</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>Shopify</li>
                  <li>WooCommerce</li>
                  <li>Magento</li>
                  <li>BigCommerce</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">Communication & Marketing</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  <li>WhatsApp Cloud API</li>
                  <li>Twilio</li>
                  <li>Mailchimp</li>
                  <li>Klaviyo</li>
                  <li>Slack</li>
                  <li>Teams</li>
                </ul>
              </div>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8">
              <h3 className="text-2xl font-semibold text-white">How Integrations Work</h3>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <ul className="space-y-3 text-sm text-white/70">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 text-emerald-400">●</span>
                      <span><strong>Secure API-level connectors</strong> ensure data flows safely between systems</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 text-emerald-400">●</span>
                      <span><strong>Real-time syncing</strong> of customer, order, ticket, and lead data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 text-emerald-400">●</span>
                      <span><strong>Automated workflows</strong> (create ticket, update CRM record, send notification)</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <ul className="space-y-3 text-sm text-white/70">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 text-sky-400">●</span>
                      <span><strong>Read + write capabilities</strong> for chatbot actions across systems</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 text-sky-400">●</span>
                      <span><strong>Unified customer profile</strong> across every touchpoint</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 text-sky-400">●</span>
                      <span><strong>No-code interface</strong> to activate integrations instantly</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm italic text-white/50">&ldquo;Connect once. Automate everywhere.&rdquo;</p>
              <p className="mt-2 text-xs text-white/40">Your systems finally talk to each other. From CRM updates to ERP actions—handled by AI.</p>
            </div>
          </div>
        </section>

        {/* Results Section */}
        <section className="my-16 rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 md:p-12">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <span className="inline-block rounded-full border border-white/20 bg-black/60 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/60">
                Results
              </span>
              <h2 className="mt-6 text-4xl font-semibold text-white sm:text-5xl">
                Real Outcomes That Matter to Businesses
              </h2>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-white/70">
                Our platform isn&apos;t just another chatbot. It enhances productivity, reduces operational drag, and helps your business scale without increasing headcount. You get AI that directly improves revenue, efficiency, and customer experience—with measurable outcomes from day one.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/50 p-6 text-center">
                <div className="text-5xl font-bold text-white">90%</div>
                <p className="mt-3 text-sm font-semibold text-white/80">Faster Response Time</p>
                <p className="mt-2 text-xs text-white/60">Instant support reduces wait times from minutes to seconds</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-6 text-center">
                <div className="text-5xl font-bold text-white">78%</div>
                <p className="mt-3 text-sm font-semibold text-white/80">Lead Qualification</p>
                <p className="mt-2 text-xs text-white/60">Up from industry avg of 35%—AI-driven precision</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-6 text-center">
                <div className="text-5xl font-bold text-white">40-70%</div>
                <p className="mt-3 text-sm font-semibold text-white/80">Manual Work Saved</p>
                <p className="mt-2 text-xs text-white/60">Teams focus on high-value tasks, not repetitive queries</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-6 text-center">
                <div className="text-5xl font-bold text-white">↑</div>
                <p className="mt-3 text-sm font-semibold text-white/80">Sales Conversions</p>
                <p className="mt-2 text-xs text-white/60">AI-driven follow-up keeps leads warm and moving</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-6 text-center">
                <div className="text-5xl font-bold text-white">↑</div>
                <p className="mt-3 text-sm font-semibold text-white/80">Customer Satisfaction</p>
                <p className="mt-2 text-xs text-white/60">Faster resolution = happier customers</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-6 text-center">
                <div className="text-5xl font-bold text-white">↓</div>
                <p className="mt-3 text-sm font-semibold text-white/80">Operational Costs</p>
                <p className="mt-2 text-xs text-white/60">Workflow automation cuts recurring expenses</p>
              </div>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-8">
              <h3 className="text-2xl font-semibold text-white">Additional Benefits</h3>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-400">✓</span>
                  <div>
                    <p className="font-semibold text-white">Error-free data entry</p>
                    <p className="mt-1 text-sm text-white/70">Automated CRM and ERP updates eliminate human error</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 text-emerald-400">✓</span>
                  <div>
                    <p className="font-semibold text-white">Stronger retention</p>
                    <p className="mt-1 text-sm text-white/70">Timely reminders, onboarding flows, and personalized messaging</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm italic text-white/50">&ldquo;AI that earns its keep.&rdquo;</p>
              <p className="mt-2 text-xs text-white/40">Productivity, precision, profitability—on autopilot. Turn conversations into conversions.</p>
            </div>
          </div>
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
