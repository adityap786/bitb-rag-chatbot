"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

const INR_TO_USD = 0.012;
const YEARLY_DISCOUNT = 0.8;

const plans = [
	{
		name: "POTENTIAL",
		slug: "potential",
		tagline: "For Service-Based Businesses",
		description: "Elevate your customer experience with intelligent conversations.",
		baseInr: 5000,
		conversations: "5,000 conversations/month",
		popular: false,
		cta: "Start Free Trial",
		features: [
			"5,000 conversations/month",
			"5 domains",
			"50MB document storage",
			"Appointment booking",
			"Lead capture & categorization",
			"Voice greetings (Hindi/English)",
			"RAG-powered answers",
			"Email support",
			"Basic analytics",
			"Human escalation",
		],
		idealFor: [
			"Healthcare (clinics, hospitals)",
			"Legal services (law firms)",
			"Real estate (agencies)",
			"Restaurants & hospitality",
		],
	},
	{
		name: "SCALE",
		slug: "scale",
		tagline: "For E-Commerce",
		description: "Scale your sales with AI-powered shopping assistance.",
		baseInr: 10000,
		conversations: "10,000 conversations/month",
		popular: true,
		cta: "Start Free Trial",
		features: [
			"10,000 conversations/month",
			"10 domains",
			"200MB document storage",
			"Product recommendations",
			"Cart abandonment recovery",
			"Order tracking integration",
			"Upsell & cross-sell automation",
			"Priority support (24-hour response)",
			"Advanced analytics dashboard",
			"Shopify/WooCommerce integration",
			"Size/fit assistance",
			"Multi-currency support",
		],
		idealFor: [
			"Online stores",
			"D2C brands",
			"Fashion & apparel",
			"Electronics retailers",
		],
	},
	{
		name: "DOMINATE",
		slug: "dominate",
		tagline: "For Enterprise",
		description: "Dominate your market with unlimited AI intelligence.",
		baseInr: 0,
		conversations: "Unlimited conversations",
		popular: false,
		cta: "Contact Sales",
		features: [
			"Unlimited conversations",
			"Unlimited domains",
			"Unlimited document storage",
			"White-label branding",
			"Custom integrations",
			"Multi-channel (web, mobile, WhatsApp)",
			"Dedicated account manager",
			"API access",
			"SSO (Single Sign-On)",
			"99.9% uptime SLA",
			"Custom AI training",
			"Advanced security & compliance",
			"Team collaboration tools",
			"Priority phone support",
		],
		idealFor: [
			"Multi-location businesses",
			"Corporate organisations (500+ employees)",
			"Franchise networks",
			"Global brands",
		],
	},
] as const;

const addOns = [
	{ title: "Extra Conversations", description: "₹500 per additional 1,000 conversations." },
	{ title: "Additional Domain", description: "₹200/month for every extra domain." },
	{ title: "WhatsApp Integration", description: "₹1,500/month with verified business onboarding." },
	{ title: "Advanced Analytics", description: "₹999/month for cohort & attribution reporting." },
	{ title: "Custom AI Training", description: "₹5,000 one-time white-glove knowledge base tuning." },
	{ title: "Priority Onboarding", description: "₹2,999 one-time implementation concierge." },
];

const faqs = [
	{
		question: "Can I change plans anytime?",
		answer: "Yes. Upgrade instantly from the dashboard. Downgrades apply at the end of your billing cycle.",
	},
	{
		question: "What happens if I exceed my conversation limit?",
		answer:
			"Your copilot keeps working. We notify you so you can upgrade or bolt-on extra conversations without downtime.",
	},
	{
		question: "Do you offer discounts for annual payments?",
		answer: "Absolutely. Pay yearly and save 20% automatically applied at checkout.",
	},
	{
		question: "Is there a free trial?",
		answer: "Yes. 3 days, 30 conversations, every feature unlocked. No card required.",
	},
	{
		question: "What payment methods do you accept?",
		answer:
			"UPI, credit & debit cards, net banking, Razorpay, and international cards. Invoices available on request.",
	},
	{
		question: "Can I cancel anytime?",
		answer: "Yes. Cancel in two clicks. Export your transcripts & knowledge base before leaving.",
	},
	{
		question: "Do you offer refunds?",
		answer: "We provide a 14-day money-back guarantee if BitB isn't the right fit.",
	},
	{
		question: "Is my data safe?",
		answer:
			"Every tenant is encrypted, GDPR-aligned, and our infrastructure follows ISO 27001-aligned controls.",
	},
];

const testimonials = [
	{
		quote: "We closed 25% more renewals after switching to SCALE. The cart recovery nudges are chef's kiss.",
		author: "Nikita Rao",
		role: "Head of Growth, PlushNest",
	},
	{
		quote: "Setup took under a week. Our clinics now triage patients automatically—no midnight phone duty.",
		author: "Dr. Arjun Mehta",
		role: "COO, Evercare Clinics",
	},
	{
		quote: "DOMINATE let us plug BitB into Salesforce and WhatsApp in record time. The uptime is rock solid.",
		author: "Sana Qureshi",
		role: "CX Director, QuantumTel",
	},
];

const trustLogos = [
	"MediCare Hospital",
	"Skyline Properties",
	"LegalEase Associates",
	"FashionHub",
	"TechMart",
	"Evercare Clinics",
	"QuantumTel",
	"PlushNest",
	"DigiBank",
	"FreshFarm Foods",
	"Orbit Travels",
	"AlphaFin",
	"Glow Cosmetics",
	"CraftCart",
	"InstaRepair",
];

type BillingInterval = "monthly" | "yearly";
type Currency = "INR" | "USD";

type Plan = (typeof plans)[number];

function getPrice(inrAmount: number, billingInterval: BillingInterval, currency: Currency) {
	if (inrAmount === 0) {
		return { label: "Custom Pricing", subtitle: "Talk to us", value: 0 };
	}

	const base = billingInterval === "monthly" ? inrAmount : inrAmount * 12 * YEARLY_DISCOUNT;
	const formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	});
	const converted = currency === "INR" ? base : Math.round(base * INR_TO_USD);
	const label = formatter.format(converted);
	const subtitle = billingInterval === "monthly" ? "per month" : "per year (Save 20%)";

	return { label, subtitle, value: converted };
}

function ROIWidget() {
	const [visitors, setVisitors] = useState(5000);
	const [conversionRate, setConversionRate] = useState(2.5);
	const [avgOrderValue, setAvgOrderValue] = useState(3200);
	const [uplift, setUplift] = useState(40);

	const baselineRevenue = useMemo(() => {
		return (visitors * (conversionRate / 100)) * avgOrderValue;
	}, [visitors, conversionRate, avgOrderValue]);

	const incrementalRevenue = useMemo(() => {
		return baselineRevenue * (uplift / 100);
	}, [baselineRevenue, uplift]);

		const paybackWeeks = useMemo(() => {
			const monthlySpend = Number(plans[1].baseInr);
			if (monthlySpend <= 0) return 0;
			const weeklyIncremental = incrementalRevenue / 13;
			if (weeklyIncremental <= 0) return 0;
			return Math.max(0, monthlySpend / weeklyIncremental);
		}, [incrementalRevenue]);

	return (
		<section className="py-24">
			<div className="max-w-6xl mx-auto px-6">
				<div className="rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl">
					<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
						<div className="max-w-lg space-y-4">
							<h2 className="text-3xl font-semibold">Estimate Your ROI</h2>
							<p className="text-white/70">
								Plug in your numbers to see how quickly BitB pays for itself. We apply real-world uplift based on
								hundreds of live deployments.
							</p>
						</div>
						<div className="grid w-full gap-4 sm:grid-cols-2">
							<label htmlFor="visitors" className="space-y-2 text-sm text-white/70">
								<span className="text-white">Monthly visitors</span>
								<input
									id="visitors"
									name="visitors"
									type="number"
									min={0}
									value={visitors}
									onChange={(event) => setVisitors(Number(event.target.value))}
									className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
								/>
							</label>
							<label htmlFor="conversionRate" className="space-y-2 text-sm text-white/70">
								<span className="text-white">Conversion rate (%)</span>
								<input
									id="conversionRate"
									name="conversionRate"
									type="number"
									min={0}
									step={0.1}
									value={conversionRate}
									onChange={(event) => setConversionRate(Number(event.target.value))}
									className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
								/>
							</label>
							<label htmlFor="avgOrderValue" className="space-y-2 text-sm text-white/70">
								<span className="text-white">Average order value (₹)</span>
								<input
									id="avgOrderValue"
									name="avgOrderValue"
									type="number"
									min={0}
									value={avgOrderValue}
									onChange={(event) => setAvgOrderValue(Number(event.target.value))}
									className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
								/>
							</label>
							<label htmlFor="uplift" className="space-y-2 text-sm text-white/70">
								<span className="text-white">Expected uplift (%)</span>
								<input
									id="uplift"
									name="uplift"
									type="number"
									min={0}
									step={5}
									value={uplift}
									onChange={(event) => setUplift(Number(event.target.value))}
									className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-white/40"
								/>
							</label>
						</div>
					</div>
					<div className="mt-10 grid gap-6 sm:grid-cols-3">
						<div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Baseline revenue</p>
							<p className="mt-3 text-3xl font-semibold text-white">
								₹{Math.round(baselineRevenue).toLocaleString("en-IN")}
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Incremental revenue</p>
							<p className="mt-3 text-3xl font-semibold text-white">
								₹{Math.round(incrementalRevenue).toLocaleString("en-IN")}
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Payback period</p>
							<p className="mt-3 text-3xl font-semibold text-white">
								{paybackWeeks > 0 ? `${paybackWeeks.toFixed(1)} weeks` : "< 1 week"}
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function PlanCard({
	plan,
	billingInterval,
	currency,
}: {
	plan: Plan;
	billingInterval: BillingInterval;
	currency: Currency;
}) {
	const price = useMemo(
		() => getPrice(plan.baseInr, billingInterval, currency),
		[plan.baseInr, billingInterval, currency]
	);

	return (
		<article
			className={cn(
				"group flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10",
				plan.popular && "ring-2 ring-white/60 ring-offset-2 ring-offset-black"
			)}
		>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							{plan.tagline}
						</p>
						<h3 className="text-2xl font-semibold">{plan.name}</h3>
					</div>
					{plan.popular ? (
						<span className="rounded-full bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-black shadow-lg">
							Most Popular
						</span>
					) : null}
				</div>
				<p className="text-white/70">{plan.description}</p>
				<div className="space-y-1">
					<p className="text-4xl font-semibold transition duration-500 group-hover:translate-y-[-2px]">
						{price.label}
					</p>
					<p className="text-sm text-white/60">{price.subtitle}</p>
				</div>
				<p className="text-sm text-white/60">{plan.conversations}</p>
			</div>
			<div className="mt-8 space-y-6">
				<ul className="space-y-3 text-sm text-white/70">
					{plan.features.map((feature) => (
						<li key={feature} className="flex items-start gap-2">
							<span aria-hidden="true" className="mt-1 text-white/40">
								●
							</span>
							<span>{feature}</span>
						</li>
					))}
				</ul>
				<div className="space-y-3">
					<p className="text-xs uppercase tracking-[0.3em] text-white/50">Ideal for</p>
					<ul className="space-y-2 text-sm text-white/70">
						{plan.idealFor.map((item) => (
							<li key={item} className="flex items-start gap-2">
								<span aria-hidden="true" className="mt-1 text-white/40">
									→
								</span>
								<span>{item}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
			<div className="mt-8">
				<Link
					href={plan.slug === "dominate" ? "/connect" : "/signup"}
					className={cn(
						"flex w-full items-center justify-center rounded-full px-8 py-4 text-sm font-semibold transition",
						plan.popular
							? "bg-white text-black shadow-xl hover:scale-[1.02]"
							: "border border-white/20 text-white hover:bg-white/10"
					)}
				>
					{plan.cta}
				</Link>
			</div>
		</article>
	);
}

export default function SubscriptionsPage() {
	const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
	const [currency, setCurrency] = useState<Currency>("INR");

	return (
		<div className="bg-black text-white">
			<Header />
			<section className="py-24">
				<div className="max-w-6xl mx-auto px-6 space-y-8 text-center">
					<div className="space-y-4">
						<p className="text-xs uppercase tracking-[0.3em] text-white/60">Pricing</p>
						<h1 className="text-4xl font-semibold md:text-5xl">
							Transparent Pricing. Zero Surprises.
						</h1>
						<p className="text-lg text-white/70">
							Choose the plan that fits your business. Upgrade, downgrade, or cancel anytime with no lock-ins.
						</p>
					</div>
					<div className="flex flex-col items-center justify-center gap-6 md:flex-row">
						<div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 p-1">
							{(["monthly", "yearly"] as BillingInterval[]).map((interval) => (
								<button
									key={interval}
									type="button"
									onClick={() => setBillingInterval(interval)}
									className={cn(
										"rounded-full px-6 py-2 text-sm font-medium transition",
										billingInterval === interval
											? "bg-white text-black"
											: "text-white/70 hover:text-white"
									)}
								>
									{interval === "monthly" ? "Monthly" : "Yearly"}
								</button>
							))}
							{billingInterval === "yearly" ? (
								<span className="ml-2 hidden rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold uppercase text-red-300 md:inline-flex">
									Save 20%
								</span>
							) : null}
						</div>
						<div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 p-1">
							{(["INR", "USD"] as Currency[]).map((option) => (
								<button
									key={option}
									type="button"
									onClick={() => setCurrency(option)}
									className={cn(
										"rounded-full px-6 py-2 text-sm font-medium transition",
										currency === option
											? "bg-white text-black"
											: "text-white/70 hover:text-white"
									)}
								>
									{option}
								</button>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="py-24">
				<div className="max-w-7xl mx-auto px-6">
					<div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
						{plans.map((plan) => (
							<PlanCard
								key={plan.slug}
								plan={plan}
								billingInterval={billingInterval}
								currency={currency}
							/>
						))}
					</div>
				</div>
			</section>

			<section className="py-24">
				<div className="max-w-5xl mx-auto px-6 space-y-12 text-center">
					<h2 className="text-3xl font-semibold">Teams trust BitB to unlock revenue</h2>
					<div className="grid gap-8 md:grid-cols-3">
						{testimonials.map((testimonial) => (
							<blockquote
								key={testimonial.author}
								className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
							>
								<p className="text-lg text-white/80">“{testimonial.quote}”</p>
								<footer className="mt-6 text-sm text-white/50">
									<p className="font-semibold text-white">{testimonial.author}</p>
									<p>{testimonial.role}</p>
								</footer>
							</blockquote>
						))}
					</div>
				</div>
			</section>

			<section className="py-24">
				<div className="max-w-7xl mx-auto px-6 space-y-8">
					<h2 className="text-3xl font-semibold">Compare All Features</h2>
					<div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
						<table className="w-full table-fixed border-collapse text-left text-sm text-white/80">
							<thead className="bg-white/10 text-xs uppercase tracking-[0.3em] text-white/60">
								<tr>
									<th className="px-6 py-4">Feature</th>
									<th className="px-6 py-4">POTENTIAL</th>
									<th className="px-6 py-4">SCALE</th>
									<th className="px-6 py-4">DOMINATE</th>
								</tr>
							</thead>
							<tbody>
								{[
									["Conversations/month", "5,000", "10,000", "Unlimited"],
									["Domains", "5", "10", "Unlimited"],
									["Document storage", "50MB", "200MB", "Unlimited"],
									["RAG intelligence", "✅", "✅", "✅"],
									["Voice greetings", "✅", "✅", "✅"],
									["Hindi/English support", "✅", "✅", "✅"],
									["Lead capture", "✅", "✅", "✅"],
									["Appointment booking", "✅", "⚠️", "✅"],
									["Product recommendations", "❌", "✅", "✅"],
									["Cart recovery", "❌", "✅", "✅"],
									["White label", "❌", "❌", "✅"],
									["API access", "❌", "⚠️", "✅"],
									["Custom integrations", "❌", "⚠️", "✅"],
									["Dedicated account manager", "❌", "❌", "✅"],
									["Support", "Email", "Priority", "Phone"],
									["Analytics", "Basic", "Advanced", "Enterprise"],
									["Uptime SLA", "99%", "99.5%", "99.9%"],
								].map(([feature, potential, scale, dominate]) => (
									<tr key={feature} className="border-t border-white/5">
										<th className="px-6 py-4 text-white">{feature}</th>
										<td className="px-6 py-4">{potential}</td>
										<td className="px-6 py-4">{scale}</td>
										<td className="px-6 py-4">{dominate}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<section className="py-24">
				<div className="max-w-6xl mx-auto px-6 space-y-8">
					<h2 className="text-3xl font-semibold">Power Up with Add-Ons</h2>
					<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
						{addOns.map((addon) => (
							<div
								key={addon.title}
								className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10"
							>
								<h3 className="text-xl font-semibold text-white">{addon.title}</h3>
								<p className="mt-3 text-sm text-white/70">{addon.description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<ROIWidget />

			<section className="py-24">
				<div className="max-w-4xl mx-auto px-6">
					<h2 className="text-3xl font-semibold">Pricing Questions Answered</h2>
					<Accordion type="single" collapsible className="mt-8 divide-y divide-white/10">
						{faqs.map((faq, index) => (
							<AccordionItem key={faq.question} value={`item-${index}`}>
								<AccordionTrigger className="text-base text-white">
									{faq.question}
								</AccordionTrigger>
								<AccordionContent className="text-sm text-white/70">
									{faq.answer}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</section>

			<section className="py-24">
				<div className="max-w-6xl mx-auto px-6 text-center">
					<h3 className="text-2xl font-semibold">Trusted by 500+ Businesses</h3>
					<div className="mt-10 grid gap-6 md:grid-cols-3 xl:grid-cols-5">
						{trustLogos.map((logo) => (
							<div
								key={logo}
								className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium uppercase tracking-[0.2em] text-white/40"
							>
								{logo}
							</div>
						))}
					</div>
					<div className="mt-12 flex flex-wrap items-center justify-center gap-4 text-sm text-white/60">
						<span className="rounded-full border border-white/20 px-4 py-2">✅ 99.9% Uptime</span>
						<span className="rounded-full border border-white/20 px-4 py-2">✅ GDPR Compliant</span>
						<span className="rounded-full border border-white/20 px-4 py-2">✅ ISO 27001 Ready</span>
						<span className="rounded-full border border-white/20 px-4 py-2">✅ 24/7 Support</span>
					</div>
				</div>
			</section>

			<section className="py-24">
				<div className="max-w-4xl mx-auto px-6">
					<div className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-16 text-center shadow-2xl backdrop-blur-xl">
						<h2 className="text-3xl font-semibold">Start Delivering User Ecstasy Today</h2>
						<p className="text-lg text-white/70">
							Free trial. No credit card. Setup in 6 minutes flat.
						</p>
						<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
							<Link
								href="/signup"
								className="rounded-full bg-white px-10 py-4 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
							>
								Start Free Trial
							</Link>
							<Link
								href="/connect"
								className="rounded-full border border-white/20 px-10 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
							>
								Talk to our team →
							</Link>
						</div>
						<p className="text-sm text-white/60">
							Prefer a guided tour?{" "}
							<Link href="/connect" className="underline">
								Schedule a live walkthrough
							</Link>
							.
						</p>
					</div>
				</div>
			</section>

			<div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-full border border-white/10 bg-white/5 px-6 py-4 shadow-2xl backdrop-blur-xl">
				<div className="flex flex-col items-center justify-between gap-4 text-sm text-white/80 md:flex-row">
					<p className="text-center md:text-left">
						Ready in minutes. Cancel anytime. Annual subscriptions auto-apply 20% savings.
					</p>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Link
							href="/signup"
							className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
						>
							Start Trial
						</Link>
						<Link
							href="/connect"
							className="rounded-full border border-white/20 px-6 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
						>
							Book a Demo
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}