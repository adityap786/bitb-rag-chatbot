export type MarketingNavItem = {
  label: string;
  href: string;
  description: string;
  badge?: string;
};

export const marketingNavItems: MarketingNavItem[] = [
  {
    label: "Overview",
    href: "/",
    description: "Product value, hero messaging, and feature rundown.",
  },
  {
    label: "Case Studies",
    href: "/case-studies",
    description: "Real results from healthcare, e-commerce, and service businesses.",
  },
  {
    label: "Subscriptions",
    href: "/subscriptions",
    description: "Transparent pricing from ₹5K/month. Free 3-day trial.",
  },
  {
    label: "Documentation",
    href: "/documentation",
    description: "Embed instructions, APIs, ingestion worker, and FAQs.",
  },
  {
    label: "Company",
    href: "/company",
    description: "Our story, team, resources, and open positions.",
  },
  {
    label: "Connect",
    href: "/connect",
    description: "Talk with our team, request onboarding, and launch trials.",
    badge: "Book now",
  },
];
