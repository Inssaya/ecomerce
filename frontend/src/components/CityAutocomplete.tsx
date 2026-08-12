"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Place } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

/**
 * The city field on checkout, made findable.
 *
 * It stays free text underneath — `matchCity` in `lib/delivery.ts` still
 * matches whatever ends up in the input, and a town we have not named is
 * still a town someone can type and order to. What changes is that the
 * places we *have* made a delivery promise about are now typeable-to and
 * pickable-from, with the promise (the day count) shown right on the row,
 * instead of sitting in a native `<datalist>` that iOS Safari silently does
 * not render at all.
 */
export function CityAutocomplete({
  id,
  name = "city",
  lang,
  cities,
  value,
  onChange,
  required,
}: {
  id: string;
  name?: string;
  lang: Lang;
  cities: Place[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const listId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const query = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return cities;
    const matches = cities.filter(
      (place) =>
        place.name.toLowerCase().includes(query) || place.name_en.toLowerCase().includes(query),
    );
    // Whatever starts with what they typed reads first; a place that merely
    // contains it further in still shows, just below.
    return [...matches].sort((a, b) => {
      const aFirst = a.name.toLowerCase().startsWith(query) || a.name_en.toLowerCase().startsWith(query);
      const bFirst = b.name.toLowerCase().startsWith(query) || b.name_en.toLowerCase().startsWith(query);
      if (aFirst === bFirst) return 0;
      return aFirst ? -1 : 1;
    });
  }, [cities, query]);

  // Closing on a click outside — the input's own onBlur cannot be trusted
  // alone, because a mousedown on an option fires before the blur would.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (highlighted < 0) return;
    document.getElementById(optionId(highlighted))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  useEffect(() => {
    setHighlighted(-1);
  }, [query]);

  function select(place: Place) {
    onChange(place.name);
    setOpen(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(0);
        return;
      }
      setHighlighted((index) => (index + 1 >= filtered.length ? 0 : index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return;
      setHighlighted((index) => (index - 1 < 0 ? filtered.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      if (open && highlighted >= 0 && filtered[highlighted]) {
        event.preventDefault();
        select(filtered[highlighted]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setHighlighted(-1);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        required={required}
        autoComplete="address-level2"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={highlighted >= 0 ? optionId(highlighted) : undefined}
        placeholder={lang === "ar" ? "الدار البيضاء" : "Casablanca"}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="field"
      />

      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={lang === "ar" ? "المدن" : "Cities"}
          className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto
                     card border border-sand py-1 shadow-lift animate-rise"
        >
          {filtered.map((place, index) => (
            <li key={place.slug} role="presentation">
              <button
                type="button"
                id={optionId(index)}
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => select(place)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-[15px]
                            transition-colors duration-150 ${
                              index === highlighted ? "bg-clay-soft text-ink" : "text-ink hover:bg-clay-soft/60"
                            }`}
              >
                <span>{highlight(place.name, query)}</span>
                <span className="stamp shrink-0 text-[12.5px] text-ink-soft">
                  {place.delivery_days[0]}–{place.delivery_days[1]}
                  {lang === "ar" ? "ي" : "d"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The typed part, bolded — so the match is obvious, not just the order. */
function highlight(text: string, query: string) {
  if (!query) return text;
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}
