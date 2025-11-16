import Image from "next/image";
import Link from "next/link";

const storyParagraphs = [
  "BitsanBytes was born from a simple frustration: why do chatbots have to be either smart or beautiful? Why not both?",
  "In 2024, we set out to build the chatbot we wished existed—one that combines RAG-powered intelligence with obsessive design detail. One that speaks Hindi as fluently as English. One that delivers not just answers, but experiences.",
  "Today, 500+ businesses across India trust us to deliver user ecstasy to their customers. And we're just getting started.",
];

const missionBlocks = [
  {
    icon: "🎯",
    title: "Our Mission",
    description:
      "Make intelligent, beautiful chatbots accessible to every business in India—from solo clinics to global enterprises.",
  },
  {
    icon: "🔮",
    title: "Our Vision",
    description:
      "A world where every customer conversation is a moment of delight, powered by AI that truly understands context and intent.",
  },
  {
    icon: "💎",
    title: "Our Values",
    bullets: [
      "User ecstasy first: every decision starts with 'Will this delight users?'",
      "Intellect + design: we refuse to compromise between smart and beautiful.",
      "India-first: built for Indian businesses, with Hindi at the core.",
      "Radical transparency: no hidden fees, no dark patterns, ever.",
      "Obsessive quality: we ship when it's perfect, not when it's just okay.",
    ],
  },
];

const teamMembers = [
  {
    name: "Karthik Sharma",
    role: "Founder & CEO",
    photo: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80",
    bio: "Ex-Google engineer obsessed with AI and design. Started BitB after building internal copilots for APAC clients.",
    linkedin: "https://linkedin.com/in/karthik",
    twitter: "https://twitter.com/karthik",
  },
  {
    name: "Meera Jain",
    role: "Co-founder & CTO",
    photo: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=400&q=80",
    bio: "Previously scaled RAG systems at a unicorn SaaS company. Leads our platform, infra, and ML research.",
    linkedin: "https://linkedin.com/in/meerajain",
    twitter: "https://twitter.com/meeraj",
  },
  {
    name: "Ankit Deshpande",
    role: "Head of Design",
    photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    bio: "Designs conversational experiences that feel human. Ex-IDEO. Keeper of our design system and tone.",
    linkedin: "https://linkedin.com/in/ankitd",
    twitter: "https://twitter.com/ankitd",
  },
  {
    name: "Farah Qadri",
    role: "Head of Customer Success",
    photo: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80",
    bio: "Works hand-in-hand with customers to launch with speed. Loves putting human escalation workflows in place.",
    linkedin: "https://linkedin.com/in/farahq",
    twitter: "https://twitter.com/farahq",
  },
  {
    name: "Rohit Nair",
    role: "Lead AI Engineer",
    photo: "https://images.unsplash.com/photo-1544723795-43253727a1f5?auto=format&fit=crop&w=400&q=80",
    bio: "Ships core RAG pipelines, guardrails, and evaluation harnesses. Formerly at a healthcare AI startup.",
    linkedin: "https://linkedin.com/in/rohitnair",
    twitter: "https://twitter.com/rohit",
  },
  {
    name: "Aditi Kapoor",
    role: "Product Marketing Lead",
    photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    bio: "Tells the BitB story across channels. Focused on revenue ops, lifecycle, and education.",
    linkedin: "https://linkedin.com/in/aditikapoor",
    twitter: "https://twitter.com/aditik",
  },
];

const jobs = [
  {
    title: "Senior Frontend Engineer",
    location: "Remote / Ghaziabad",
    type: "Full-time",
    href: "/careers/frontend-engineer",
  },
  {
    title: "AI/ML Engineer",
    location: "Remote / Ghaziabad",
    type: "Full-time",
    href: "/careers/ml-engineer",
  },
  {
    title: "Implementation Specialist",
    location: "Bengaluru / Remote",
    type: "Full-time",
    href: "/careers/implementation-specialist",
  },
  {
    title: "Partnerships Manager",
    location: "Delhi NCR",
    type: "Full-time",
    href: "/careers/partnerships-manager",
  },
];

const pressMentions = [
  {
    outlet: "YourStory",
    headline: "Ghaziabad Startup Building AI Chatbots for Indian Businesses",
    href: "https://yourstory.com",
  },
  {
    outlet: "Inc42",
    headline: "BitsanBytes Raises Pre-Seed Round to Reinvent Conversational AI",
    href: "https://inc42.com",
  },
  {
    outlet: "Economic Times",
    headline: "How BitB Helps Indian Brands Deliver 24/7 Voice + Chat Support",
    href: "https://economictimes.indiatimes.com",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-24 bg-black py-24 text-white">
      <section>
        <div className="max-w-5xl mx-auto px-6 text-center space-y-6">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">About Us</p>
          <h1 className="text-4xl font-semibold md:text-5xl">We're Building the Future of Customer Conversations</h1>
          <p className="text-lg text-white/70">One intelligent chatbot at a time.</p>
        </div>
      </section>

      <section>
        <div className="max-w-4xl mx-auto space-y-6 px-6">
          <h2 className="text-3xl font-semibold">Our Story</h2>
          <div className="prose prose-invert max-w-none space-y-4 text-white/70">
            {storyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {missionBlocks.map((block) => (
              <div
                key={block.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
              >
                <div className="text-3xl">{block.icon}</div>
                <h3 className="mt-4 text-2xl font-semibold">{block.title}</h3>
                {block.description ? (
                  <p className="mt-3 text-sm text-white/70">{block.description}</p>
                ) : null}
                {block.bullets ? (
                  <ul className="mt-4 space-y-2 text-sm text-white/70">
                    {block.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span aria-hidden="true" className="mt-1 text-white/40">
                          ●
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto space-y-8 px-6">
          <h2 className="text-3xl font-semibold">Meet the Team</h2>
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {teamMembers.map((member) => (
              <article
                key={member.name}
                className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
              >
                <div className="space-y-4">
                  <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-white/10">
                    <Image src={member.photo} alt={member.name} fill className="object-cover object-center" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">{member.role}</p>
                    <h3 className="text-xl font-semibold text-white">{member.name}</h3>
                    <p className="text-sm text-white/70">{member.bio}</p>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-4 text-sm text-white/70">
                  <Link href={member.linkedin} target="_blank" className="hover:text-white">
                    LinkedIn
                  </Link>
                  <span className="text-white/40">•</span>
                  <Link href={member.twitter} target="_blank" className="hover:text-white">
                    X (Twitter)
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="text-center text-sm text-white/60">We're a small, mighty team of 12 based in India.</div>
        </div>
      </section>

      <section id="careers">
        <div className="max-w-6xl mx-auto px-6">
          <div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-12 text-center shadow-2xl backdrop-blur-xl">
            <h2 className="text-3xl font-semibold">Join Us</h2>
            <p className="text-lg text-white/70">
              We're hiring passionate builders who want to shape the future of AI conversations.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              {jobs.map((job) => (
                <div key={job.title} className="rounded-2xl border border-white/10 bg-black/40 p-6 text-left text-sm text-white/70">
                  <p className="text-sm font-semibold text-white">{job.title}</p>
                  <p className="mt-2">{job.location}</p>
                  <p className="text-white/60">{job.type}</p>
                  <Link href={job.href} className="mt-4 inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1">
                    View role <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
              <Link
                href="/careers"
                className="rounded-full bg-white px-10 py-4 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
              >
                View All Openings →
              </Link>
              <p className="text-sm text-white/60">
                Don't see your role? <a href="mailto:careers@bitsandbytes.ltd" className="underline">Send us your resume</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-4xl mx-auto px-6 text-center space-y-4">
          <h2 className="text-3xl font-semibold">Proudly Bootstrapped</h2>
          <p className="text-white/70">
            100% customer-funded. We answer to our users, not investors. Every rupee goes back into product and support.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto space-y-8 px-6">
          <h2 className="text-3xl font-semibold">In the News</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {pressMentions.map((mention) => (
              <Link
                key={mention.headline}
                href={mention.href}
                target="_blank"
                className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 shadow-2xl backdrop-blur-xl transition hover:border-white/40 hover:text-white"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">{mention.outlet}</p>
                <p className="mt-3 font-semibold text-white">{mention.headline}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-xs text-white/60">
                  Read article <span aria-hidden="true">↗</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70 shadow-2xl backdrop-blur-xl">
            <p>Press inquiries: <a href="mailto:press@bitsandbytes.ltd" className="underline">press@bitsandbytes.ltd</a></p>
            <Link href="/press-kit" className="mt-3 inline-flex items-center justify-center gap-2 text-sm text-white/80 hover:translate-y-[-1px]">
              Download Press Kit <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl font-semibold">Want to Know More?</h2>
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-10 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Get in Touch →
          </Link>
        </div>
      </section>
    </div>
  );
}
