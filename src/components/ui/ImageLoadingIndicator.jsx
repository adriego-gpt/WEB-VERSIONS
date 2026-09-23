import React from "react";
import { RotateCw } from "lucide-react";

export function ImageLoadingIndicator({ pending }) {
  if (!pending) return null;
  return (
    <span className="image-load-indicator" aria-hidden="true">
      <span className="image-load-indicator__disc">
        <RotateCw size={22} strokeWidth={1.8} />
      </span>
    </span>
  );
}
