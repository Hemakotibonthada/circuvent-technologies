/**
 * Hooks Index
 * 
 * Central export point for all custom React hooks used across the
 * Circuvent Technologies website. Import hooks from this file
 * for cleaner import statements.
 * 
 * @example
 * import { useMousePosition, useDebounce, useMediaQuery } from "@/hooks";
 */

// ============================================================
// POINTER & SCROLL HOOKS
// ============================================================

/**
 * Track mouse position with normalized coordinates
 * @returns { x, y, normalizedX, normalizedY }
 */
export { useMousePosition } from "./useMousePosition";

/**
 * Track page scroll progress (0 to 1)
 * @returns progress number between 0 and 1
 */
export { useScrollProgress } from "./useScrollProgress";

// ============================================================
// DOM OBSERVATION HOOKS
// ============================================================

/**
 * Observe element intersection with viewport
 * @returns { ref, isIntersecting, entry }
 */
export { useIntersectionObserver } from "./useIntersectionObserver";

/**
 * Detect clicks outside a referenced element
 * @returns ref to attach to the element
 */
export { useClickOutside } from "./useClickOutside";

// ============================================================
// STATE & STORAGE HOOKS
// ============================================================

/**
 * Persist state to localStorage with SSR safety
 * @returns [value, setValue, removeValue]
 */
export { useLocalStorage } from "./useLocalStorage";

/**
 * Animated counter with easing
 * @returns { value, formattedValue, isComplete, reset }
 */
export { useCountUp } from "./useCountUp";

/**
 * Read and write the document-level view settings (density, scale, width)
 * @returns { settings, ready, update, reset }
 */
export { useViewSettings } from "./useViewSettings";

// ============================================================
// TIMING HOOKS
// ============================================================

/**
 * Debounce a rapidly changing value
 * @returns debounced value
 */
export { useDebounce } from "./useDebounce";

// ============================================================
// INPUT HOOKS
// ============================================================

/**
 * Detect when a specific key is pressed
 * @returns boolean indicating if key is currently pressed
 */
export { useKeyPress, useKeyCombo } from "./useKeyPress";

/**
 * Copy text to clipboard with status tracking
 * @returns { copiedText, isCopied, copy, reset }
 */
export { useCopyToClipboard } from "./useCopyToClipboard";

// ============================================================
// RESPONSIVE HOOKS
// ============================================================

/**
 * Match a CSS media query
 * @returns boolean indicating if query matches
 */
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  usePrefersReducedMotion,
} from "./useMediaQuery";

/**
 * Track window dimensions
 * @returns { width, height, isReady }
 */
export { useWindowSize } from "./useWindowSize";
