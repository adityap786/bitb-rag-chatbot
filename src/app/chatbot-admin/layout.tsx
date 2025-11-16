import type { ReactNode } from "react";
import Link from "next/link";

const adminNavItems = [
  { label: "Dashboard", href: "/chatbot-admin" },
  { label: "Tenants", href: "/chatbot-admin/tenants" },
  { label: "Widget Settings", href: "/chatbot-admin/widget" },
  { label: "Operations", href: "/chatbot-admin/operations" },
];

type ChatbotAdminLayoutProps = {
  children: ReactNode;
};

export default function ChatbotAdminLayout({ children }: ChatbotAdminLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1600px] gap-8 px-6 py-10">
        <nav
          aria-label="Admin navigation"
          className="w-60 flex-shrink-0 rounded-2xl border border-white/10 bg-slate-900/70 p-6"
        >
          <div className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">BitB Admin</div>
          <ul className="space-y-3 text-sm">
            {adminNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-200"
                >
                  <span>{item.label}</span>
                  <span aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
