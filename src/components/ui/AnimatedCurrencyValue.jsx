import React from "react";
import { currency } from "../../utils/currency";

export function AnimatedCurrencyValue({ value, className = "" }) {
  // Financial amounts must match the order immediately, including rapid edits.
  // Avoid intermediate totals and frame-by-frame React renders on mobile.
  return <span className={className}>{currency(Number(value) || 0)}</span>;
}

export default AnimatedCurrencyValue;
