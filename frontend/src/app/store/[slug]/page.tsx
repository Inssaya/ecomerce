import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Package, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";

const STORE_META: Record<string, {
  name: string;
  tagline: string;
  description: string;
  gradient: string;
  accentColor: string;
  icon: string;
  whatsapp: string | null;
  whatsappMessage: string;
}> = {
  clothes: {
    name: "Fashion & Clothes",
    tagline: "Wear what you feel",
    description: "Discover our curated collection of clothing. Want a custom print? Contact us on WhatsApp — we'll make it happen.",
    gradient: "from-amber-500 via-orange-600 to-red-700",
    accentColor: "#f97316",
    icon: "👗",
    whatsapp: "212600000000",
    whatsappMessage: "Hi MoStyle! I'd like a custom print on clothing.",
  },
  "3dprint": {
    name: "3D Printing",
    tagline: "Turn ideas into reality",
    description: "Order from our catalog or get a fully custom 3D-printed object. Contact us on WhatsApp with your design.",
    gradient: "from-cyan-500 via-blue-600 to-violet-700",
    accentColor: "#06b6d4",
    icon: "🖨️",
    whatsapp: "212600000000",
    whatsappMessage: "Hi MoStyle! I'd like a custom 3D print.",
  },
  electronics: {
    name: "Electronics",
    tagline: "Power your life",
    description: "Latest gadgets, accessories and electronic devices at the best prices. Cash on delivery.",
    gradient: "from-emerald-500 via-teal-600 to-cyan-700",
    accentColor: "#10b981",
    icon: "⚡",
    whatsapp: null,
    whatsappMessage: "",
  },
  glasses: {
    name: "Eyewear",
    tagline: "See the world in style",
    description: "Designer frames, sunglasses, and prescription-ready eyewear for every style.",
    gradient: "from-violet-500 via-purple-600 to-pink-700",
    accentColor: "#8b5cf6",
    icon: "🕶️",
    whatsapp: null,
    whatsappMessage: "",
  },
};

async function getStore(slug: string) {
  try {
    const res = await fetch(
      `${process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:8000"}/stores/${slug}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getProducts(storeId: string) {
  try {
    const res = await fetch(
      `${process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:8000"}/products?store_id=${storeId}&status=active&size=24`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

async function getCategories(storeId: string) {
  try {
    const res = await fetch(
      `${process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:8000"}/categories?store_id=${storeId}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const meta = STORE_META[params.slug];
  if (!meta) return { title: "Not Found" };
  return {
    title: meta.name,
    description: meta.description,
  };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  const meta = STORE_META[params.slug];
  if (!meta) notFound();

  const store = await getStore(params.slug);
  const storeId = store?.id;
  const [products, categories] = storeId
    ? await Promise.all([getProducts(storeId), getCategories(storeId)])
    : [[], []];

  const waLink = meta.whatsapp
    ? `https://wa.me/${meta.whatsapp}?text=${encodeURIComponent(meta.whatsappMessage)}`
    : null;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <section className={`relative bg-gradient-to-br ${meta.gradient} overflow-hidden`}>
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px),
              radial-gradient(circle at 80% 20%, white 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <Link href="/" className="text-white/60 text-sm hover:text-white/90 transition-colors mb-4 inline-block">
                ← MoStyle
              </Link>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-6xl">{meta.icon}</span>
                <div>
                  <h1 className="text-4xl sm:text-5xl font-black text-white">{meta.name}</h1>
                  <p className="text-white/70 text-lg mt-1">{meta.tagline}</p>
                </div>
              </div>
              <p className="text-white/60 max-w-xl text-sm leading-relaxed">{meta.description}</p>
            </div>

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-green-500 hover:bg-green-400 text-white font-semibold px-6 py-3 rounded-2xl transition-colors shadow-lg"
              >
                <MessageCircle className="w-5 h-5" />
                Custom Order via WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Category pills */}
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-8">
            <Link
              href={`/store/${params.slug}`}
              className="px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-900 shadow-sm"
            >
              All
            </Link>
            {categories.map((cat: { id: string; name: string; slug: string }) => (
              <Link
                key={cat.id}
                href={`/store/${params.slug}?category=${cat.id}`}
                className="px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {/* Products */}
        {products.length === 0 ? (
          <div className="text-center py-24">
            <Package className="w-16 h-16 mx-auto mb-4 text-white/20" />
            <p className="text-white/40 text-lg">Products coming soon</p>
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-green-400 hover:text-green-300 text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Ask us on WhatsApp
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product: {
              id: string;
              title: string;
              price: number;
              currency: string;
              stock: number;
              seller_id: string;
              media: Array<{ url: string; is_primary: boolean }>;
            }) => {
              const primaryImage = product.media?.find((m) => m.is_primary)?.url ?? product.media?.[0]?.url;
              return (
                <div
                  key={product.id}
                  className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/30 transition-all duration-200"
                >
                  <Link href={`/store/${params.slug}/products/${product.id}`} className="block">
                    <div className="relative aspect-square overflow-hidden bg-white/5">
                      {primaryImage ? (
                        <Image
                          src={primaryImage}
                          alt={product.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          sizes="(max-width: 640px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-10 h-10 text-white/20" />
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="p-4">
                    <Link href={`/store/${params.slug}/products/${product.id}`}>
                      <h3 className="text-sm font-medium text-white/90 line-clamp-2 hover:text-white transition-colors">
                        {product.title}
                      </h3>
                    </Link>
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-bold text-white" style={{ color: meta.accentColor }}>
                        {formatPrice(product.price, product.currency ?? "MAD")}
                      </span>
                      <AddToCartButton product={product as never} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating WhatsApp button */}
      {waLink && (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-400 text-white rounded-full p-4 shadow-2xl transition-all hover:scale-110"
          aria-label="Contact on WhatsApp"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
      )}
    </div>
  );
}
