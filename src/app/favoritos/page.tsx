"use client";

import { useEffect, useState } from "react";
import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { ProductCard } from "../../components/site/ProductCard";
import { SiteProduct } from "../../lib/site/catalog";
import { FavoriteProduct, listFavorites } from "../../lib/site/favorites";

function toSiteProduct(favorite: FavoriteProduct): SiteProduct {
  return {
    id: favorite.slug,
    slug: favorite.slug,
    productName: favorite.productName,
    categorySlug: null,
    platform: "shopee",
    groupId: null,
    highlightReason: null,
    description: null,
    imageUrl: favorite.imageUrl,
    priceMin: favorite.priceMin,
    priceMax: null,
    priceDiscountRate: favorite.priceDiscountRate,
    ratingStar: favorite.ratingStar,
    sales: favorite.sales,
    offerLink: null,
    updatedAt: "",
    priceCheckedAt: null,
  };
}

/**
 * Favoritos vive só no navegador (localStorage, sem conta de usuário) —
 * por isso é client component e lê os dados depois de montar, sem
 * depender do servidor.
 */
export default function FavoritosPage() {
  const [favorites, setFavorites] = useState<SiteProduct[] | null>(null);

  useEffect(() => {
    setFavorites(listFavorites().map(toSiteProduct));
  }, []);

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Favoritos</h1>
        </section>
        <section className="dc-section">
          {favorites === null ? null : favorites.length === 0 ? (
            <p className="dc-empty">
              Nenhum favorito ainda — toca no coração de um produto pra guardar aqui.
            </p>
          ) : (
            <div className="dc-grid">
              {favorites.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
