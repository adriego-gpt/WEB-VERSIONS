import React, { useEffect, useRef, useState } from "react";
import { currency } from "../../utils/currency";

export function AnimatedCurrencyValue({ value, className = "", duration = 360 }) {
  const target = Number(value) || 0;
  const [animatedValue, setAnimatedValue] = useState(target);
  const previousValueRef = useRef(target);

  useEffect(() => {
    const from = previousValueRef.current;
    if (Math.abs(from - target) < 0.01) {
      previousValueRef.current = target;
      return undefined;
    }

    let frameId = 0;
    const startTime = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      const nextValue = from + ((target - from) * eased);
      setAnimatedValue(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        previousValueRef.current = target;
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, target]);

  return <span className={className}>{currency(animatedValue)}</span>;
}

export default AnimatedCurrencyValue;
