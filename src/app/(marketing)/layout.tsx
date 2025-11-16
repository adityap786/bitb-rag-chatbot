import type { ReactNode } from "react";
import Link from "next/link";
import type { MarketingNavItem } from "@/components/marketing/MarketingNav";
import { MarketingDesktopNav, MarketingMobileNav, marketingNavItems } from "@/components/marketing/MarketingNav";

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#050505] text-white flex">
      <MarketingDesktopNav />
      <div className="flex-1 flex flex-col">
        <MarketingMobileNav />
        <header className="border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/40">BiTB Platform</p>
              <h1 className="text-lg font-semibold">RAG chatbots that stay on brand and on budget</h1>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <Link
                href="/connect"
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/5"
              >
                Request Demo
              </Link>
              <Link
                href="/subscriptions"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-10">
            {children}
          </div>
        </main>
        <footer className="border-t border-white/10 bg-black/60">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} BiTB. All rights reserved.</p>
            <nav className="flex flex-wrap gap-4">
              {marketingNavItems.map((item: MarketingNavItem) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
