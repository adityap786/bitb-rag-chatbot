"use client";
import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const cards = [
  {
    id: "security",
    label: "Security & Privacy",
    title: "Built for Enterprises That Don’t Compromise",
    description: "Security-first foundation. Privacy by design. Zero data leakage.",
    narrative: "Our AI platform is architected for companies where data protection is non-negotiable. We support both self-hosted LLMs and privacy-first model deployments, allowing businesses to keep all sensitive information inside their own secure infrastructure. Nothing leaves your environment unless explicitly permitted.",
    points: [
      "Self-hosted or VPC-hosted LLMs for maximum control",
      "Zero data retention — your inputs are never stored or used for training",
      "End-to-end encryption: Data-in-transit (TLS 1.3) & Data-at-rest (AES-256)",
      "Role-based access control (RBAC) and granular permissioning",
      "Complete audit logs for every request + every change",
      "GDPR, SOC2, HIPAA-ready architecture",
      "Run entirely inside your private cloud (AWS, GCP, Azure, on-prem)",
      "PII-protected pipelines ensuring sensitive user data never touches external systems"
    ],
    taglines: [
      "“Your data stays yours.”",
      "“Enterprise-grade security without enterprise-level complexity.”",
      "“Compliance-ready from day zero.”"
    ],
    visualType: "security"
  },
  {
    id: "integrations",
    label: "Integrations",
    title: "Plug Into the Tools That Run Your Business",
    description: "Native integrations with your CRM, ERP, LMS, support system, e-commerce stack, marketing tools & more.",
    narrative: "Your chatbot becomes the operational brain across multiple business systems. Connect once, automate everywhere.",
    points: [
      "Secure API-level connectors",
      "Real-time syncing of customer, order, ticket, and lead data",
      "Automated workflows (create ticket, update CRM, send notification)",
      "Read + write data across systems",
      "Unified customer profile across every touchpoint",
      "No-code interface to activate integrations instantly"
    ],
    categories: {
      "CRMs": ["HubSpot", "Salesforce", "Zoho CRM", "Pipedrive"],
      "ERPs": ["SAP", "Oracle NetSuite", "Odoo", "Tally Prime", "Microsoft Dynamics"],
      "LMS": ["Moodle", "TalentLMS", "Teachmint", "Canvas LMS"],
      "Helpdesk": ["Freshdesk", "Zendesk", "Intercom", "Crisp", "Gorgias"],
      "E-commerce": ["Shopify", "WooCommerce", "Magento", "BigCommerce"],
      "Marketing": ["WhatsApp", "Twilio", "Mailchimp", "Klaviyo", "Slack", "Teams"]
    },
    taglines: [
      "“Connect once. Automate everywhere.”",
      "“Your systems finally talk to each other.”",
      "“From CRM updates to ERP actions — handled by AI.”"
    ],
    visualType: "integrations"
  },
  {
    id: "results",
    label: "Results",
    title: "Real Outcomes That Matter to Businesses",
    description: "Measurable, ROI-driven outcomes your chatbot delivers from day one.",
    narrative: "Our platform isn’t just another chatbot. It enhances productivity, reduces operational drag, and helps your business scale without increasing headcount. You get AI that directly improves revenue, efficiency, and customer experience.",
    points: [
      "Response time drops by 90% with instant support",
      "Lead qualification accuracy improves (35% → 78%)",
      "Teams save 40–70% manual workload",
      "Sales conversions increase due to AI-driven follow-up",
      "Higher customer satisfaction due to faster resolution",
      "Reduced operational costs from workflow automation",
      "Error-free data entry into CRM and ERP systems",
      "Stronger retention through timely reminders & onboarding"
    ],
    taglines: [
      "“AI that earns its keep.”",
      "“Productivity, precision, profitability — on autopilot.”",
      "“Turn conversations into conversions.”"
    ],
    visualType: "results"
  }
];

export default function EnterpriseFeaturesSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  function ParallaxCard({ card, index }: { card: typeof cards[0], index: number }) {
    const cardRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
      target: cardRef,
      offset: ["start end", "start 0.15"],
    });

    const scale = useTransform(scrollYProgress, [0, 0.4, 0.7, 1], [0.85, 1.05, 1, 0.95]);
    const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.3, 1, 1, 1]);

    return (
      <motion.div
        ref={cardRef}
        style={{ scale, opacity, zIndex: index + 1 }}
        className="w-full max-w-6xl min-h-[80vh] rounded-3xl border border-white/10 shadow-2xl p-6 md:p-10 flex flex-col sticky top-24 bg-zinc-900/90 backdrop-blur-xl overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row gap-8 h-full">
          {/* Left Content */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-6">
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-indigo-300 mb-4 border border-white/5">
                {card.label}
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight">
                {card.title}
              </h3>
              <p className="text-lg text-white/60 mb-4 font-light">
                {card.description}
              </p>
              <p className="text-sm text-white/40 mb-6 leading-relaxed border-l-2 border-indigo-500/30 pl-4">
                {card.narrative}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-8">
              {card.points.slice(0, card.visualType === 'integrations' ? 4 : 8).map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-indigo-400" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-sm text-white/80">{point}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-6 border-t border-white/5">
              <div className="flex flex-wrap gap-4">
                {card.taglines.map((tag, i) => (
                  <span key={i} className="text-xs text-white/50 italic">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Visuals */}
          <div className="lg:w-[450px] flex-shrink-0 bg-black/40 rounded-2xl border border-white/5 p-6 overflow-y-auto custom-scrollbar">
            {card.visualType === 'security' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <div className="text-sm font-semibold text-white">End-to-End Encryption</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Data-in-transit</span>
                      <span className="text-green-400">TLS 1.3</span>
                    </div>
                    <div className="flex justify-between text-xs text-white/60">
                      <span>Data-at-rest</span>
                      <span className="text-green-400">AES-256</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <div className="text-sm font-semibold text-white">Compliance Ready</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['GDPR', 'SOC2', 'HIPAA', 'ISO 27001'].map(badge => (
                      <span key={badge} className="px-2 py-1 rounded bg-white/10 text-[10px] text-white/80 border border-white/5">{badge}</span>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    </div>
                    <div className="text-sm font-semibold text-white">Role-Based Access</div>
                  </div>
                  <div className="space-y-2">
                     <div className="h-2 bg-white/10 rounded-full w-full overflow-hidden">
                        <div className="h-full bg-purple-500/50 w-3/4"></div>
                     </div>
                     <div className="flex justify-between text-[10px] text-white/40">
                        <span>Admin</span>
                        <span>Editor</span>
                        <span>Viewer</span>
                     </div>
                  </div>
                </div>
              </div>
            )}

            {card.visualType === 'integrations' && card.categories && (
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(card.categories).map(([category, tools]) => (
                  <div key={category} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <h4 className="text-xs font-semibold text-white/70 mb-2 uppercase tracking-wider">{category}</h4>
                    <ul className="space-y-1">
                      {tools.map(tool => (
                        <li key={tool} className="text-xs text-white/50 flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {card.visualType === 'results' && (
              <div className="space-y-4">
                 <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/20">
                    <div className="text-4xl font-bold text-white mb-1">90%</div>
                    <div className="text-xs text-indigo-300 uppercase tracking-wide">Drop in Response Time</div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-2xl font-bold text-white mb-1">78%</div>
                      <div className="text-[10px] text-white/60">Lead Qualification Accuracy</div>
                      <div className="text-[9px] text-green-400 mt-1">↑ from 35% avg</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-2xl font-bold text-white mb-1">40-70%</div>
                      <div className="text-[10px] text-white/60">Manual Workload Saved</div>
                    </div>
                 </div>
                 <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs text-white/70">Customer Satisfaction</span>
                       <span className="text-xs text-green-400">+24%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 w-[85%]"></div>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <section ref={containerRef} className="relative bg-black text-white py-20 flex flex-col items-center overflow-visible">
      <div className="w-full max-w-6xl px-4 mb-12 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
          Enterprise-Grade <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Power</span>
        </h2>
        <p className="text-white/60 max-w-2xl mx-auto">
          Security, integrations, and results that scale with your business.
        </p>
      </div>
      
      <div className="w-full relative flex flex-col items-center px-4 gap-8 pb-20">
        {cards.map((card, i) => (
          <ParallaxCard key={i} card={card} index={i} />
        ))}
      </div>
    </section>
  );
}
