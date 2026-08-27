/**
 * Safe mobile haptic feedback utility for e-commerce interactions.
 * Respects browser support and user reduced-motion preferences.
 */

const HAPTIC_PATTERNS = {
  selection: 15,
  light: 25,
  medium: 40,
  success: [30, 50, 40],
  warning: [50, 80, 50],
};

/**
 * Triggers a subtle tactile vibration on supported mobile devices.
 * 
 * @param {'selection' | 'light' | 'medium' | 'success' | 'warning'} type 
 */
export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;

  // Respect user preference for reduced motion
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return;
    }
  } catch {
    // Ignore media query evaluation errors in unsupported environments
  }

  try {
    const pattern = Object.prototype.hasOwnProperty.call(HAPTIC_PATTERNS, type)
      ? HAPTIC_PATTERNS[type]
      : HAPTIC_PATTERNS.light;
    navigator.vibrate(pattern);
  } catch {
    // Graceful silent fallback for non-supported or restricted browser environments
  }
}
