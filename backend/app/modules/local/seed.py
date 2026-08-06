"""The cities and the services, written out.

This is content, not configuration, and it is in the repository rather than in
a fixture because it is the text people will actually read and the text Google
will actually rank. It is seeded into the database so the owner can improve any
of it without a deploy.

Two rules held throughout:

* **No French.** Not in a city name, not anywhere — so Fez, not Fès; Tangier,
  not Tanger. Arabic names are the real ones, not transliterations of the
  English.
* **Nothing claimed that is not true.** The delivery windows below are what a
  Moroccan courier actually does city to city, wider for the south because it
  genuinely takes longer. A shop that promises two days to Dakhla gets its
  parcels refused at the door, which is the most expensive thing that can
  happen here.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.local import City, Service

#: slug, English, Arabic, region EN, region AR, days min, days max, people
CITIES: list[tuple[str, str, str, str, str, int, int, int]] = [
    ("casablanca", "Casablanca", "الدار البيضاء", "on the coast", "على الساحل", 1, 2, 3_360_000),
    ("rabat", "Rabat", "الرباط", "on the coast", "على الساحل", 1, 2, 580_000),
    ("sale", "Sale", "سلا", "beside Rabat", "بجوار الرباط", 1, 2, 890_000),
    ("temara", "Temara", "تمارة", "beside Rabat", "بجوار الرباط", 1, 2, 313_000),
    ("mohammedia", "Mohammedia", "المحمدية", "on the coast", "على الساحل", 1, 2, 208_000),
    ("marrakesh", "Marrakesh", "مراكش", "inland, in the south", "في الداخل جنوباً", 2, 3, 928_000),
    ("fez", "Fez", "فاس", "inland, in the north", "في الداخل شمالاً", 2, 3, 1_112_000),
    ("tangier", "Tangier", "طنجة", "in the far north", "أقصى الشمال", 2, 3, 947_000),
    ("meknes", "Meknes", "مكناس", "inland, in the north", "في الداخل شمالاً", 2, 3, 632_000),
    ("kenitra", "Kenitra", "القنيطرة", "on the coast", "على الساحل", 2, 3, 431_000),
    ("agadir", "Agadir", "أكادير", "on the coast, in the south", "على الساحل جنوباً", 2, 4, 421_000),
    ("tetouan", "Tetouan", "تطوان", "in the north", "في الشمال", 2, 4, 380_000),
    ("oujda", "Oujda", "وجدة", "in the east", "في الشرق", 3, 4, 494_000),
    ("safi", "Safi", "آسفي", "on the coast", "على الساحل", 2, 4, 308_000),
    ("el-jadida", "El Jadida", "الجديدة", "on the coast", "على الساحل", 2, 3, 194_000),
    ("beni-mellal", "Beni Mellal", "بني ملال", "in the middle", "في الوسط", 2, 4, 192_000),
    ("nador", "Nador", "الناظور", "in the north east", "في الشمال الشرقي", 3, 4, 161_000),
    ("khouribga", "Khouribga", "خريبكة", "in the middle", "في الوسط", 2, 4, 196_000),
    ("settat", "Settat", "سطات", "inland from Casablanca", "داخل الدار البيضاء", 2, 3, 142_000),
    ("berrechid", "Berrechid", "برشيد", "inland from Casablanca", "داخل الدار البيضاء", 1, 3, 136_000),
    ("taza", "Taza", "تازة", "in the north", "في الشمال", 3, 4, 148_000),
    ("essaouira", "Essaouira", "الصويرة", "on the coast", "على الساحل", 3, 4, 77_000),
    ("larache", "Larache", "العرائش", "in the north", "في الشمال", 2, 4, 125_000),
    ("ouarzazate", "Ouarzazate", "ورزازات", "beyond the mountains", "خلف الجبال", 3, 5, 71_000),
    ("errachidia", "Errachidia", "الرشيدية", "in the south east", "في الجنوب الشرقي", 3, 6, 92_000),
    ("guelmim", "Guelmim", "كلميم", "in the far south", "أقصى الجنوب", 4, 6, 118_000),
    ("laayoune", "Laayoune", "العيون", "in the far south", "أقصى الجنوب", 4, 6, 217_000),
    ("dakhla", "Dakhla", "الداخلة", "in the far south", "أقصى الجنوب", 5, 7, 106_000),
    ("al-hoceima", "Al Hoceima", "الحسيمة", "on the north coast", "على الساحل الشمالي", 3, 5, 56_000),
]


#: Each of these is a page someone might actually search for, and the body is
#: written to be worth reading if they land on it. A page that only repeats its
#: own title ranks for nothing and converts nobody.
SERVICES: list[dict] = [
    {
        "slug": "printing-on-demand",
        "name_en": "Printing on demand",
        "name_ar": "الطباعة عند الطلب",
        "summary_en": (
            "You describe the piece, we print it, you pay the courier. Nothing is made "
            "before you ask for it."
        ),
        "summary_ar": "تصف القطعة، فنطبعها، وتخلّص للموصّل. لا نصنع شيئاً قبل أن تطلبه.",
        "body_en": (
            "We print one at a time, after you order it. That is the whole difference "
            "between this and a shop: nothing here arrived in a container, and nothing "
            "is sitting in a warehouse waiting to be photographed.\n\n"
            "Send us a description, a photo, a sketch on paper, or a file if you have "
            "one. We come back with a price and a real date — not 'soon'. You owe "
            "nothing until you have seen both and said yes, and you pay in cash when "
            "the piece reaches your door.\n\n"
            "It suits the things nobody stocks: a bracket for a machine that stopped "
            "being made, a part in a size that does not exist, twenty of something "
            "identical for a shop or an office, or one of something that has never "
            "existed at all."
        ),
        "body_ar": (
            "نطبع قطعة واحدة في كل مرة، بعد أن تطلبها. هذا هو الفرق كلّه بيننا وبين "
            "متجر: لا شيء هنا وصل في حاوية، ولا شيء ينتظر في مستودع ليُصوَّر.\n\n"
            "أرسل لنا وصفاً، أو صورة، أو رسماً على ورق، أو ملفاً إن كان لديك. نعود إليك "
            "بالثمن وبتاريخ حقيقي — لا بكلمة «قريباً». لا شيء عليك حتى ترى الاثنين "
            "وتوافق، وتخلّص نقداً حين تصل القطعة إلى بابك.\n\n"
            "يناسب هذا ما لا يخزّنه أحد: حاملاً لآلة توقّف صنعها، أو قطعة بمقاس غير "
            "موجود، أو عشرين نسخة متطابقة لمحل أو مكتب، أو شيئاً لم يوجد قط."
        ),
        "lead_time_days": 5,
        "display_order": 1,
    },
    {
        "slug": "t-shirt-printing",
        "name_en": "T-shirt printing",
        "name_ar": "طباعة القمصان",
        "summary_en": (
            "One shirt or two hundred, printed here and delivered anywhere in Morocco. "
            "Cash at the door."
        ),
        "summary_ar": "قميص واحد أو مئتان، نطبعها هنا ونوصّلها في كل المغرب. تخلّص عند الباب.",
        "body_en": (
            "We print shirts one at a time or by the box. There is no minimum, because "
            "the person who wants one shirt is usually the person who comes back for "
            "twenty.\n\n"
            "Send the artwork, or describe what you want and we will set it. We will "
            "tell you honestly if a design will not survive a wash — a print that "
            "cracks after a month is a customer we never see again, and we would "
            "rather lose the job than make it.\n\n"
            "Common work: a team, a shop's staff, a small run for an event, a gift with "
            "one name on it, a design somebody drew themselves. You see a price and a "
            "date before anything is printed, and you pay the courier when it arrives."
        ),
        "body_ar": (
            "نطبع القمصان واحداً واحداً أو بالصندوق. لا حدّ أدنى، لأن من يريد قميصاً "
            "واحداً هو غالباً من يعود لعشرين.\n\n"
            "أرسل التصميم، أو صِف ما تريد وسنجهّزه. وسنقول لك بصراحة إن كان التصميم لن "
            "يصمد أمام الغسل — طباعة تتشقّق بعد شهر تعني زبوناً لا نراه ثانية، ونفضّل "
            "أن نخسر العمل على أن نصنعه.\n\n"
            "أعمال معتادة: فريق، أو طاقم محل، أو كمية صغيرة لمناسبة، أو هدية عليها اسم "
            "واحد، أو تصميم رسمه صاحبه بنفسه. ترى الثمن والتاريخ قبل أن يُطبع شيء، "
            "وتخلّص للموصّل عند الوصول."
        ),
        "lead_time_days": 4,
        "display_order": 2,
    },
    {
        "slug": "laser-cutting",
        "name_en": "Laser cutting and engraving",
        "name_ar": "القصّ والحفر بالليزر",
        "summary_en": "Wood, acrylic and leather cut or engraved to your drawing, down to one piece.",
        "summary_ar": "خشب وأكريليك وجلد نقصّه أو نحفره حسب رسمك، حتى قطعة واحدة.",
        "body_en": (
            "Cutting and engraving to a line you give us. Wood, acrylic, leather, and "
            "card — one piece or a run of them.\n\n"
            "Send a drawing, a photo of something similar, or measurements written on a "
            "phone. A file is easier and cheaper, but it is not required, and we would "
            "rather redraw it for you than lose the job over a format.\n\n"
            "It suits name plates, shop lettering, wedding and event pieces, boxes cut "
            "to fit a specific thing, engraved gifts, and the parts of furniture that "
            "have to be exact. Engraving is where this earns its money: a name cut into "
            "wood does not peel off the way a sticker does."
        ),
        "body_ar": (
            "قصّ وحفر حسب خط تعطينا إياه. خشب وأكريليك وجلد وورق مقوّى — قطعة واحدة أو "
            "كمية.\n\n"
            "أرسل رسماً، أو صورة لشيء مشابه، أو مقاسات مكتوبة على الهاتف. الملف أسهل "
            "وأرخص، لكنه ليس شرطاً، ونفضّل أن نعيد رسمه لك على أن نخسر العمل بسبب "
            "صيغة.\n\n"
            "يناسب لوحات الأسماء، وحروف المحلات، وقطع الأعراس والمناسبات، وعلباً مقصوصة "
            "لتناسب شيئاً بعينه، وهدايا محفورة، وأجزاء الأثاث التي يجب أن تكون مضبوطة. "
            "الحفر هو الأكثر قيمة هنا: الاسم المحفور في الخشب لا ينزع كما ينزع الملصق."
        ),
        "lead_time_days": 4,
        "display_order": 3,
    },
    {
        "slug": "signs-and-lettering",
        "name_en": "Signs and lettering",
        "name_ar": "اللافتات والحروف",
        "summary_en": "A sign for a shop, a door, a stall or an office — made to the size you actually have.",
        "summary_ar": "لافتة لمحل أو باب أو طاولة أو مكتب — بالمقاس الذي لديك فعلاً.",
        "body_en": (
            "Signs made to the wall you have, not to a standard size that nearly fits. "
            "Cut lettering, engraved plates, printed panels, door numbers and opening "
            "hours.\n\n"
            "Send a photo of the space with something in it for scale — a hand, a bottle "
            "— and roughly what it should say. In Arabic, in English, or both on the "
            "same sign, which is usually what a Moroccan shop actually needs.\n\n"
            "We will say if a material is wrong for where it is going. Anything facing "
            "the sun on a street here has about a year in it unless it is the right "
            "material, and replacing a sign costs more than making the right one once."
        ),
        "body_ar": (
            "لافتات تُصنع للجدار الذي لديك، لا لمقاس قياسي يكاد يناسب. حروف مقصوصة، "
            "ولوحات محفورة، وألواح مطبوعة، وأرقام أبواب وأوقات عمل.\n\n"
            "أرسل صورة للمكان وفيه شيء يوضّح الحجم — يد أو قنينة — وما ينبغي أن تقوله "
            "تقريباً. بالعربية أو بالإنجليزية أو بالاثنتين على اللافتة نفسها، وهو ما "
            "يحتاجه المحل المغربي عادةً.\n\n"
            "وسنقول لك إن كانت المادة غير مناسبة لمكانها. أي شيء يواجه الشمس في شارع "
            "هنا يعيش سنة تقريباً ما لم تكن المادة صحيحة، وتبديل لافتة أغلى من صنع "
            "الصحيحة مرة واحدة."
        ),
        "lead_time_days": 6,
        "display_order": 4,
    },
    {
        "slug": "spare-parts",
        "name_en": "Parts nobody sells any more",
        "name_ar": "قطع لم يعد أحد يبيعها",
        "summary_en": (
            "The knob, the clip, the bracket that broke and cannot be bought. Send a "
            "photo of the broken one."
        ),
        "summary_ar": "المقبض أو المشبك أو الحامل الذي انكسر ولا يُباع. أرسل صورة للمكسور.",
        "body_en": (
            "The part that broke, remade. A washing machine knob, a fridge shelf clip, a "
            "car interior tab, a bracket for a shutter, the foot of a chair — the small "
            "plastic thing that fails and turns a working object into rubbish.\n\n"
            "Send a photo of the broken piece next to a coin or a ruler so we can read "
            "the size, and a photo of where it sits. If you still have both halves, keep "
            "them — a clean break tells us more than a description ever will.\n\n"
            "This is the most useful thing a workshop can do in a country where the "
            "spare was never imported. It is usually cheaper than the appliance, always "
            "cheaper than replacing it, and often the part is stronger than the one that "
            "broke because we can make it thicker where it failed."
        ),
        "body_ar": (
            "القطعة التي انكسرت، نعيد صنعها. مقبض غسالة، أو مشبك رفّ ثلاجة، أو لسان في "
            "داخل سيارة، أو حامل ستارة، أو قدم كرسي — ذلك الجزء البلاستيكي الصغير الذي "
            "يفشل فيحوّل شيئاً صالحاً إلى نفاية.\n\n"
            "أرسل صورة للقطعة المكسورة بجانب قطعة نقدية أو مسطرة لنقرأ المقاس، وصورة "
            "لموضعها. وإن كان النصفان لديك فاحتفظ بهما — الكسر النظيف يخبرنا أكثر من أي "
            "وصف.\n\n"
            "هذا أنفع ما تفعله ورشة في بلد لم تُستورد فيه قطعة الغيار أصلاً. غالباً أرخص "
            "من الجهاز، ودائماً أرخص من تبديله، وكثيراً ما تكون القطعة أقوى من التي "
            "انكسرت لأننا نستطيع تسميكها حيث فشلت."
        ),
        "lead_time_days": 5,
        "display_order": 5,
    },
]


async def seed(db: AsyncSession) -> tuple[int, int]:
    """Insert anything missing. Never overwrites — the owner's edits win.

    Runs on startup, so a fresh deployment has a full set of pages without
    anybody remembering to run a command, and an existing one is untouched.
    """
    existing_cities = set(await db.scalars(select(City.slug)))
    added_cities = 0
    for slug, name_en, name_ar, region_en, region_ar, low, high, people in CITIES:
        if slug in existing_cities:
            continue
        db.add(
            City(
                slug=slug,
                name_en=name_en,
                name_ar=name_ar,
                region_en=region_en,
                region_ar=region_ar,
                delivery_days_min=low,
                delivery_days_max=high,
                people=people,
            )
        )
        added_cities += 1

    existing_services = set(await db.scalars(select(Service.slug)))
    added_services = 0
    for entry in SERVICES:
        if entry["slug"] in existing_services:
            continue
        db.add(Service(**entry))
        added_services += 1

    if added_cities or added_services:
        await db.commit()
    return added_cities, added_services
