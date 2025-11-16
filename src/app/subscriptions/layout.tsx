import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Transparent Pricing | BitB AI Chatbot Subscriptions",
  description: "Choose your plan: POTENTIAL (₹5K/month), SCALE (₹10K/month), or DOMINATE (Enterprise). 3-day free trial, no credit card required.",
};

export default function SubscriptionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
