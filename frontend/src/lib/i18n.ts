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
    "Everything else online came from a container. Ours came from a workshop. Free delivery on everything.",
    "كل شيء آخر جاء من حاوية. أما قطعتنا فجاءت من ورشة. التوصيل مجاني على كل شيء.",
  ],

  // Navigation and shell.
  theWorkshop: ["The Workshop", "الورشة"],
  // The five destinations in the bar, in the order a shopper needs them.
  navShop: ["Shop", "المتجر"],
  navCustom: ["Custom", "حسب الطلب"],
  navAbout: ["About", "من نحن"],
  navContact: ["Contact", "اتصل بنا"],
  filter: ["Filter", "تصفية"],
  allPieces: ["Everything", "كل القطع"],

  // Accounts. Buying never needs one; talking to the assistant does.
  signIn: ["Sign in", "تسجيل الدخول"],
  signOut: ["Sign out", "تسجيل الخروج"],
  signUp: ["Create an account", "إنشاء حساب"],
  emailLabel: ["Email", "البريد الإلكتروني"],
  passwordLabel: ["Password", "كلمة السر"],
  nameLabel: ["Your name", "اسمك"],
  haveAccount: ["Already have an account?", "لديك حساب بالفعل؟"],
  needAccount: ["Need an account?", "تحتاج حساباً؟"],
  signInFailed: ["That email and password do not match.", "البريد وكلمة السر غير متطابقين."],

  // An account is a delivery address you only type once.
  signUpLead: [
    "Fill this in once and checkout is already done — we keep your number and address so you never type them again.",
    "املأ هذا مرة واحدة ولن تحتاج إلى ملء صفحة الطلب بعدها — نحتفظ برقمك وعنوانك فلا تكتبهما مجدداً.",
  ],
  whereWeDeliver: ["Where we deliver to you", "أين نوصّل إليك"],
  editDetails: ["Change", "تغيير"],
  saveDetails: ["Save", "احفظ"],
  detailsSaved: ["Saved.", "تم الحفظ."],
  deliverTo: ["Delivering to", "التوصيل إلى"],
  notYou: ["Send this one somewhere else", "أرسل هذا الطلب إلى مكان آخر"],
  useMyDetails: ["Use my saved details", "استعمل معلوماتي المحفوظة"],
  addressMissing: [
    "Add your address so checkout fills itself in next time.",
    "أضف عنوانك ليملأ نفسه في المرة القادمة.",
  ],

  contactIntro: [
    "Message the workshop directly, by WhatsApp or email. We read every one ourselves.",
    "راسل الورشة مباشرة، عبر واتساب أو البريد الإلكتروني. نقرأ كل رسالة بأنفسنا.",
  ],

  profile: ["Profile", "الملف"],
  totalSpent: ["Spent with us", "ما أنفقته معنا"],
  ordersPlaced: ["Orders delivered", "طلبات تم تسليمها"],
  currentOrder: ["Being made now", "قيد الصنع الآن"],
  purchases: ["What you have bought", "ما اشتريته"],
  noPurchases: [
    "Nothing yet. Orders you place while signed in appear here.",
    "لا شيء بعد. الطلبات التي تضعها وأنت مسجّل الدخول تظهر هنا.",
  ],
  changePhoto: ["Change photo", "غيّر الصورة"],

  browse: ["See what we have", "شاهد ما لدينا"],
  askUs: ["Tell us what you need", "أخبرنا بما تحتاج"],
  cart: ["Cart", "السلة"],

  // Pieces.
  //
  // The stock-copy keys used to live here — `allGone`, `lastOne`, `stillHere`,
  // `weMadeThese`, `tallyMeaning`, `onlyMade`, `piecesMade`, `stillOnTheShelf`.
  // The shop no longer counts units, so every screen that used them is gone
  // too. Deleting the keys stops a future page from casually reintroducing
  // "one left" copy.
  madeIn: ["Made in", "صُنعت في"],
  howItWasMade: ["How it was made", "كيف صُنعت"],
  piece: ["Piece", "قطعة"],
  choose: ["Choose", "اختر"],
  addToCart: ["Add to cart", "أضف إلى السلة"],
  added: ["In your cart", "في سلتك"],

  // Looking for something.
  search: ["Search", "بحث"],
  searchPlaceholder: ["Search for a piece", "ابحث عن قطعة"],
  searchNothing: [
    "Nothing here matches that — but we can make it.",
    "لا شيء هنا يطابق ذلك — لكن يمكننا صنعه.",
  ],
  searchFound: ["{n} pieces", "{n} قطعة"],

  // Cart and checkout.
  yourCart: ["Your cart", "سلتك"],
  cartEmpty: ["Nothing in here yet.", "لا شيء هنا بعد."],
  yourOrder: ["Your order", "طلبك"],
  itemCount: ["{n} pieces", "{n} قطعة"],
  editCart: ["Edit", "عدّل"],
  qty: ["Qty {n}", "الكمية {n}"],
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
  yourReference: ["Your reference", "رقمك"],
  findYourOrder: ["Find your order", "ابحث عن طلبك"],
  findYourOrderLead: [
    "Lost the link? Your reference and the number you gave us is enough.",
    "ضاع منك الرابط؟ رقم الطلب والهاتف الذي أعطيتنا يكفيان.",
  ],
  referenceHint: ["The eight characters we sent you, like 7KQ4M2XP.", "الرموز الثمانية التي أرسلناها، مثل 7KQ4M2XP."],
  findIt: ["Show me my order", "أرني طلبي"],
  findingIt: ["Looking…", "جارٍ البحث…"],
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
  tellUsLead: [
    "Describe it in your own words. We read every one of these ourselves, and we come back with a price and a real date.",
    "صِفه بكلماتك. نقرأ كل طلب بأنفسنا، ونعود إليك بالثمن وبتاريخ حقيقي.",
  ],
  nothingOwed: ["Nothing is owed until you agree a price.", "لا شيء عليك حتى تتّفق على الثمن."],
  theQuote: ["The price", "الثمن"],
  approveQuote: ["Yes, make it", "نعم، اصنعها"],
  declineQuote: ["Not this time", "ليس هذه المرة"],

  talkToAPerson: ["Talk to a person", "تحدّث إلى شخص"],

  // Getting back into the workshop.
  forgotPassword: ["Forgotten password", "نسيت كلمة السر"],
  forgotPasswordLead: [
    "Give us the address on the account and we will send a link to set a new password.",
    "أعطنا البريد المسجّل وسنرسل رابطاً لتعيين كلمة سر جديدة.",
  ],
  sendResetLink: ["Send the link", "أرسل الرابط"],
  resetSent: [
    "If that address has an account, a link is on its way. It works for one hour.",
    "إن كان لذلك البريد حساب، فالرابط في طريقه. يعمل لمدة ساعة.",
  ],
  setNewPassword: ["Set a new password", "عيّن كلمة سر جديدة"],
  newPassword: ["New password", "كلمة السر الجديدة"],
  newPasswordAgain: ["Type it again", "اكتبها مرة أخرى"],
  passwordRule: ["At least 8 characters.", "٨ أحرف على الأقل."],
  savePassword: ["Save it", "احفظها"],
  passwordChanged: ["Done. You can sign in with it now.", "تم. يمكنك الدخول بها الآن."],
  otherSessionsEnded: [
    "Every other session has been signed out.",
    "تم إنهاء كل الجلسات الأخرى.",
  ],

  // Everything else.
  loading: ["A moment…", "لحظة…"],
  somethingWentWrong: ["Something went wrong.", "حدث خطأ ما."],
  tryAgain: ["Try again", "أعد المحاولة"],
  notFound: ["We couldn't find that.", "لم نجد ذلك."],
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
