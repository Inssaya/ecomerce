"use client";

/**
 * Theme switch: light is the console's default, dark is the night variant.
 * The choice is stamped on the `.console` root's `data-console-theme` and
 * persisted — everything visual reads CSS custom properties off that
 * attribute, so flipping it retints the whole console in one paint.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

const KEY = "mostyle_console_theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ConsoleThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "dark") setTheme("dark");
    } catch {
      /* private mode — theme just won't persist */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useConsoleTheme() {
  return useContext(ThemeContext);
}
