import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, MessageCircle, ShoppingCart, Star, ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";

const WHATSAPP: Record<string, string> = {
  clothes: "212600000000",
  "3dprint": "212600000000",
};

async function getProduct(id: string) {
  try {
    const res = await fetch(
      `${process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:8000"}/products/${id}`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string; id: string };
}): Promise<Metadata> {
  const product = await getProduct(params.id);
  return {
    title: product?.title ?? "Product",
    description: product?.description ?? "",
  };
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const product = await getProduct(params.id);
  if (!product) notFound();

  const primaryImage =
    product.media?.find((m: { is_primary: boolean }) => m.is_primary)?.url ??
    product.media?.[0]?.url;

  const whatsappNumber = WHATSAPP[params.slug];
  const waLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Hi MoStyle! I'm interested in: ${product.title} (${formatPrice(product.price, product.currency)})`
      )}`
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-white/40 mb-8">
          <Link href="/" className="hover:text-white/70 transition-colors">MoStyle</Link>
          <span>/</span>
          <Link href={`/store/${params.slug}`} className="hover:text-white/70 transition-colors capitalize">
            {params.slug.replace("3dprint", "3D Print")}
          </Link>
          <span>/</span>
          <span className="text-white/60 line-clamp-1">{product.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Image */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10">
              {primaryImage ? (
                <Image
                  src={primaryImage}
                  alt={product.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-20 h-20 text-white/20" />
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {product.media?.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {product.media.map((m: { id: string; url: string; is_primary: boolean }) => (
                  <div
                    key={m.id}
                    className={`relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                      m.is_primary ? "border-white/60" : "border-white/10"
                    }`}
                  >
                    <Image src={m.url} alt="" fill className="object-cover" sizes="80px" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col gap-6">
            {product.category && (
              <span className="text-xs font-medium text-white/40 uppercase tracking-widest">
                {product.category.name}
              </span>
            )}

            <h1 className="text-3xl font-bold text-white leading-tight">{product.title}</h1>

            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-white">
                {formatPrice(product.price, product.currency ?? "MAD")}
              </span>
              <span className="text-sm text-green-400 font-medium">Cash on delivery</span>
            </div>

            {product.rating > 0 && (
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="text-sm text-white/70">{product.rating.toFixed(1)}</span>
              </div>
            )}

            {product.description && (
              <p className="text-white/60 text-sm leading-relaxed">{product.description}</p>
            )}

            {/* Labels */}
            {product.labels?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.labels.map((l: { id: string; name: string }) => (
                  <span
                    key={l.id}
                    className="px-3 py-1 rounded-full text-xs bg-white/10 text-white/60"
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              {product.stock > 0 ? (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <AddToCartButton product={product} />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Out of stock
                </div>
              )}

              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold py-3 px-5 rounded-xl transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  Order custom via WhatsApp
                </a>
              )}
            </div>

            <div className="border border-white/10 rounded-xl p-4 text-sm text-white/40 space-y-1.5">
              <p className="flex items-center gap-2">
                <span>✓</span> Cash on delivery — pay when you receive
              </p>
              <p className="flex items-center gap-2">
                <span>✓</span> Free returns within 7 days
              </p>
              <p className="flex items-center gap-2">
                <span>✓</span> Delivery across Morocco
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating WhatsApp */}
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
