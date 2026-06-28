"use client";

import { useLang } from "@/contexts/LanguageContext";

export function useT() {
  const { isAr } = useLang();
  return {
    t: (en: string, ar: string) => (isAr ? ar : en),
    isAr,
  };
}
