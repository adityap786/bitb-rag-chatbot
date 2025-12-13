"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { LegendPayload, LegendProps } from "recharts";
import type {
  NameType,
  Payload as DefaultTooltipPayload,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

type ChartConfigEntry = {
  label?: React.ReactNode;
  icon?: React.ComponentType;
} & (
  | { color?: string; theme?: never }
  | { color?: never; theme: Record<keyof typeof THEMES, string> }
);

export type ChartConfig = Record<string, ChartConfigEntry>;

type ChartContextProps = {
  config: ChartConfig;
};

type TooltipItem = DefaultTooltipPayload<ValueType, NameType>;
type TooltipItems = TooltipItem[];

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
  id?: string;
};

function ChartContainer({ id, className, children, config, ...props }: ChartContainerProps) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {mounted ? (
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        ) : null}
      </div>
    </ChartContext.Provider>
  );
}

type ChartStyleProps = {
  id: string;
  config: ChartConfig;
};

const ChartStyle = ({ id, config }: ChartStyleProps) => {
  const colorConfig = (Object.entries(config) as [string, ChartConfigEntry][]).filter(([, entry]) =>
    entry.theme || entry.color
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, entry]) => {
    const color = entry.theme?.[theme as keyof typeof entry.theme] ?? entry.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  payload?: TooltipItems;
  label?: React.ReactNode;
  labelFormatter?: (
    value: React.ReactNode,
    payload?: TooltipItems
  ) => React.ReactNode;
  labelClassName?: string;
  formatter?: (
    value: TooltipItem["value"],
    name: TooltipItem["name"],
    entry: TooltipItem,
    index: number,
    payload: TooltipItems
  ) => React.ReactNode;
  indicator?: "line" | "dashed" | "dot";
  hideLabel?: boolean;
  hideIndicator?: boolean;
  color?: string;
  nameKey?: string;
  labelKey?: string;
};

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
  ...rest
}: ChartTooltipContentProps) {
  const { config } = useChart();
  const typedPayload: TooltipItems = payload ?? [];

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !typedPayload.length) {
      return null;
    }

    const [item] = typedPayload;
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label;

    if (labelFormatter) {
      return <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, typedPayload)}</div>;
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [label, labelFormatter, typedPayload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !typedPayload.length) {
    return null;
  }

  const nestLabel = typedPayload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
      {...rest}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {typedPayload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = color || (item.payload as { fill?: string } | null | undefined)?.fill || item.color;

          const rawValue = item.value;
          const numericValue =
            typeof rawValue === "number"
              ? rawValue
              : typeof rawValue === "string"
              ? Number(rawValue)
              : undefined;

          return (
            <div
              key={item.dataKey != null ? String(item.dataKey) : index}
              className={cn(
                "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                indicator === "dot" && "items-center"
              )}
            >
              {formatter && item.value !== undefined && item.name !== undefined ? (
                formatter(item.value, item.name, item, index, typedPayload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                          {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          }
                        )}
                        style={
                          {
                            "--color-bg": indicatorColor,
                            "--color-border": indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      "flex flex-1 justify-between leading-none",
                      nestLabel ? "items-end" : "items-center"
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
                    </div>
                    {numericValue !== undefined && !Number.isNaN(numericValue) ? (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {numericValue.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

type ChartLegendContentProps = React.HTMLAttributes<HTMLDivElement> & {
  payload?: LegendPayload[];
  verticalAlign?: LegendProps["verticalAlign"];
  hideIcon?: boolean;
  nameKey?: string;
};

function ChartLegendContent({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey, ...rest }: ChartLegendContentProps) {
  const { config } = useChart();
  const typedPayload: LegendPayload[] = payload ?? [];

  if (!typedPayload.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
      {...rest}
    >
      {typedPayload.map((item, index) => {
        const key = `${nameKey || item.dataKey || "value"}`;
        const itemConfig = getPayloadConfigFromPayload(config, item, key);
        const fallbackKey = item.dataKey != null ? String(item.dataKey) : index;
        const uniqueKey =
          typeof item.value === "string" || typeof item.value === "number"
            ? item.value
            : fallbackKey;

        return (
          <div
            key={uniqueKey}
            className={cn("[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3")}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color ?? "var(--color-value, #fff)",
                }}
              />
            )}
            {itemConfig?.label ?? item.value}
          </div>
        );
      })}
    </div>
  );
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
): ChartConfigEntry | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadRecord = payload as Record<string, unknown> & {
    payload?: Record<string, unknown> | null;
  };

  let configLabelKey = key;

  if (typeof payloadRecord[key] === "string") {
    configLabelKey = payloadRecord[key] as string;
  } else if (payloadRecord.payload && typeof payloadRecord.payload[key] === "string") {
    configLabelKey = payloadRecord.payload[key] as string;
  }

  if (configLabelKey in config) {
    return config[configLabelKey];
  }

  return config[key];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
