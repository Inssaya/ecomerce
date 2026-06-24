import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface RecommendedProduct {
  id: string;
  title: string;
  price: number;
  media: Array<{ url: string; is_primary: boolean }>;
}

interface Props {
  title?: string;
  productIds: string[];
  products: RecommendedProduct[];
}

export function RecommendationRail({ title = "Recommandé pour vous", products }: Props) {
  if (products.length === 0) return null;

  return (
    <section className="py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {products.map((product) => {
          const image = product.media?.find((m) => m.is_primary)?.url ?? product.media?.[0]?.url;
          return (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="flex-shrink-0 w-44 snap-start group"
            >
              <div className="aspect-square w-full rounded-xl overflow-hidden bg-gray-100 mb-2">
                {image ? (
                  <img
                    src={image}
                    alt={product.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-300 text-4xl">
                    ?
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight mb-1">
                {product.title}
              </p>
              <p className="text-sm font-bold text-orange-600">{formatPrice(product.price)}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
