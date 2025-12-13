"use client";
import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const cards = [
  {
    label: "AI Analytics Chatbot",
    problem: "Problem: Data overload, slow insights, and manual reporting make it hard for business owners to get timely answers. Teams spend hours building dashboards, but decision makers still wait for clarity.",
    solution: "Solution: Meet your personal data analyst — on demand. Our AI chatbot connects directly to your business database, instantly answers questions, and generates analytics. Visualize sales per month, top/least selling items, and trends over time. Empower your team to act fast, spot risks, and optimize strategy — no more waiting for reports.",
    points: [
      "Connects directly to your business database",
      "Instantly answers questions and generates analytics",
      "Visualizes: Sales per month & product, Top/least selling items, Trends & dips over time",
      "Empowers decision makers to act fast, spot risks, and optimize strategy",
    ],
    visual: (
      <div className="flex gap-4 mt-4">
        <div className="w-16 h-16 bg-gradient-to-br from-white/10 to-white/5 rounded-lg flex items-center justify-center shadow-lg">
          <svg width="32" height="32" fill="none"><rect width="32" height="32" rx="6" fill="#fff" fillOpacity="0.1"/><path d="M8 24V8h16v16H8zm2-2h12V10H10v12zm2-2h8v-8h-8v8z" fill="#fff" fillOpacity="0.7"/></svg>
        </div>
        <div className="w-16 h-16 bg-gradient-to-br from-white/10 to-white/5 rounded-lg flex items-center justify-center shadow-lg">
          <svg width="32" height="32" fill="none"><circle cx="16" cy="16" r="12" stroke="#fff" strokeOpacity="0.7" strokeWidth="2"/><path d="M16 10v6l4 2" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round"/></svg>
        </div>
      </div>
    ),
    isAnalytics: true,
    miniCharts: [
      {
        label: "Most trending product (last 4 months)",
        percentage: "+28%",
        sparkline: "M0,20 L10,15 L20,10 L30,5 L40,8 L50,12 L60,18 L70,22 L80,20",
      },
      {
        label: "Sales change vs last quarter",
        percentage: "–12%",
        sparkline: "M0,15 L10,18 L20,12 L30,8 L40,10 L50,14 L60,16 L70,13 L80,15",
      },
    ],
    metrics: [
      { label: "Inventory wasted per quarter", value: "15%", barWidth: "15%" },
      { label: "Stockouts (count)", value: "23", barWidth: "23%" },
      { label: "Return rate (%)", value: "8%", sparkline: "M0,10 L5,8 L10,12 L15,9 L20,11" },
      { label: "Total sales in last quarter (₹)", value: "₹2,45,000", sub: "+5%" },
      { label: "Average order value (AOV)", value: "₹1,250", sub: "per order" },
      { label: "Low-performing SKU index", barWidth: "40%" },
    ],
    badges: [
      { value: "32%", label: "faster insights" },
      { value: "45%", label: "reduction in analysis time" },
    ],
  },
  {
    label: "AI E-Commerce Assistant",
    problem: "Problem: Shoppers drop off, too many choices, and slow support frustrate customers and reduce sales. Fashion brands struggle to show products in context, and buyers want confidence before they purchase.",
    solution: "Solution: Turn browsers into buyers. Our AI E-Commerce Assistant delivers smart product recommendations, side-by-side comparisons, and even virtual try-on for fashion brands. Upload a photo, see apparel on you, and get fast, intelligent support 24/7. Convert more visitors and delight your customers.",
    points: [
      "Smart product recommendations",
      "Side-by-side product comparison",
      "Virtual try-on for fashion brands: Upload a photo, see apparel on you",
      "Fast, intelligent support — 24/7",
    ],
    visual: null,
    isAnalytics: false,
  },
  {
    label: "Lead Capture & Qualification",
    problem: "Problem: Missed leads, compliance risk, and manual follow-up drain resources for legal, healthcare, and finance teams. Complex queries and regulations make it hard to scale personalized responses.",
    solution: "Solution: AI that never misses a lead. Capture, qualify, and nurture leads automatically. Handle complex queries for legal, healthcare, finance, and insurance — all with compliance-safe, accurate responses. Free your team from manual work and never miss an opportunity.",
    points: [
      "Captures, qualifies, and nurtures leads automatically",
      "Handles complex queries for: Legal, healthcare, finance, insurance",
      "Provides compliance-safe, accurate responses",
      "Reduces manual workload for your team",
    ],
    visual: null,
    isAnalytics: false,
  },
];

export default function BusinessApplicationsSection() {
  const containerRef = useRef<HTMLElement>(null);

  // Individual card component with scroll-driven scale effect
  function ParallaxCard({ card, index }: { card: typeof cards[0], index: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
      target: containerRef,
      offset: ["start end", "end start"],
    });

    const scale = useTransform(scrollYProgress, [0, 0.4, 0.7, 1], [0.85, 1.05, 1, 0.95]);
    const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.3, 1, 1, 1]);

    return (
      <div ref={containerRef} className="w-full relative flex justify-center h-[100vh]">
        <motion.div
          style={{ scale, opacity, zIndex: index + 1 }}
          className="w-full max-w-5xl h-[calc(100vh-140px)] rounded-3xl border border-white/10 shadow-2xl p-4 md:p-8 flex flex-col justify-between sticky top-28 bg-black"
        >
        {/* All cards use the same split layout now */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
          {/* Left: Copywriting */}
          <div className="flex-1 pr-4">
            <span className="text-xs uppercase tracking-widest text-white/40 mb-2 block font-semibold">{card.label}</span>
            {card.isAnalytics ? (
              <>
                <div className="mb-3">
                  <span className="block text-sm font-bold text-white/60 mb-1">Problem</span>
                  <p className="text-sm text-white/80 mb-2">{card.problem.split('.').slice(0,1).join('.') + '.'}</p>
                  <span className="block text-sm font-bold text-white/60 mb-1">Solution</span>
                  <p className="text-sm text-white/90 mb-2">{card.solution.split('.').slice(0,1).join('.') + '.'}</p>
                </div>
                <ul className="space-y-1 text-white/90 text-sm mb-3">
                  {card.points.slice(0,3).map((pt, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="inline-block w-2 h-2 mt-1 rounded-full bg-white/40" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <span className="block text-sm font-bold text-white/60 mb-1">Problem:</span>
                  <p className="text-base text-white/80 mb-2">{card.problem}</p>
                  <span className="block text-sm font-bold text-white/60 mb-1">Solution:</span>
                  <p className="text-base text-white/90 mb-4">{card.solution}</p>
                </div>
                <ul className="space-y-2 text-white/90 text-base mb-4">
                  {card.points.map((pt, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="inline-block w-2 h-2 mt-2 rounded-full bg-white/40" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {card.visual}
          </div>

          {/* Right: Widget Area */}
          <div className="w-full md:w-[340px] flex-shrink-0">
            {index === 0 ? (
              // Analytics widget
              <div className="rounded-2xl border border-white/10 p-4 bg-black/60 shadow-[0_8px_20px_rgba(255,255,255,0.06)] min-h-[320px]">
                {/* Top Mini-Charts */}
                <div className="flex gap-2 mb-4">
                  {card.miniCharts?.map((chart, j) => (
                    <div key={j} className="flex-1 bg-black/40 rounded-lg p-3 border border-white/10">
                      <h4 className="text-[9px] uppercase tracking-widest text-white/60 mb-1">{chart.label}</h4>
                      <div className="text-2xl font-bold text-white mb-1 leading-none">{chart.percentage}</div>
                      <svg width="80" height="16" className="text-white/70">
                        <path d={chart.sparkline} stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </svg>
                    </div>
                  ))}
                </div>
                {/* Stats */}
                <div className="space-y-3 mb-4 text-xs">
                  {card.metrics?.slice(0,4).map((metric, k) => (
                    <div key={k} className="flex items-center justify-between">
                      <div className="flex-1 pr-2">
                        <span className="text-[11px] text-white/80">{metric.label}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm font-semibold text-white">{metric.value}</span>
                          {metric.sub && <span className="text-[10px] text-white/60">{metric.sub}</span>}
                        </div>
                      </div>
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-white/40 to-white/20 rounded-full" style={{ width: metric.barWidth }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Badges */}
                <div className="flex gap-2">
                  {card.badges?.map((badge, l) => (
                    <div key={l} className="flex-1 bg-black/50 rounded-lg p-2 border border-white/10 text-center">
                      <div className="text-lg font-bold text-white">{badge.value}</div>
                      <div className="text-[10px] text-white/60">{badge.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : index === 1 ? (
              // Premium AI Shopping Assistant Chat Widget
              <div className="w-full bg-gradient-to-b from-zinc-900 to-black rounded-2xl border border-white/10 flex flex-col h-fit overflow-hidden shadow-2xl">
                {/* Chat header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/60">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">AI Shopping Assistant</div>
                      <div className="text-[10px] text-green-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                        Online • Virtual Try-On
                      </div>
                    </div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white" fillOpacity="0.4"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                </div>

                {/* Chat conversation */}
                <div className="px-3 py-3 space-y-3">
                  {/* User message with attached images */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl rounded-br-sm px-3 py-1.5 max-w-[90%]">
                      <p className="text-xs text-white">"Try on this green shirt please"</p>
                    </div>
                    {/* User's attached images */}
                    <div className="flex gap-1.5">
                      <div className="relative rounded-lg overflow-hidden border border-white/20">
                        <img src="/woman photo.png" alt="User photo" className="w-12 h-14 object-cover" />
                      </div>
                      <div className="relative rounded-lg overflow-hidden border border-white/20">
                        <img src="/green shirt.png" alt="Green shirt" className="w-12 h-14 object-cover" />
                      </div>
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-[8px] font-bold text-white">AI</span>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="bg-white/5 border border-white/10 rounded-xl rounded-bl-sm px-3 py-1.5">
                        <p className="text-xs text-white/90">Here's your preview!</p>
                      </div>
                      
                      {/* AI Generated Result Card */}
                      <div className="bg-gradient-to-b from-white/5 to-black/20 border border-white/10 rounded-xl p-2">
                        <div className="relative rounded-lg overflow-hidden">
                          <img src="/transformed photos.png" alt="AI Try-on preview" className="w-full h-32 object-cover object-top" />
                          <div className="absolute top-1 right-1 bg-black/70 text-[8px] text-white/90 px-1.5 py-0.5 rounded-full">AI Generated</div>
                        </div>
                        
                        {/* Product details */}
                        <div className="mt-2 flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold text-white">Cropped Green Shirt</div>
                            <div className="text-sm font-bold text-white">$49.99</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] text-white/60">AI-Fit</div>
                            <div className="text-sm font-bold text-green-400">94%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="px-3 py-2 border-t border-white/10 bg-black/60">
                  <div className="flex gap-2">
                    <button className="flex-1 bg-white text-black text-xs font-semibold rounded-full py-2 hover:bg-white/90 transition">Add to Cart</button>
                    <button className="bg-white/10 text-white text-xs font-medium rounded-full px-4 py-2 hover:bg-white/20 transition">Try Another</button>
                  </div>
                </div>
              </div>
            ) : (
              // Lead Capture widget
              <div className="rounded-2xl border border-white/10 p-6 bg-black shadow-[0_8px_24px_rgba(255,255,255,0.08)] min-h-[320px] flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <span className="text-base font-semibold text-white mb-2">Smart Lead Capture</span>
                <span className="text-sm text-white/60 text-center px-4 mb-4">AI-powered qualification & nurturing for legal, healthcare & finance</span>
                <div className="flex gap-2">
                  <span className="text-[11px] bg-white/10 text-white/70 rounded-full px-3 py-1.5">24/7 Active</span>
                  <span className="text-[11px] bg-green-500/20 text-green-300 rounded-full px-3 py-1.5">Compliant</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
      </div>
    );
  }

  return (
    <section ref={containerRef} className="relative bg-black text-white py-12 flex flex-col items-center overflow-visible">
      {/* Sticky title */}
      <div className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm w-full py-6 mb-8">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center">Business Applications</h2>
      </div>
      <div className="w-full relative flex flex-col items-center px-4">
        {cards.map((card, i) => (
          <div key={card.label} className="w-full relative flex justify-center h-[100vh]">
            <ParallaxCard card={card} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
