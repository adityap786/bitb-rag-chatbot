"use client";

import * as React from "react";

const IMPACT_TONE: Record<string, string> = {
  High: "bg-rose-500/10 text-rose-200",
  Medium: "bg-amber-500/10 text-amber-200",
  Low: "bg-emerald-500/10 text-emerald-200",
};

const STATUS_TONE: Record<string, string> = {
  Mitigation: "text-amber-200",
  Monitoring: "text-sky-200",
  Resolved: "text-emerald-200",
  Open: "text-rose-200",
};

type EscalationEvent = {
  id: string;
  tenant: string;
  summary: string;
  impact: keyof typeof IMPACT_TONE;
  owner: string;
  opened: string;
  status: keyof typeof STATUS_TONE;
  details: string[];
};

type EscalationTimelineProps = {
  events: EscalationEvent[];
};

function EscalationTimeline({ events }: EscalationTimelineProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <ol className="space-y-6">
        {events.map((event, index) => {
          const isLast = index === events.length - 1;

          return (
            <li key={event.id} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <span className="flex h-3 w-3 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                {!isLast && <span className="mt-1 h-full w-px bg-emerald-400/40" aria-hidden="true" />}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">{event.tenant}</h3>
                  <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-200">
                    #{event.id}
                  </span>
                  <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-400">
                    Owner: {event.owner}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${IMPACT_TONE[event.impact]}`}
                  >
                    Impact: {event.impact}
                  </span>
                  <span className={`text-xs font-semibold ${STATUS_TONE[event.status]}`}>{event.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-300">{event.summary}</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-400">
                  {event.details.map((detail, detailIndex) => (
                    <li key={detailIndex} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 text-xs text-slate-500">Opened {event.opened}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type { EscalationEvent };
export default EscalationTimeline;
