import React from "react";
import { RotateCw } from "lucide-react";

export function ImageLoadingIndicator({ pending }) {
  if (!pending) return null;
  return <span className="image-load-indicator" aria-hidden="true"><RotateCw size={20} strokeWidth={1.8} /></span>;
}
