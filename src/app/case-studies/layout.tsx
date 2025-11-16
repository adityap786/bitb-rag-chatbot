import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Case Studies & Solutions | BitB - AI Chatbot Success Stories",
  description: "See how 500+ businesses across India deliver user ecstasy with BitB AI chatbots. Real results from healthcare, e-commerce, legal, and real estate.",
};

export default function CaseStudiesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
