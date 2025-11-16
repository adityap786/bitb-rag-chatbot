import Link from "next/link";
import Image from "next/image";

const industrySolutions = [
  {
    name: "Healthcare",
    icon: "🩺",
    features: [
      "24/7 appointment triage",
      "Insurance document validation",
      "Hindi + English clinical intake",
    ],
    href: "/resources/healthcare",
  },
  {
    name: "Real Estate",
    icon: "🏢",
    features: [
      "Interactive property matcher",
      "Site visit scheduling",
      "Lead nurturing playbooks",
    ],
    href: "/resources/real-estate",
  },
  {
    name: "Legal",
    icon: "⚖️",
    features: [
      "Matter intake automation",
      "Contract clause lookup",
      "Document status tracking",
    ],
    href: "/resources/legal",
  },
  {
    name: "Hospitality",
    icon: "🏨",
    features: [
      "24/7 concierge support",
      "Event & banquet enquiries",
      "Real-time feedback capture",
    ],
    href: "/resources/hospitality",
  },
  {
    name: "E-Commerce",
    icon: "🛍️",
    features: [
      "Cart recovery drips",
      "Product finders",
      "Order tracking macros",
    ],
    href: "/resources/ecommerce",
  },
  {
    name: "Education",
    icon: "🎓",
    features: [
      "Admission counselling",
      "Course catalog search",
      "Fee reminder automations",
    ],
    href: "/resources/education",
  },
];

const caseStudies = [
  {
    company: "MediCare Hospital, Mumbai",
    industry: "Healthcare",
    challenge: "Missed 60% of appointment calls after hours",
    solution: "Deployed ELEVATE with 24/7 booking",
    results: [
      "40% increase in appointment bookings",
      "₹15L additional revenue in 3 months",
      "95% patient satisfaction score",
    ],
    testimonial:
      "Our patients love the Hindi support. Bookings are up 40% and our staff is less overwhelmed.",
    author: "Dr. Priya Sharma, CMO",
    image:
      "https://images.unsplash.com/photo-1580281657527-47f249e8f3c2?auto=format&fit=crop&w=1200&q=80",
  },
  {
    company: "FashionHub, Delhi",
    industry: "E-Commerce",
    challenge: "70% cart abandonment rate",
    solution: "Implemented SCALE with cart recovery",
    results: [
      "50% reduction in cart abandonment",
      "8x more leads captured",
      "₹25L recovered revenue in 6 months",
    ],
    testimonial:
      "The chatbot pays for itself 10x over. Our customers actually compliment the shopping experience.",
    author: "Rajesh Malhotra, Founder",
    image:
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80",
  },
  {
    company: "Skyline Properties, Bangalore",
    industry: "Real Estate",
    challenge: "Slow response to property inquiries",
    solution: "Deployed ELEVATE with property search",
    results: [
      "3x faster response time",
      "65% increase in site visit bookings",
      "₹2.5Cr in sales attributed to chatbot",
    ],
    testimonial:
      "Prospects get instant answers about properties. Our conversion rate has never been higher.",
    author: "Adv. Vikram Desai, Sales Head",
    image:
      "https://images.unsplash.com/photo-1487956382158-bb926046304a?auto=format&fit=crop&w=1200&q=80",
  },
];

const metrics = [
  { value: "500+", label: "Businesses using BitB" },
  { value: "40%", label: "Average engagement increase" },
  { value: "8x", label: "More leads captured" },
  { value: "24/7", label: "Availability guaranteed" },
];

const featureMatrix = [
  {
    feature: "Appointment Booking",
    healthcare: "✅",
    realEstate: "✅",
    legal: "✅",
    ecommerce: "❌",
  },
  {
    feature: "Product Recommendations",
    healthcare: "❌",
    realEstate: "❌",
    legal: "❌",
    ecommerce: "✅",
  },
  {
    feature: "Document Analysis",
    healthcare: "⚠️",
    realEstate: "⚠️",
    legal: "✅",
    ecommerce: "❌",
  },
  {
    feature: "Payment Integration",
    healthcare: "✅",
    realEstate: "❌",
    legal: "⚠️",
    ecommerce: "✅",
  },
  {
    feature: "Hindi/English Support",
    healthcare: "✅",
    realEstate: "✅",
    legal: "✅",
    ecommerce: "✅",
  },
  {
    feature: "Voice Greetings",
    healthcare: "✅",
    realEstate: "✅",
    legal: "✅",
    ecommerce: "✅",
  },
];

export default function CaseStudiesPage() {
  return (
    <div className="bg-black text-white">
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Case Studies & Solutions</p>
              <h1 className="text-4xl font-semibold md:text-5xl">Real Results. Real Businesses. Real Impact.</h1>
              <p className="text-lg text-white/70">
                See how businesses across India are delivering user ecstasy with BitB&apos;s AI copilots.
              </p>
            </div>
            <div className="w-full max-w-xs">
              <label className="block text-sm text-white/60" htmlFor="industry-filter">
                Filter by industry
              </label>
              <select
                id="industry-filter"
                className="mt-2 w-full rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-2xl focus:border-white/40 focus:outline-none focus:ring-0"
                defaultValue="all"
              >
                <option value="all" className="text-black">
                  All industries
                </option>
                {industrySolutions.map((solution) => (
                  <option key={solution.name} value={solution.name.toLowerCase()} className="text-black">
                    {solution.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold">Solutions for Every Industry</h2>
              <p className="mt-3 max-w-2xl text-white/70">
                Modular workflows tuned for your business model. Mix-and-match intents, channels, and automation depth
                without touching a line of code.
              </p>
            </div>
            <Link
              href="/resources"
              className="hidden rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white transition hover:bg-white hover:text-black md:block"
            >
              View full playbook
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {industrySolutions.map((solution) => (
              <article
                key={solution.name}
                className="group rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
              >
                <div className="text-3xl">{solution.icon}</div>
                <h3 className="mt-4 text-2xl font-semibold">{solution.name}</h3>
                <ul className="mt-4 space-y-2 text-sm text-white/70">
                  {solution.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-1 text-white/40">
                        •
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={solution.href}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white transition hover:translate-x-1"
                >
                  Explore <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold">Success Stories</h2>
              <p className="mt-3 text-white/70">
                Deep-dive into the automations, uplift, and conversion deltas that BitB copilots deliver within weeks.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/resources"
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white transition hover:bg-white hover:text-black"
              >
                Download full PDF deck
              </Link>
              <Link
                href="https://www.linkedin.com/shareArticle?mini=true&url=https://bitb.ai/case-studies"
                target="_blank"
                className="rounded-full border border-white/10 px-6 py-3 text-sm text-white transition hover:border-white/40"
              >
                Share on LinkedIn
              </Link>
            </div>
          </div>
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {caseStudies.map((study) => (
              <article
                key={study.company}
                className="flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
              >
                <div className="space-y-6 p-8">
                  <div className="relative h-40 w-full overflow-hidden rounded-2xl border border-white/5">
                    <Image
                      src={study.image}
                      alt={study.company}
                      fill
                      className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{study.industry}</p>
                    <h3 className="text-xl font-semibold text-white">{study.company}</h3>
                    <div className="space-y-1 text-sm text-white/70">
                      <p>
                        <span className="font-medium text-white/90">Challenge:</span> {study.challenge}
                      </p>
                      <p>
                        <span className="font-medium text-white/90">Solution:</span> {study.solution}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-white/70">
                    {study.results.map((result) => (
                      <li key={result} className="flex items-start gap-2">
                        <span aria-hidden="true" className="mt-1 text-white/40">
                          ●
                        </span>
                        <span>{result}</span>
                      </li>
                    ))}
                  </ul>
                  <blockquote className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                    “{study.testimonial}”
                    <footer className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-white/50">
                      {study.author}
                    </footer>
                  </blockquote>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 px-8 py-6 text-sm text-white/70">
                  <Link href="/resources" className="font-medium text-white transition hover:text-white/50">
                    Download study →
                  </Link>
                  <div className="flex gap-3">
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                        `${study.company} grew with BitB AI`
                      )}&url=https://bitb.ai/case-studies`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-white"
                    >
                      Share
                    </a>
                    <a
                      href="mailto:press@bitsandbytes.ltd?subject=Press%20Kit%20Request"
                      className="hover:text-white"
                    >
                      Request press kit
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-12 shadow-2xl backdrop-blur-xl">
            <h2 className="text-3xl font-semibold">The Numbers Don&apos;t Lie</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <p className="text-4xl font-semibold text-white">{metric.value}</p>
                  <p className="text-sm text-white/60">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 space-y-8">
          <h2 className="text-3xl font-semibold">Features Tailored to Your Industry</h2>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
            <table className="w-full table-fixed border-collapse text-left text-sm text-white/80">
              <thead className="bg-white/10 text-xs uppercase tracking-[0.3em] text-white/60">
                <tr>
                  <th className="px-6 py-4">Feature</th>
                  <th className="px-6 py-4">Healthcare</th>
                  <th className="px-6 py-4">Real Estate</th>
                  <th className="px-6 py-4">Legal</th>
                  <th className="px-6 py-4">E-Commerce</th>
                </tr>
              </thead>
              <tbody>
                {featureMatrix.map((row) => (
                  <tr key={row.feature} className="border-t border-white/5">
                    <th className="px-6 py-4 text-white">{row.feature}</th>
                    <td className="px-6 py-4">{row.healthcare}</td>
                    <td className="px-6 py-4">{row.realEstate}</td>
                    <td className="px-6 py-4">{row.legal}</td>
                    <td className="px-6 py-4">{row.ecommerce}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-16 text-center shadow-2xl backdrop-blur-xl">
            <h2 className="text-3xl font-semibold">Ready to Write Your Success Story?</h2>
            <p className="text-lg text-white/70">Join 500+ businesses delivering user ecstasy with BitB copilots.</p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/subscriptions"
                className="rounded-full bg-white px-10 py-4 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
              >
                Start free trial →
              </Link>
              <Link
                href="/connect"
                className="rounded-full border border-white/20 px-10 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Talk to sales →
              </Link>
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">
              Download full case study library from <Link href="/company/resources" className="underline">Resources</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
