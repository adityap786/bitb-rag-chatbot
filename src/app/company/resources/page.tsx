"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const gettingStartedResources = [
  {
    title: "How to Set Up Your First Chatbot",
    format: "6-Minute Video",
    href: "/resources/setup-video",
    description: "Follow along as we walk you through the dashboard, knowledge base, and widget embed.",
  },
  {
    title: "Chatbot Setup Checklist",
    format: "PDF Download",
    href: "/resources/setup-checklist.pdf",
    description: "20-point checklist to go live in under 6 minutes—from domain verification to first response.",
  },
  {
    title: "Writing Effective FAQ Documents",
    format: "Guide",
    href: "/resources/faq-guide",
    description: "Formatting, structure, and tone tips to train your RAG pipeline for maximum recall.",
  },
  {
    title: "Best Practices for Lead Capture Forms",
    format: "Guide",
    href: "/resources/lead-capture",
    description: "Optimize conversion rates with form field design and timing strategies.",
  },
];

const caseStudies = [
  {
    title: "MediCare Hospital: 40% Increase in Appointments",
    industry: "Healthcare",
    href: "/case-studies#medicare",
    description: "See how voice greetings in Hindi helped a Mumbai hospital triage after-hours calls.",
  },
  {
    title: "FashionHub: 50% Reduction in Cart Abandonment",
    industry: "E-Commerce",
    href: "/case-studies#fashionhub",
    description: "Automated nudges and product recommendations scaled a Delhi retailer's recovery pipeline.",
  },
  {
    title: "Skyline Properties: ₹2.5Cr in Attributed Sales",
    industry: "Real Estate",
    href: "/case-studies#skyline",
    description: "Instant property search and site-visit booking drove conversions for a Bangalore agency.",
  },
  {
    title: "LegalEase Associates: 3x Faster Matter Intake",
    industry: "Legal",
    href: "/case-studies#legalease",
    description: "Automated client intake and document status checks freed lawyers to focus on practice.",
  },
];

const templates = [
  {
    title: "Service Business Voice Greeting Template",
    format: "JSON Template",
    href: "/resources/templates/service-greeting.json",
    description: "Pre-configured Hindi + English greeting for clinics, law firms, and consulting agencies.",
  },
  {
    title: "E-Commerce Product Recommender Prompt",
    format: "Text File",
    href: "/resources/templates/product-recommender-prompt.txt",
    description: "Tune your copilot's product suggestions with this battle-tested prompt template.",
  },
  {
    title: "Real Estate Property Finder Flow",
    format: "JSON Template",
    href: "/resources/templates/property-finder.json",
    description: "Multi-step flow for filtering by budget, location, and BHK. Works out of the box.",
  },
  {
    title: "Escalation Email Template for High-Priority Leads",
    format: "HTML Email",
    href: "/resources/templates/escalation-email.html",
    description: "Immediately notify your sales team when a high-value prospect engages.",
  },
];

const tools = [
  {
    title: "Widget Customizer",
    href: "/tools/widget-customizer",
    description: "Tweak colors, avatars, and positions. See changes live before embedding.",
  },
  {
    title: "Conversation Simulator",
    href: "/tools/conversation-simulator",
    description: "Test intents and responses against your knowledge base without publishing.",
  },
  {
    title: "ROI Calculator",
    href: "/subscriptions#roi",
    description: "Estimate payback weeks based on your traffic, conversion rate, and uplift.",
  },
  {
    title: "Prompt Library",
    href: "/tools/prompt-library",
    description: "Browse 50+ verified prompts for appointment booking, cart recovery, and lead qualification.",
  },
];

const webinarsEvents = [
  {
    title: "Building a 24/7 Voice Greeting Pipeline",
    date: "December 12, 2025",
    href: "/events/voice-greeting-webinar",
    description: "Join our product lead to learn how voice greetings work under the hood and when to use them.",
  },
  {
    title: "Scaling Customer Support with AI Copilots",
    date: "December 20, 2025",
    href: "/events/scaling-support",
    description: "Panel discussion with CX leaders from healthcare, e-commerce, and SaaS.",
  },
  {
    title: "Office Hours: RAG Best Practices",
    date: "Every Friday, 4 PM IST",
    href: "/events/office-hours",
    description: "Drop in with your knowledge base questions. Our AI team will troubleshoot live.",
  },
];

const blogPosts = [
  {
    title: "How RAG Powers Intelligent Chatbots (Without Hallucinations)",
    date: "Nov 2, 2025",
    href: "/blog/rag-guide",
    description: "Deep dive into our retrieval-augmented generation architecture and guardrails.",
  },
  {
    title: "5 Mistakes Teams Make When Launching Chatbots",
    date: "Oct 28, 2025",
    href: "/blog/chatbot-mistakes",
    description: "Learn from 500+ deployments: avoid these pitfalls and ship with confidence.",
  },
  {
    title: "Why We Built Bilingual Voice Greetings from Day One",
    date: "Oct 15, 2025",
    href: "/blog/hindi-voice",
    description: "The story behind our Hindi + English voice engine and how it transforms CX for Indian businesses.",
  },
];

const apiIntegrations = [
  {
    title: "Shopify Integration Guide",
    href: "/docs/integrations/shopify",
    description: "Sync products, inventory, and orders in real time. Setup takes 3 minutes.",
  },
  {
    title: "WooCommerce Plugin",
    href: "/docs/integrations/woocommerce",
    description: "One-click installation for WordPress stores. Automatically fetches product data.",
  },
  {
    title: "WhatsApp Business API Setup",
    href: "/docs/integrations/whatsapp",
    description: "Route conversations to WhatsApp. Requires verified business account.",
  },
  {
    title: "Calendly Appointment Booking",
    href: "/docs/integrations/calendly",
    description: "Let customers book slots directly from chat. Works with Google Calendar too.",
  },
];

const categories = [
  { value: "getting-started", label: "Getting Started" },
  { value: "case-studies", label: "Case Studies" },
  { value: "templates", label: "Templates & Playbooks" },
  { value: "tools", label: "Tools" },
  { value: "webinars", label: "Webinars & Events" },
  { value: "blog", label: "Blog" },
  { value: "integrations", label: "API & Integrations" },
];

export default function ResourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState("getting-started");

  return (
    <div className="space-y-24 bg-black py-24 text-white">
      <section>
        <div className="max-w-6xl mx-auto px-6 text-center space-y-6">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Resources</p>
          <h1 className="text-4xl font-semibold md:text-5xl">Resources to Help You Win</h1>
          <p className="text-lg text-white/70">
            Guides, templates, case studies, and tools to make your chatbot journey smooth and profitable.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-6">
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="mx-auto flex max-w-5xl flex-wrap justify-center gap-2 bg-transparent">
              {categories.map((category) => (
                <TabsTrigger
                  key={category.value}
                  value={category.value}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/70 transition data-[state=active]:bg-white data-[state=active]:text-black"
                >
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="getting-started" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">Getting Started</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {gettingStartedResources.map((resource) => (
                  <article
                    key={resource.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{resource.format}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{resource.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{resource.description}</p>
                    <Link
                      href={resource.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      Access resource <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="case-studies" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">Case Studies</h2>
              <p className="text-sm text-white/70">
                Deep dives into how real businesses deployed BitB and the revenue impact they saw.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                {caseStudies.map((study) => (
                  <article
                    key={study.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{study.industry}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{study.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{study.description}</p>
                    <Link
                      href={study.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      Read case study <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">Templates & Playbooks</h2>
              <p className="text-sm text-white/70">
                Plug-and-play configurations, prompts, and flows to accelerate your setup.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                {templates.map((template) => (
                  <article
                    key={template.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{template.format}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{template.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{template.description}</p>
                    <Link
                      href={template.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      Download template <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="tools" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">Tools</h2>
              <p className="text-sm text-white/70">
                Interactive widgets and calculators to streamline your workflow.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                {tools.map((tool) => (
                  <article
                    key={tool.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <h3 className="text-lg font-semibold text-white">{tool.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{tool.description}</p>
                    <Link
                      href={tool.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      Try tool <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="webinars" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">Webinars & Events</h2>
              <p className="text-sm text-white/70">
                Join live sessions, office hours, and panels with our product and AI teams.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                {webinarsEvents.map((event) => (
                  <article
                    key={event.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{event.date}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{event.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{event.description}</p>
                    <Link
                      href={event.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      Register <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="blog" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">Blog</h2>
              <p className="text-sm text-white/70">
                Articles on RAG architecture, chatbot best practices, and product announcements.
              </p>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {blogPosts.map((post) => (
                  <article
                    key={post.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{post.date}</p>
                    <h3 className="mt-3 text-lg font-semibold text-white">{post.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{post.description}</p>
                    <Link
                      href={post.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      Read article <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="integrations" className="mt-12 space-y-6">
              <h2 className="text-2xl font-semibold">API & Integrations</h2>
              <p className="text-sm text-white/70">
                Step-by-step guides for connecting BitB to your existing tools and platforms.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                {apiIntegrations.map((integration) => (
                  <article
                    key={integration.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
                  >
                    <h3 className="text-lg font-semibold text-white">{integration.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{integration.description}</p>
                    <Link
                      href={integration.href}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1"
                    >
                      View docs <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section>
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl font-semibold">Need Something Custom?</h2>
          <p className="text-lg text-white/70">
            Can't find what you're looking for? Drop us a line and we'll create a guide or template just for you.
          </p>
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-10 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Request Custom Resource →
          </Link>
        </div>
      </section>
    </div>
  );
}
