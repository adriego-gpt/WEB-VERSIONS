import { useEffect } from "react";

let activeLocks = 0;
let lockedHtmlOverflow = "";
let lockedBodyOverflow = "";
let lockedPaddingRight = "";

export function useBodyScrollLock(shouldLock) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!shouldLock) return undefined;

    const { body, documentElement } = document;
    if (activeLocks === 0) {
      lockedHtmlOverflow = documentElement.style.overflow;
      lockedBodyOverflow = body.style.overflow;
      lockedPaddingRight = body.style.paddingRight;
      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);
      
      documentElement.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks > 0) return;
      documentElement.style.overflow = lockedHtmlOverflow;
      body.style.overflow = lockedBodyOverflow;
      body.style.paddingRight = lockedPaddingRight;
      lockedHtmlOverflow = "";
      lockedBodyOverflow = "";
      lockedPaddingRight = "";
    };
  }, [shouldLock]);
}
