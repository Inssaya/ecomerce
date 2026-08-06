/**
 * English and Arabic. Nothing else, ever.
 *
 * Both languages are written, not translated. The Arabic here is not the
 * English sentence order with Arabic words in it — BRAND.md §9 — and where the
 * two say something slightly differently, that is on purpose.
 */

export const LANGS = ["en", "ar"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

export function dir(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

const copy = {
  // The position itself.
  tagline: ["Made, not resold.", "نصنع، لا نعيد البيع"],
  taglineSupport: [
    "Everything else online came from a container. Ours came from a workshop.",
    "كل شيء آخر جاء من حاوية. أما قطعتنا فجاءت من ورشة.",
  ],
  ifWeDontHaveIt: ["If we don't have it, we make it.", "إن لم نجده لك، صنعناه لك."],

  // Navigation and shell.
  theShelf: ["The Shelf", "الرف"],
  theWorkshop: ["The Workshop", "الورشة"],
  shelfMeaning: ["Pieces we have already made.", "قطع صنعناها بالفعل."],
  workshopMeaning: ["You describe it, we make it.", "تصفه لنا، فنصنعه."],
  browse: ["See what we have", "شاهد ما لدينا"],
  askUs: ["Tell us what you need", "أخبرنا بما تحتاج"],
  cart: ["Cart", "السلة"],
  back: ["Back", "رجوع"],
  ourStory: ["Who we are", "من نحن"],

  // Pieces.
  madeIn: ["Made in", "صُنعت في"],
  howItWasMade: ["How it was made", "كيف صُنعت"],
  onlyMade: ["We made {n}. {left} left.", "صنعنا {n}. بقي {left}."],
  lastOne: ["One left — the last of them.", "بقيت واحدة — آخرها."],
  allGone: ["All gone. We may make more.", "نفدت. قد نصنع المزيد."],
  readyInDays: ["Ready in {n} days.", "جاهزة خلال {n} أيام."],
  madeToOrder: ["Made after you order it.", "تُصنع بعد أن تطلبها."],
  piece: ["Piece", "قطعة"],
  weMadeThese: ["We made these", "هذه ما صنعناه"],
  stillHere: ["still here", "ما زالت هنا"],
  gone: ["gone", "ذهبت"],
  tallyMeaning: [
    "Solid ones are still here. Crossed ones have gone.",
    "الممتلئة ما زالت هنا. المشطوبة ذهبت.",
  ],
  piecesMade: ["pieces made", "قطعة صنعناها"],
  stillOnTheShelf: ["still on the shelf", "ما زالت على الرف"],
  choose: ["Choose", "اختر"],
  addToCart: ["Add to cart", "أضف إلى السلة"],
  added: ["In your cart", "في سلتك"],

  // Cart and checkout.
  yourCart: ["Your cart", "سلتك"],
  cartEmpty: ["Nothing in here yet.", "لا شيء هنا بعد."],
  subtotal: ["Pieces", "القطع"],
  delivery: ["Delivery", "التوصيل"],
  freeDelivery: ["Free", "مجاناً"],
  total: ["Total", "المجموع"],
  payAtDoor: [
    "You pay in cash when it reaches you. Nothing before.",
    "تخلّص نقداً عند وصولها إليك. لا شيء قبل ذلك.",
  ],
  checkout: ["Order it", "اطلبها"],
  yourName: ["Your name", "اسمك"],
  yourPhone: ["Phone number", "رقم الهاتف"],
  phoneHint: ["We call this number before we deliver.", "نتصل بهذا الرقم قبل التوصيل."],
  yourEmail: ["Email (if you want updates)", "البريد الإلكتروني (إن أردت المتابعة)"],
  yourAddress: ["Address", "العنوان"],
  yourCity: ["City", "المدينة"],
  anythingElse: ["Anything we should know?", "هل من شيء ينبغي أن نعرفه؟"],
  placeOrder: ["Place the order", "أكّد الطلب"],
  placing: ["Placing…", "جارٍ التأكيد…"],

  // Orders and requests.
  orderPlaced: ["We have your order", "وصلنا طلبك"],
  yourReference: ["Your reference", "رقمك"],
  trackIt: ["Follow your order", "تابع طلبك"],
  orderStatus: {
    placed: ["We have it", "وصلنا"],
    confirmed: ["Confirmed", "مؤكَّد"],
    preparing: ["Being made", "قيد الصنع"],
    ready: ["Finished", "جاهز"],
    out_for_delivery: ["On its way", "في الطريق"],
    delivered: ["Delivered", "تم التسليم"],
    cancelled: ["Cancelled", "أُلغي"],
    failed: ["We couldn't hand it over", "تعذّر التسليم"],
    returned: ["Came back to us", "عاد إلينا"],
  },
  requestStatus: {
    requested: ["We have your request", "وصلنا طلبك"],
    quoted: ["We sent you a price", "أرسلنا لك الثمن"],
    approved: ["Agreed", "اتّفقنا"],
    in_production: ["Being made", "قيد الصنع"],
    ready: ["Finished", "جاهز"],
    delivered: ["Delivered", "تم التسليم"],
    declined: ["We can't make this one", "لا يمكننا صنعها"],
    withdrawn: ["Closed", "مغلق"],
  },

  // The custom request.
  tellUs: ["Tell us what you need", "أخبرنا بما تحتاج"],
  tellUsLead: [
    "Describe it in your own words. We read every one of these ourselves, and we come back with a price and a real date.",
    "صِفه بكلماتك. نقرأ كل طلب بأنفسنا، ونعود إليك بالثمن وبتاريخ حقيقي.",
  ],
  whatIsIt: ["What is it?", "ما هو؟"],
  whatIsItHint: [
    "Size, colour, material, what it is for — whatever you know.",
    "المقاس، اللون، المادة، ولأي غرض — كل ما تعرفه.",
  ],
  budget: ["What you'd like to spend (optional)", "ما تودّ إنفاقه (اختياري)"],
  send: ["Send it", "أرسل"],
  sending: ["Sending…", "جارٍ الإرسال…"],
  nothingOwed: ["Nothing is owed until you agree a price.", "لا شيء عليك حتى تتّفق على الثمن."],
  theQuote: ["The price", "الثمن"],
  readyOn: ["Ready on", "جاهز في"],
  approveQuote: ["Yes, make it", "نعم، اصنعها"],
  declineQuote: ["Not this time", "ليس هذه المرة"],

  // The assistant.
  assistant: ["Ask us", "اسألنا"],
  assistantOpener: [
    "Ask me anything about a piece — the size, how it was made, when it would reach you.",
    "اسألني عن أي قطعة — المقاس، كيف صُنعت، ومتى تصلك.",
  ],
  assistantPlaceholder: ["Type your question", "اكتب سؤالك"],
  talkToAPerson: ["Talk to a person", "تحدّث إلى شخص"],

  // Everything else.
  loading: ["A moment…", "لحظة…"],
  somethingWentWrong: ["Something went wrong.", "حدث خطأ ما."],
  tryAgain: ["Try again", "أعد المحاولة"],
  notFound: ["We couldn't find that.", "لم نجد ذلك."],
  currency: ["MAD", "درهم"],
} as const;

type Copy = typeof copy;
type Leaf = readonly [string, string];

/** `t(lang)` once at the top of a component, then `t("cart")`. */
export function translator(lang: Lang) {
  const index = lang === "ar" ? 1 : 0;
  return function t<K extends keyof Copy>(
    key: K,
    values?: Record<string, string | number>,
  ): string {
    const entry = copy[key];
    const text = (Array.isArray(entry) ? (entry as Leaf)[index] : "") as string;
    if (!values) return text;
    return Object.entries(values).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      text,
    );
  };
}

/** Status labels live in nested groups, so they get their own reader. */
export function statusLabel(
  lang: Lang,
  group: "orderStatus" | "requestStatus",
  status: string,
): string {
  const index = lang === "ar" ? 1 : 0;
  const entry = (copy[group] as Record<string, Leaf>)[status];
  return entry ? entry[index] : status;
}

/** Prices read as "180 MAD" / "180 درهم" — never with decimals nobody pays. */
export function money(amount: number, lang: Lang): string {
  const rounded = Math.round(amount);
  return lang === "ar" ? `${rounded} درهم` : `${rounded} MAD`;
}
