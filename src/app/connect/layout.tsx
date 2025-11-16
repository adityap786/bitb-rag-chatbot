import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Contact Us | BitB - Let's Talk AI Chatbots",
  description: "Have questions? Need a demo? Book a call with our team or send us a message. We respond within 2-4 hours.",
};

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
