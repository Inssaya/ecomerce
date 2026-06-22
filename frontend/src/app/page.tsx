import Link from "next/link";
import { ShoppingBag, Store, Truck, Shield } from "lucide-react";
import { getCategories, getProducts } from "@/lib/api";
import { CategoryCard } from "@/components/CategoryCard";
import { ProductCard } from "@/components/ProductCard";

export default async function HomePage() {
  const [categories, productsData] = await Promise.allSettled([
    getCategories(),
    getProducts({ status: "active", size: 8, sort_by: "view_count" }),
  ]);

  const cats = categories.status === "fulfilled" ? categories.value.slice(0, 8) : [];
  const products = productsData.status === "fulfilled" ? productsData.value.items : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
          <ShoppingBag className="w-4 h-4" />
          Marketplace Multi-Vendeurs — Maroc
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-foreground leading-tight mb-6">
          Tout ce dont vous avez besoin,{" "}
          <span className="text-primary">livré chez vous</span>
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10">
          Découvrez des milliers de produits sélectionnés par des vendeurs vérifiés.
          Paiement à la livraison, suivi en temps réel.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/products"
            className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Explorer les produits
          </Link>
          <Link
            href="/seller/onboarding"
            className="px-8 py-3 bg-white border border-border rounded-xl font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Devenir vendeur
          </Link>
        </div>
      </section>

      {/* Categories */}
      {cats.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Parcourir par catégorie</h2>
            <Link href="/categories" className="text-sm text-primary hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {cats.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        </section>
      )}

      {/* Popular products */}
      {products.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Populaires en ce moment</h2>
            <Link href="/products" className="text-sm text-primary hover:underline">
              Voir tout
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Feature cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Store className="w-6 h-6 text-primary" />}
            title="Vendeurs vérifiés"
            description="Chaque vendeur passe par un processus de vérification KYC rigoureux."
          />
          <FeatureCard
            icon={<Truck className="w-6 h-6 text-primary" />}
            title="Paiement à la livraison"
            description="Payez uniquement à la réception de votre commande. Aucune carte requise."
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6 text-primary" />}
            title="Achat sécurisé"
            description="Vos achats sont couverts par notre programme de protection acheteur."
          />
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © 2026 Ecomerce · Maroc 🇲🇦
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
