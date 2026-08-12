"use client";

/**
 * How one piece is doing.
 *
 * The same six numbers as the shop-wide table in Analytics, for a single
 * product, because a figure that means one thing on one screen and something
 * slightly different on another is worse than no figure. They count *people*,
 * not events — "38 people saw it" is not a number you can inflate by
 * scrolling up and down.
 *
 * The three columns are arranged to read as a diagnosis: seen but not opened
 * is a thumbnail problem, opened but not carted is a price or photo problem,
 * carted but not bought is a delivery problem.
 */
import { useCallback } from "react";

import { api, type AdminProduct } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";

import { TrendArea } from "../ui/charts";
import { EmptyState, LoadError, Num, Popup, Ratio, Skeleton, Stat, Text } from "../ui/primitives";

export function ProductAnalyticsPopup({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const stats = useConsoleQuery(
    `product-analytics:${product.id}`,
    useCallback(() => api.productAnalytics(product.id), [product.id]),
  );

  const data = stats.data;
  const quiet = data ? data.saw === 0 && data.opened === 0 : false;

  return (
    <Popup
      open
      title={<Text>{product.title_en}</Text>}
      sub={data ? `${data.period.from} → ${data.period.to}` : "Last 30 days"}
      width={760}
      onClose={onClose}
    >
      {stats.error && !data ? <LoadError message={stats.error} onRetry={stats.reload} /> : null}
      {stats.loading ? <Skeleton height={220} /> : null}

      {data ? (
        quiet ? (
          <EmptyState
            title="Nobody has seen this one yet."
            hint="Either it is new, or the feed is not showing it. Publishing it and giving it a boost are the two levers."
          />
        ) : (
          <>
            <div className="console-stat-grid cols-3">
              <Stat label="Saw it" value={<Num value={data.saw} />} caption="people the shop showed it to" />
              <Stat
                label="Opened it"
                value={<Num value={data.opened} />}
                caption={<Ratio part={data.opened} whole={data.saw} />}
              />
              <Stat
                label="Stayed"
                value={<Num value={data.stayed} />}
                caption={`${data.avg_seconds}s on average`}
              />
              <Stat label="Added to a cart" value={<Num value={data.added} />} />
              <Stat
                label="Bought it"
                value={<Num value={data.bought} />}
                caption={`${data.bought_pct}% of the people who opened it`}
              />
              <Stat
                label="Hearts and saves"
                value={<Num value={product.total_likes + product.total_saves} />}
                caption={`${product.total_likes} liked · ${product.total_saves} saved`}
              />
            </div>

            <TrendArea
              points={data.daily.map((day) => ({ date: day.date, value: day.visitors }))}
              label="People, each day"
            />
          </>
        )
      ) : null}
    </Popup>
  );
}
