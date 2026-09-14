"use client";

import { useEffect, useState } from "react";
import { HeartIcon } from "./icons";
import { FavoriteProduct, isFavorite, toggleFavorite } from "../../lib/site/favorites";

export function FavoriteButton({ product }: { product: FavoriteProduct }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isFavorite(product.slug));
  }, [product.slug]);

  function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setActive(toggleFavorite(product));
  }

  return (
    <button
      type="button"
      className={`dc-favorite-btn${active ? " dc-favorite-active" : ""}`}
      onClick={toggle}
      aria-label={active ? "Remover dos favoritos" : "Guardar nos favoritos"}
      aria-pressed={active}
    >
      <HeartIcon size={16} filled={active} />
    </button>
  );
}
