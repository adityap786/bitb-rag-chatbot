"use client";

import React from "react";
import type { FC } from "react";

interface CitationCardProps {
  source: any;
  conversationId?: string | null;
  messageId?: string | null;
  tenantId?: string | null;
}

const safeText = (v: any) => (typeof v === "string" ? v : JSON.stringify(v || "")).slice(0, 2000);

const CitationCard: FC<CitationCardProps> = ({ source, conversationId, messageId, tenantId }) => {
  const title = source?.title || source?.metadata?.title || (typeof source?.text === 'string' ? source.text.slice(0, 80) : 'Source');
  const url = source?.url || source?.metadata?.source_url || source?.metadata?.url || null;
  const excerpt = source?.excerpt || source?.text || source?.chunk || source?.metadata?.excerpt || '';
  const similarity = source?.similarity ?? source?.score ?? null;

  const trackClick = () => {
    if (!url) return;
    const payload = {
      tenantId: tenantId || null,
      conversationId: conversationId || null,
      messageId: messageId || null,
      sourceUrl: url,
      title,
    };

    try {
      // Prefer sendBeacon for navigation-safe telemetry
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/telemetry/citation-click', blob);
      } else {
        // fallback: keepalive fetch
        fetch('/api/telemetry/citation-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch (e) {
      // noop
    }
  };

  return (
    <div className="citation-card mb-2">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackClick}
          className="text-xs text-zinc-300 hover:text-white underline block"
        >
          {title}
        </a>
      ) : (
        <div className="text-xs text-zinc-400">{title}</div>
      )}
      {excerpt && (
        <div className="text-[11px] text-zinc-500 mt-1 line-clamp-3 break-words">{safeText(excerpt)}</div>
      )}
      {typeof similarity === 'number' && (
        <div className="text-[10px] text-zinc-500 mt-1">Confidence: {(similarity * 100).toFixed(0)}%</div>
      )}
    </div>
  );
};

export default CitationCard;
