"use client";

import { useEffect } from "react";
import { getVisitorId } from "@/lib/fingerprint";

export function AnalyticsTracker() {
  useEffect(() => {
    getVisitorId().catch(() => {});
  }, []);
  return null;
}
