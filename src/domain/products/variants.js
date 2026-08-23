import { FALLBACK_IMAGE } from "../../constants/product";

export function getImagesForColor(product, color) {
  const requestedColor = color && product?.imagesByColor?.[color]?.length ? color : null;
  const fallbackColor = requestedColor
    || product?.colors?.find((item) => product?.imagesByColor?.[item]?.length)
    || (product?.imagesByColor ? Object.keys(product.imagesByColor)[0] : null);
  return (fallbackColor && product?.imagesByColor?.[fallbackColor]) || [FALLBACK_IMAGE];
}

export function getCurrentImageForProduct(product, selectedColor) {
  return getImagesForColor(product, selectedColor)[0] || FALLBACK_IMAGE;
}

export function getSizesForColor(product, color) {
  return [...new Set((product?.variants || []).filter((variant) => variant.color === color).map((variant) => variant.size))];
}

export function getStockForVariant(product, color, size) {
  const match = (product?.variants || []).find((variant) => variant.color === color && variant.size === size);
  return Math.max(0, Number(match?.stock ?? 0) || 0);
}

export function hasProductAvailableStock(product) {
  return (product?.variants || []).some((variant) => Math.max(0, Number(variant?.stock ?? 0) || 0) > 0);
}

export function getFallbackSelection(product, preferredSelection = null) {
  const safeColor = product?.colors?.[0] || "General";
  const safeSize = product?.sizes?.[0] || "Unica";
  if (!product) {
    return { color: safeColor, size: safeSize, availableStock: 0 };
  }

  const desiredColor = preferredSelection?.color;
  const desiredSize = preferredSelection?.size;
  if (desiredColor && desiredSize) {
    const desiredStock = getStockForVariant(product, desiredColor, desiredSize);
    if (desiredStock > 0) {
      return { color: desiredColor, size: desiredSize, availableStock: desiredStock };
    }
  }

  if (desiredColor) {
    const firstForColor = (product.variants || []).find((variant) => variant.color === desiredColor && (Number(variant.stock) || 0) > 0);
    if (firstForColor) {
      return {
        color: firstForColor.color,
        size: firstForColor.size,
        availableStock: Math.max(0, Number(firstForColor.stock) || 0),
      };
    }
  }

  const defaultColor = product.colors?.[0];
  if (defaultColor) {
    const firstForDefaultColor = (product.variants || []).find((variant) => variant.color === defaultColor && (Number(variant.stock) || 0) > 0);
    if (firstForDefaultColor) {
      return {
        color: firstForDefaultColor.color,
        size: firstForDefaultColor.size,
        availableStock: Math.max(0, Number(firstForDefaultColor.stock) || 0),
      };
    }
  }

  const firstAvailable = (product.variants || []).find((variant) => (Number(variant.stock) || 0) > 0);
  if (firstAvailable) {
    return {
      color: firstAvailable.color,
      size: firstAvailable.size,
      availableStock: Math.max(0, Number(firstAvailable.stock) || 0),
    };
  }

  return { color: safeColor, size: safeSize, availableStock: 0 };
}

export function getSelectionForColor(product, preferredSelection = null) {
  const safeColor = product?.colors?.[0] || "General";
  const safeSize = product?.sizes?.[0] || "Unica";
  if (!product) {
    return { color: safeColor, size: safeSize, availableStock: 0 };
  }

  const availableColors = Array.isArray(product.colors) && product.colors.length
    ? product.colors
    : [...new Set((product.variants || []).map((variant) => variant.color).filter(Boolean))];
  const desiredColor = preferredSelection?.color && availableColors.includes(preferredSelection.color)
    ? preferredSelection.color
    : (availableColors[0] || safeColor);

  const sizesForColor = getSizesForColor(product, desiredColor);
  const desiredSize = preferredSelection?.size;
  const desiredSizeStock = desiredSize ? getStockForVariant(product, desiredColor, desiredSize) : 0;
  if (desiredSize && sizesForColor.includes(desiredSize) && desiredSizeStock > 0) {
    return {
      color: desiredColor,
      size: desiredSize,
      availableStock: desiredSizeStock,
    };
  }

  const firstAvailableSize = sizesForColor.find((size) => getStockForVariant(product, desiredColor, size) > 0);
  const fallbackSize = firstAvailableSize
    || (desiredSize && sizesForColor.includes(desiredSize) ? desiredSize : "")
    || sizesForColor[0]
    || safeSize;

  return {
    color: desiredColor,
    size: fallbackSize,
    availableStock: getStockForVariant(product, desiredColor, fallbackSize),
  };
}

export function getStockStatus(stock) {
  if (stock <= 0) return { label: "Agotado", tone: "danger" };
  if (stock === 1) return { label: "Solo queda 1", tone: "dark" };
  if (stock <= 3) return { label: `Quedan ${stock}`, tone: "warning" };
  return { label: "Disponible", tone: "success" };
}
