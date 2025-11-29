import type { Metadata } from "next";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Company Overview | BitB - Built in India, Scaling Globally",
  description: "Learn about BitB's mission to make intelligent, beautiful chatbots accessible to every business in India. Founded 2024, 500+ customers, 12-person team.",
};

const stats = [
  { label: "Founded", value: "2024" },
  { label: "Team", value: "12 makers" },
  { label: "Customers", value: "500+" },
  { label: "NPS", value: "67" },
];

const milestones = [
  {
    year: "2024",
    title: "BitB is born",
    description: "Prototype launched from Ghaziabad with a mission to blend intelligence and design in chatbots.",
  },
  {
    year: "2025",
    title: "500 tenants onboarded",
    description: "Scaled RAG pipelines and voice greetings across healthcare, e-commerce, and financial services.",
  },
  {
    year: "2025",
    title: "24/7 support hub",
    description: "Introduced voice-first escalation workflows and expanded to multilingual copilots across India.",
  },
];

const principles = [
  "User ecstasy first—every release must reduce friction.",
  "Obsess over bilingual excellence: Hindi and English served natively.",
  "Design deserves parity with intelligence.",
  "Ship transparently—no hidden fees, no lock-ins.",
];

export default function CompanyOverviewPage() {
  return (
    <div className="space-y-24 bg-black py-24 text-white">
      <Header />
      <section>
        <div className="max-w-5xl mx-auto px-6 text-center space-y-6">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Overview</p>
          <h2 className="text-4xl font-semibold md:text-5xl">We design copilots that feel human and sound Indian.</h2>
          <p className="text-lg text-white/70">
            BitB powers customer conversations for ambitious Indian businesses—from boutique clinics to nationwide
            retailers. We build reliable automation with a craft-first lens and keep humans in control.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="space-y-2 text-center md:text-left">
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">{stat.label}</p>
                <p className="text-3xl font-semibold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto space-y-10 px-6">
          <h3 className="text-3xl font-semibold">Why teams bet on BitB</h3>
          <div className="grid gap-8 md:grid-cols-2">
            {principles.map((principle) => (
              <div
                key={principle}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 shadow-2xl backdrop-blur-xl"
              >
                {principle}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl">
            <h3 className="text-3xl font-semibold">Milestones</h3>
            <div className="mt-10 space-y-8">
              {milestones.map((milestone) => (
                <div key={milestone.title} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/40 p-6 md:flex-row md:items-start">
                  <div className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60 md:w-32">
                    {milestone.year}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-semibold text-white">{milestone.title}</p>
                    <p className="text-sm text-white/70">{milestone.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <h3 className="text-3xl font-semibold">Ready to explore more?</h3>
          <p className="text-white/70">
            Dive into our founding story or download customer playbooks built from hundreds of live deployments.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/company/about"
              className="rounded-full bg-white px-10 py-4 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
            >
              About the team
            </a>
            <a
              href="/company/resources"
              className="rounded-full border border-white/20 px-10 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Browse resources
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
