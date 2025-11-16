'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brain, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MarketingNavItem = {
  label: string;
  href: string;
  description: string;
  badge?: string;
};

export const marketingNavItems: MarketingNavItem[] = [
  {
    label: 'Overview',
    href: '/',
    description: 'Product value, hero messaging, and feature rundown.',
  },
  {
    label: 'Case Studies',
    href: '/case-studies',
    description: 'Real results from healthcare, e-commerce, and service businesses.',
  },
  {
    label: 'Subscriptions',
    href: '/subscriptions',
    description: 'Transparent pricing from ₹5K/month. Free 3-day trial.',
  },
  {
    label: 'Documentation',
    href: '/documentation',
    description: 'Embed instructions, APIs, ingestion worker, and FAQs.',
  },
  {
    label: 'Company',
    href: '/company',
    description: 'Our story, team, resources, and open positions.',
  },
  {
    label: 'Connect',
    href: '/connect',
    description: 'Talk with our team, request onboarding, and launch trials.',
    badge: 'Book now',
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="mt-6 space-y-2">
      {marketingNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group block rounded-xl border border-white/5 bg-transparent px-4 py-3 transition hover:border-white/30 hover:bg-white/5',
              isActive && 'border-white/40 bg-white/10 shadow-lg'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium tracking-wide uppercase text-white/80">{item.label}</span>
              {item.badge ? (
                <span className="text-[10px] uppercase tracking-widest text-white/40 group-hover:text-white/80">{item.badge}</span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-white/50">{item.description}</p>
          </Link>
        );
      })}
    </nav>
  );
}

export function MarketingDesktopNav() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-black/70 px-5 py-8 backdrop-blur-lg lg:flex lg:flex-col lg:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">BiTB</p>
            <h2 className="text-lg font-semibold text-white">RAG Platform</h2>
          </div>
        </div>
        <NavList />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
        <p className="font-semibold text-white">Status</p>
        <p className="mt-1">Live preview mode with on-device embeddings and FAISS search.</p>
      </div>
    </aside>
  );
}

export function MarketingMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden border-b border-white/10 bg-black/60 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">BiTB</p>
            <h2 className="text-base font-semibold text-white">RAG Platform</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-lg border border-white/10 p-2 text-white transition hover:border-white/30 hover:bg-white/5"
          aria-expanded={open}
          aria-controls="marketing-mobile-nav"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="sr-only">Toggle navigation</span>
        </button>
      </div>
      {open ? (
        <div id="marketing-mobile-nav" className="border-t border-white/10 bg-black/80 px-4 pb-6">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
