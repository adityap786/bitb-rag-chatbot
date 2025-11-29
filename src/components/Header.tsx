"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/documentation', label: 'Documentation' },
  { href: '/subscriptions', label: 'Subscription' },
  { href: '/company', label: 'Company' },
  { href: '/trial', label: 'Playground' },
];

export default function Header() {
  const [visible, setVisible] = useState(true);
  const lastScroll = useRef(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const curr = window.scrollY;
          if (curr < lastScroll.current) {
            setVisible(true); // show on scroll up
          } else if (curr > lastScroll.current + 10) {
            setVisible(false); // hide on scroll down
          }
          lastScroll.current = curr;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`w-full top-0 left-0 z-40 transition-transform duration-300 ${visible ? 'translate-y-0' : '-translate-y-full'} bg-black/90 border-b border-white/10`}
      style={{ position: 'fixed' }}
    >
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
        <Link href="/" className="text-lg font-bold text-white tracking-tight">BiTB</Link>
        <ul className="flex gap-6">
          {NAV_LINKS.map(link => (
            <li key={link.href}>
              <Link href={link.href} className="text-white/80 hover:text-white transition-colors text-sm font-medium">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
