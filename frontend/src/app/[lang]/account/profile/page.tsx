"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { DeliveryDetails } from "@/components/DeliveryDetails";
import { patchSession, signOut, useSession } from "@/lib/session";
import { type Lang, isLang, money, statusLabel, translator } from "@/lib/i18n";

/**
 * The customer's own page.
 *
 * Only orders placed while signed in appear here — buying needs no account, so
 * a guest order belongs to a phone number, not to a person, and claiming it by
 * matching the number would hand one customer's history to whoever registered
 * with it. `/orders` is still the way back into a guest order.
 *
 * `total_spent` counts delivered orders only, and the API is the one that
 * decides that. In a cash-on-delivery market the gap between placed and
 * delivered is the whole business: a profile that added up refused packages
 * would be quoting the customer a number nobody ever handed over.
 */
interface OrderLine {
  title: string;
  quantity: number;
  image_url: string | null;
}
interface MyOrder {
  reference: string;
  status: string;
  total: number;
  created_at: string;
  tracking_token: string;
  items: OrderLine[];
}
interface MyOrders {
  orders: MyOrder[];
  total_spent: number;
  delivered: number;
}

const OPEN = new Set(["placed", "confirmed", "preparing", "ready", "out_for_delivery"]);

export default function ProfilePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const router = useRouter();
  const { session, ready } = useSession();

  const [data, setData] = useState<MyOrders | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready && !session) router.replace(`/${lang}/account`);
  }, [ready, session, router, lang]);

  useEffect(() => {
    setAvatar(session?.avatar ?? null);
  }, [session?.avatar]);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetch("/api/orders/mine", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (response.ok) setData((await response.json()) as MyOrders);
    } catch {
      /* A profile that fails to list orders is still a profile. */
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen || !session) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", chosen);
      const response = await fetch("/api/auth/me/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body,
      });
      if (response.ok) {
        const user = (await response.json()) as { avatar_url: string | null };
        setAvatar(user.avatar_url);
        patchSession({ avatar: user.avatar_url });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !session) return <div className="page-wide pt-10" aria-hidden />;

  const open = data?.orders.filter((order) => OPEN.has(order.status)) ?? [];
  const past = data?.orders.filter((order) => !OPEN.has(order.status)) ?? [];

  return (
    <div className="page-wide pt-8 pb-16">
      <h1 className="sr-only">{t("profile")}</h1>

      <header className="flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-clay-soft">
            {avatar ? (
              <Image
                src={avatar}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 object-cover"
                unoptimized
              />
            ) : (
              // An initial, not a stock silhouette — a grey outline of a
              // stranger is worse than the letter of your own name.
              <span className="flex h-20 w-20 items-center justify-center text-[30px] font-semibold text-clay">
                {(session.name || session.email).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => file.current?.click()}
            disabled={busy}
            aria-label={t("changePhoto")}
            title={t("changePhoto")}
            className="absolute -bottom-1 -end-1 h-8 w-8 inline-flex items-center justify-center
                       rounded-full bg-ink text-white transition-transform duration-200
                       hover:scale-105 disabled:opacity-50"
          >
            <CameraIcon />
          </button>
          <input
            ref={file}
            onChange={pickPhoto}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />
        </div>

        <div className="min-w-0">
          <p className="text-[22px] font-semibold tracking-[-0.02em] truncate">
            {session.name}
          </p>
          <p className="text-[14px] text-ink-mute truncate">{session.email}</p>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="ms-auto shrink-0 tap px-3 text-[14px] font-medium text-ink-soft hover:text-ink"
        >
          {t("signOut")}
        </button>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<WalletIcon />}
          label={t("totalSpent")}
          value={money(data?.total_spent ?? 0, lang)}
          accent
        />
        <Stat icon={<BoxIcon />} label={t("ordersPlaced")} value={String(data?.delivered ?? 0)} />
        <Stat icon={<ClockIcon />} label={t("currentOrder")} value={String(open.length)} />
        <Link href={`/${lang}`} className="block">
          <Stat icon={<PlusIcon />} label={t("browse")} value="" action />
        </Link>
      </div>

      {/* High up, above the order history, because it is the one thing on this
          page that changes what happens next — a stale address here is a parcel
          the courier cannot hand over. */}
      <div className="mt-8">
        <DeliveryDetails lang={lang} />
      </div>

      {open.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[17px] font-semibold">{t("currentOrder")}</h2>
          <div className="mt-3 space-y-2.5">
            {open.map((order) => (
              <OrderRow key={order.reference} order={order} lang={lang} live />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold">{t("purchases")}</h2>
        {past.length === 0 && open.length === 0 ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{t("noPurchases")}</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {past.map((order) => (
              <OrderRow key={order.reference} order={order} lang={lang} />
            ))}
          </div>
        )}
      </section>

      <p className="mt-10 text-[13px] text-ink-mute">
        {ar
          ? "طلبات وضعتها كضيف؟ ابحث عنها برقم الطلب والهاتف."
          : "Ordered as a guest? Find it with your reference and phone."}{" "}
        <Link href={`/${lang}/orders`} className="underline underline-offset-4">
          {t("findYourOrder")}
        </Link>
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  action?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 h-full transition-colors duration-200 ${
        accent ? "border-clay bg-clay-soft" : "border-sand bg-surface"
      } ${action ? "hover:border-ink" : ""}`}
    >
      <span className={accent ? "text-clay" : "text-ink-mute"}>{icon}</span>
      {value ? (
        <p className="stamp mt-2 text-[20px] font-semibold leading-none tabular-nums">{value}</p>
      ) : null}
      <p className={`text-[12.5px] text-ink-soft ${value ? "mt-1.5" : "mt-2"}`}>{label}</p>
    </div>
  );
}

function OrderRow({
  order,
  lang,
  live,
}: {
  order: MyOrder;
  lang: Lang;
  live?: boolean;
}) {
  const photo = order.items.find((item) => item.image_url)?.image_url ?? null;
  return (
    <Link
      href={`/${lang}/track/${order.tracking_token}`}
      className="flex items-center gap-3.5 rounded-2xl border border-sand bg-surface p-3
                 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-clay-soft">
        {photo ? (
          <Image src={photo} alt="" width={56} height={56} className="h-14 w-14 object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium truncate">
          {order.items[0]?.title ?? order.reference}
          {order.items.length > 1 ? ` +${order.items.length - 1}` : ""}
        </p>
        <p className="stamp text-[12.5px] text-ink-mute">{order.reference}</p>
      </div>
      <div className="text-end shrink-0">
        <p className="stamp text-[14.5px] font-semibold tabular-nums">
          {money(order.total, lang)}
        </p>
        <p className={`text-[12px] ${live ? "text-clay" : "text-ink-mute"}`}>
          {statusLabel(lang, "orderStatus", order.status)}
        </p>
      </div>
    </Link>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="m21 16-9 5-9-5V8l9-5 9 5Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
