"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Lang = "en" | "ar";

interface LangCtx {
  lang: Lang;
  toggle: () => void;
  isAr: boolean;
}

const LanguageContext = createContext<LangCtx>({
  lang: "en",
  toggle: () => {},
  isAr: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("lang") as Lang | null;
    if (saved === "ar") {
      setLang("ar");
      applyLang("ar");
    }
  }, []);

  function applyLang(l: Lang) {
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  }

  function toggle() {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    localStorage.setItem("lang", next);
    applyLang(next);
  }

  return (
    <LanguageContext.Provider value={{ lang, toggle, isAr: lang === "ar" }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
