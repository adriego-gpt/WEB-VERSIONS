import { useEffect } from "react";

let activeLocks = 0;
let lockedOverflow = "";
let lockedPaddingRight = "";

export function useBodyScrollLock(shouldLock) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!shouldLock) return undefined;

    const { body, documentElement } = document;
    if (activeLocks === 0) {
      lockedOverflow = body.style.overflow;
      lockedPaddingRight = body.style.paddingRight;
      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);
      body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks > 0) return;
      body.style.overflow = lockedOverflow;
      body.style.paddingRight = lockedPaddingRight;
      lockedOverflow = "";
      lockedPaddingRight = "";
    };
  }, [shouldLock]);
}
