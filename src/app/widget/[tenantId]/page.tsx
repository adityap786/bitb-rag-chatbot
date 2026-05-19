'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ChatbotWidget } from '@/components/chatbot/ChatbotWidget';

/**
 * Universal Widget Page for iframe embedding
 * 
 * This page serves as an embeddable widget endpoint for external platforms
 * like Wix, Shopify, WordPress, Framer, etc. It renders the ChatbotWidget
 * in full-screen mode suitable for iframe embedding.
 * 
 * Usage:
 * <iframe src="https://your-domain.com/widget/{tenantId}" ...></iframe>
 */

function WidgetPageContent() {
    const params = useParams();
    const tenantId = params?.tenantId as string;

    if (!tenantId) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-black text-white">
                <p>Missing tenant ID</p>
            </div>
        );
    }

    return (
        <div
            className="widget-embed-container"
            style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                margin: 0,
                padding: 0,
                overflow: 'hidden',
                backgroundColor: 'transparent',
            }}
        >
            <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
          background: transparent;
        }
        /* Override widget positioning for iframe mode */
        #bitb-widget-root,
        [class*="fixed"] {
          position: absolute !important;
          inset: 0 !important;
          bottom: auto !important;
          right: auto !important;
        }
      `}</style>
            <ChatbotWidget previewMode={false} />
        </div>
    );
}

export default function WidgetPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen bg-black text-white">
                    <div className="animate-pulse">Loading widget...</div>
                </div>
            }
        >
            <WidgetPageContent />
        </Suspense>
    );
}
