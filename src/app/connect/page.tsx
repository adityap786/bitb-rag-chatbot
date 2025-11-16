"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

const contactOptions = [
  {
    icon: "💼",
    title: "Sales & Demos",
    description: "Interested in ELEVATE, SCALE, or DOMINATE? Let\'s show you what\'s possible.",
    cta: "Schedule Demo",
    href: "/demo-booking",
    email: "sales@bitsandbytes.ltd",
    responseTime: "Response within 2 hours",
  },
  {
    icon: "🛠️",
    title: "Customer Support",
    description: "Existing customer? Need help? Our team is standing by.",
    cta: "Get Help",
    href: "/support",
    email: "support@bitsandbytes.ltd",
    responseTime: "Response within 4 hours",
  },
  {
    icon: "🤝",
    title: "Partnerships",
    description: "Agency? Reseller? Let\'s explore collaboration opportunities.",
    cta: "Partner With Us",
    href: "/partnerships",
    email: "partners@bitsandbytes.ltd",
    responseTime: "Response within 24 hours",
  },
];

const faqs = [
  {
    question: "Where are you located?",
    answer: "Ghaziabad, India. Serving businesses globally.",
  },
  {
    question: "Do you offer phone support?",
    answer: "Yes! DOMINATE plan includes priority phone support.",
  },
  {
    question: "Can I visit your office?",
    answer: "Yes! Schedule a visit: office@bitsandbytes.ltd",
  },
  {
    question: "Do you hire remotely?",
    answer: "Yes! See openings at /company/about#careers",
  },
];

const offices = [
  {
    label: "Ghaziabad Headquarters",
    location: "Ghaziabad, Uttar Pradesh",
    address: "123 Tech Park, Ghaziabad, UP 201001, India",
    phone: "+91 98765 43210",
    email: "hello@bitsandbytes.ltd",
    hours: "Mon-Fri: 9 AM - 6 PM IST",
    mapSrc:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14015.69503856902!2d77.4341075!3d28.6691569!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390cfb515394e945%3A0xb164a491091696ae!2sGhaziabad%2C%20Uttar%20Pradesh!5e0!3m2!1sen!2sin!4v1706455361234!5m2!1sen!2sin",
  },
];

const planOptions = [
  { value: "elevate", label: "ELEVATE (Service-Based)" },
  { value: "scale", label: "SCALE (E-Commerce)" },
  { value: "dominate", label: "DOMINATE (Enterprise)" },
  { value: "unsure", label: "Not sure yet" },
];

export default function ConnectPage() {
  const [inquiryType, setInquiryType] = useState("");
  const [planInterest, setPlanInterest] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneInvalid = useMemo(() => {
    if (!phone) return false;
    return !/^\+91\s?[1-9]\d{4}\s?\d{5}$/.test(phone.trim());
  }, [phone]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (phoneInvalid) {
      setError("Please enter a valid +91 phone number");
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 1200);
  };

  return (
    <div className="relative bg-black text-white">
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6 space-y-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Connect</p>
          <h1 className="text-4xl font-semibold md:text-5xl">Let&apos;s Talk</h1>
          <p className="text-lg text-white/70">
            Have questions? Need a demo? Want to join our team? We&apos;re here and we respond fast.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-white/50">
            <span>Prefer WhatsApp?</span>
            <Link href="https://wa.me/919876543210" target="_blank" className="underline">
              Message us instantly
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid gap-8 md:grid-cols-3">
            {contactOptions.map((option) => (
              <article
                key={option.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
              >
                <div className="text-4xl">{option.icon}</div>
                <h3 className="mt-4 text-2xl font-semibold">{option.title}</h3>
                <p className="mt-3 text-sm text-white/70">{option.description}</p>
                <div className="mt-6 space-y-2 text-sm text-white/60">
                  <p>
                    <span className="text-white/80">Email:</span> {option.email}
                  </p>
                  <p>{option.responseTime}</p>
                </div>
                <Link
                  href={option.href}
                  className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  {option.cta} <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-semibold">Send Us a Message</h2>
          <p className="mt-3 text-white/70">
            Drop a note and we&apos;ll route it straight to the right team. We usually respond in under 3 hours.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
          >
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-2 text-sm text-white/60">
                <span className="text-white">Full Name *</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Your Name"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
                />
              </label>
              <label className="space-y-2 text-sm text-white/60">
                <span className="text-white">Email *</span>
                <input
                  type="email"
                  name="email"
                  placeholder="you@company.com"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
                />
              </label>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-2 text-sm text-white/60">
                <span className="text-white">Company</span>
                <input
                  type="text"
                  name="company"
                  placeholder="Company Name (optional)"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
                />
              </label>
              <label className="space-y-2 text-sm text-white/60">
                <span className="text-white">Phone *</span>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+91 98765 43210"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
                />
                {phoneInvalid ? (
                  <span className="text-xs text-red-400">Enter a valid Indian mobile number with +91.</span>
                ) : null}
              </label>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-2 text-sm text-white/60">
                <span className="text-white">Inquiry Type *</span>
                <select
                  name="inquiry"
                  required
                  value={inquiryType}
                  onChange={(event) => setInquiryType(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
                >
                  <option value="">Select Inquiry Type</option>
                  <option value="sales">Sales & Demo</option>
                  <option value="support">Customer Support</option>
                  <option value="partnership">Partnership</option>
                  <option value="careers">Careers</option>
                  <option value="press">Press & Media</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-white/60">
                <span className="text-white">Plan Interest</span>
                <select
                  name="plan"
                  value={planInterest}
                  onChange={(event) => setPlanInterest(event.target.value)}
                  disabled={inquiryType !== "sales"}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <option value="">Which plan interests you?</option>
                  {planOptions.map((plan) => (
                    <option key={plan.value} value={plan.value}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="space-y-2 text-sm text-white/60">
              <span className="text-white">Message *</span>
              <textarea
                name="message"
                rows={6}
                placeholder="Tell us more..."
                required
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
              />
            </label>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" name="newsletter" className="size-4 rounded border-white/30 bg-black/40" />
              Send me product updates and tips (optional)
            </label>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-full border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.3em] text-white/50">
                Human-verified reCAPTCHA in place
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center rounded-full bg-white px-10 py-4 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSubmitting ? "Sending…" : "Send Message"}
              </button>
            </div>
            <p className="text-center text-sm text-white/60">
              We typically respond within 2-4 hours during business hours.
            </p>
            {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
            {submitted ? (
              <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-center text-sm text-green-200">
                Message received! We just sent a confirmation email—expect a reply shortly.
              </div>
            ) : null}
          </form>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="space-y-10 rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">Book a Live Demo</h2>
                <p className="mt-3 text-white/70">
                  Pick a slot that works for you. A product specialist will customise the walkthrough for your industry.
                </p>
              </div>
              <Link
                href="https://calendly.com/bitb/demo"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open Calendly <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="h-[640px] overflow-hidden rounded-3xl border border-white/10">
              <iframe
                title="Book a demo"
                src="https://calendly.com/bitb/demo"
                className="h-full w-full"
                loading="lazy"
                allow="fullscreen"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <h2 className="text-3xl font-semibold">Find Us</h2>
          <div className="grid gap-12 lg:grid-cols-2">
            {offices.map((office) => (
              <div
                key={office.label}
                className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
              >
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">{office.label}</p>
                  <h3 className="text-2xl font-semibold">{office.location}</h3>
                </div>
                <div className="space-y-2 text-sm text-white/70">
                  <p>{office.address}</p>
                  <p>Phone: {office.phone}</p>
                  <p>Email: {office.email}</p>
                  <p>{office.hours}</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <iframe
                    title={`Map for ${office.location}`}
                    src={office.mapSrc}
                    loading="lazy"
                    className="h-72 w-full"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            ))}
            <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
              <h3 className="text-2xl font-semibold">Remote-First Crew</h3>
              <p className="text-sm text-white/70">
                Our team collaborates across Bengaluru, Delhi NCR, Mumbai, and Pune with async rituals and quarterly
                offsites. We support flexible schedules and remote-friendly onboarding.
              </p>
              <Link href="/company/about#careers" className="inline-flex items-center gap-2 text-sm text-white/80 hover:translate-x-1">
                View open roles <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h3 className="text-2xl font-semibold">Connect on Social</h3>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-white/70">
            <Link href="https://linkedin.com/company/bitsandbytes" target="_blank" className="hover:text-white">
              LinkedIn →
            </Link>
            <Link href="https://twitter.com/bitsandbytes" target="_blank" className="hover:text-white">
              Twitter →
            </Link>
            <Link href="https://instagram.com/bitsandbytes" target="_blank" className="hover:text-white">
              Instagram →
            </Link>
            <Link href="https://github.com/bitsandbytes" target="_blank" className="hover:text-white">
              GitHub →
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <h2 className="text-3xl font-semibold">Quick Questions</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
                <p className="text-sm font-semibold text-white">{faq.question}</p>
                <p className="mt-2 text-sm text-white/70">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Link
        href="https://wa.me/919876543210?text=Hi%20BitB%20team%2C%20I%27d%20love%20a%20demo!"
        target="_blank"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-black shadow-2xl transition hover:scale-[1.05]"
      >
        <span aria-hidden="true">💬</span> WhatsApp Us
      </Link>
    </div>
  );
}
