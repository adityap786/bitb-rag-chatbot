"use client";

import { useMemo } from "react";
import type { AdminAnalytics } from "@/lib/admin/analytics";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

type AnalyticsWidgetsProps = {
  analytics: AdminAnalytics;
};

const conversationVolumeConfig = {
  chat: {
    label: "Chat",
    color: "rgba(96, 165, 250, 1)",
  },
  voice: {
    label: "Voice",
    color: "rgba(249, 115, 22, 1)",
  },
} satisfies ChartConfig;

const responseLatencyConfig = {
  median: {
    label: "Median",
    color: "rgba(45, 212, 191, 1)",
  },
  p95: {
    label: "P95",
    color: "rgba(147, 197, 253, 1)",
  },
} satisfies ChartConfig;

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function formatPercent(value: number) {
  return percentFormatter.format(value);
}

function AnalyticsWidgets({ analytics }: AnalyticsWidgetsProps) {
  const conversationSeries = analytics.conversationVolume.points;
  const responseLatencySeries = analytics.responseLatency.points;

  const conversationSummary = useMemo(() => {
    const delta = analytics.conversationVolume.weekOverWeekDelta;
    const direction = delta > 0 ? "increased" : "decreased";
    const label = formatPercent(delta);

    if (delta === 0) {
      return "Conversation volume was flat compared to last week.";
    }

    return `Conversation volume ${direction} ${label} vs last week.`;
  }, [analytics.conversationVolume.weekOverWeekDelta]);

  const latencySummary = useMemo(() => {
    const change = analytics.responseLatency.changePercent;
    const label = formatPercent(change);

    if (change === 0) {
      return {
        badge: "Flat vs prior period",
        blurb: "Latency was flat compared to the prior period.",
      };
    }

    const trend = change < 0 ? "improved" : "regressed";
    return {
      badge: `${label} vs prior period`,
      blurb: `Latency ${trend} ${label} vs the prior period.`,
    };
  }, [analytics.responseLatency.changePercent]);

  const totalInteractionsLabel = `${compactFormatter.format(
    analytics.conversationVolume.totalInteractions
  )} total this week`;

  const medianLatencyValue = analytics.responseLatency.currentMedianMs.toLocaleString("en-US");
  const p95LatencyValue = analytics.responseLatency.currentP95Ms.toLocaleString("en-US");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Conversation volume</h3>
            <p className="text-xs text-slate-400">{conversationSummary}</p>
          </div>
          <div className="rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            {totalInteractionsLabel}
          </div>
        </header>
        <ChartContainer id="conversation-volume" config={conversationVolumeConfig} className="h-[280px]">
          <AreaChart data={conversationSeries} margin={{ left: -8, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tick={{ fill: "rgba(148, 163, 184, 0.7)", fontSize: 12 }}
            />
            <YAxis hide domain={[0, "auto"]} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="chat"
              stackId="volume"
              stroke="var(--color-chat)"
              fill="var(--color-chat)"
              fillOpacity={0.3}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="voice"
              stackId="volume"
              stroke="var(--color-voice)"
              fill="var(--color-voice)"
              fillOpacity={0.3}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </article>
      <article className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Response latency</h3>
            <p className="text-xs text-slate-400">
              Median {medianLatencyValue} ms | P95 {p95LatencyValue} ms. {latencySummary.blurb}
            </p>
          </div>
          <div className="rounded-xl bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
            {latencySummary.badge}
          </div>
        </header>
        <ChartContainer id="response-latency" config={responseLatencyConfig} className="h-[280px]">
          <LineChart data={responseLatencySeries} margin={{ left: -4, right: 16, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tick={{ fill: "rgba(148, 163, 184, 0.7)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tick={{ fill: "rgba(148, 163, 184, 0.7)", fontSize: 12 }}
              tickFormatter={(value: number) => `${value} ms`}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="median"
              stroke="var(--color-median)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="p95"
              stroke="var(--color-p95)"
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </article>
    </div>
  );
}

export default AnalyticsWidgets;
