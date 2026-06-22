import Link from "next/link";
import { ShoppingBag, Store, Truck, Shield } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <span className="text-2xl font-bold text-primary">Ecomerce</span>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/products" className="hover:text-foreground transition-colors">
              Produits
            </Link>
            <Link href="/categories" className="hover:text-foreground transition-colors">
              Catégories
            </Link>
            <Link href="/sellers" className="hover:text-foreground transition-colors">
              Vendeurs
            </Link>
          </nav>
          <div className="flex gap-3">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Connexion
            </Link>
            <Link
              href="/auth/register"
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
            >
              S&apos;inscrire
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <ShoppingBag className="w-4 h-4" />
            Marketplace Multi-Vendeurs
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-foreground leading-tight mb-6">
            Tout ce dont vous avez besoin,{" "}
            <span className="text-primary">livré chez vous</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10">
            Découvrez des milliers de produits sélectionnés par des vendeurs vérifiés.
            Paiement à la livraison, suivi en temps réel, recommandations personnalisées.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/products"
              className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Explorer les produits
            </Link>
            <Link
              href="/seller/onboarding"
              className="px-8 py-3 bg-white border border-border rounded-lg font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Devenir vendeur
            </Link>
          </div>
        </section>

        {/* Feature cards */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Store className="w-6 h-6 text-primary" />}
              title="Vendeurs vérifiés"
              description="Chaque vendeur passe par un processus de vérification KYC rigoureux pour garantir votre sécurité."
            />
            <FeatureCard
              icon={<Truck className="w-6 h-6 text-primary" />}
              title="Paiement à la livraison"
              description="Payez uniquement à la réception de votre commande. Aucune carte bancaire requise."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-primary" />}
              title="Achat sécurisé"
              description="Vos données sont protégées et vos achats sont couverts par notre programme de protection acheteur."
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 Ecomerce. Tous droits réservés. — Maroc 🇲🇦</p>
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
    <div className="bg-white rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
