import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  { href: "/company", label: "Overview" },
  { href: "/company/about", label: "About Us" },
  { href: "/company/resources", label: "Resources" },
];

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-black text-white">
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Company</p>
            <h1 className="text-3xl font-semibold md:text-4xl">Built in India. Scaling globally.</h1>
            <p className="mt-3 text-sm text-white/60">
              Explore our story, the team behind BitB, and the playbooks we share with our community.
            </p>
          </div>
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
          >
            Talk to us <span aria-hidden="true">→</span>
          </Link>
        </div>
        <nav className="border-t border-white/10">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-white/10 px-5 py-2 text-white/70 transition hover:border-white/40 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
