import type { Metadata } from "next";
import "./globals.css";
import VisualEditsMessenger from "../visual-edits/VisualEditsMessenger";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import { ChatbotWidget } from "@/components/chatbot/ChatbotWidget";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "BiTB - RAG Chatbots for Service Businesses",
  description: "Turn your website into an AI assistant in minutes. 3-day free trial.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Performance hints for Spline embed */}
        <link rel="preconnect" href="https://my.spline.design" crossOrigin="" />
        <link rel="preconnect" href="https://assets.spline.design" crossOrigin="" />
        <link rel="dns-prefetch" href="https://my.spline.design" />
        <link rel="dns-prefetch" href="https://assets.spline.design" />
      </head>
      <body className="antialiased">
        <ErrorReporter />
        <Script
          src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
          strategy="afterInteractive"
          data-target-origin="*"
          data-message-type="ROUTE_CHANGE"
          data-include-search-params="true"
          data-only-in-iframe="true"
          data-debug="true"
          data-custom-data='{"appName": "YourApp", "version": "1.0.0", "greeting": "hi"}'
        />
        {children}
        <Toaster />
  <ChatbotWidget previewMode />
        <VisualEditsMessenger />
      </body>
    </html>
  );
}