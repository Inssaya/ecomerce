"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Ambient } from "./Ambient";
import type { AmbientName } from "./painters";

/**
 * Which background is on, and the switch for it.
 *
 * Kept in localStorage rather than on the server: it is a preference of this
 * phone, it is nobody's business but theirs, and it must survive a reload
 * while the options are being judged.
 *
 * The chosen name is written to `data-ambient` on the document element, which
 * is what lets a look also be a *theme* — night swaps the colour tokens, and
 * every component picks that up without knowing this file exists.
 */
const KEY = "mostyle_ambient";
const DEFAULT: AmbientName = "none";

interface AmbientValue {
  ambient: AmbientName;
  setAmbient: (name: AmbientName) => void;
}

const AmbientContext = createContext<AmbientValue>({
  ambient: DEFAULT,
  setAmbient: () => undefined,
});

export function AmbientProvider({ children }: { children: ReactNode }) {
  const [ambient, setStored] = useState<AmbientName>(DEFAULT);

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as AmbientName | null;
    if (saved) setStored(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.ambient = ambient;
  }, [ambient]);

  const setAmbient = useCallback((name: AmbientName) => {
    localStorage.setItem(KEY, name);
    setStored(name);
  }, []);

  const value = useMemo(() => ({ ambient, setAmbient }), [ambient, setAmbient]);

  return (
    <AmbientContext.Provider value={value}>
      <Ambient name={ambient} />
      {children}
    </AmbientContext.Provider>
  );
}

export function useAmbient(): AmbientValue {
  return useContext(AmbientContext);
}
