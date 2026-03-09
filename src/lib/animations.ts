/**
 * Animation Configuration Library
 * 
 * Centralized animation presets, transitions, and variant configurations
 * for Framer Motion across the entire Circuvent Technologies website.
 */

// ============================================================
// TRANSITION PRESETS
// ============================================================

export const transitions = {
  /** Default spring transition */
  spring: {
    type: "spring" as const,
    stiffness: 300,
    damping: 25,
    mass: 0.8,
  },
  /** Gentle spring for subtle movements */
  springGentle: {
    type: "spring" as const,
    stiffness: 100,
    damping: 20,
    mass: 1,
  },
  /** Bouncy spring for playful elements */
  springBouncy: {
    type: "spring" as const,
    stiffness: 400,
    damping: 15,
    mass: 0.5,
  },
  /** Smooth tween for fades */
  smooth: {
    type: "tween" as const,
    duration: 0.4,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
  /** Quick tween for snappy UI */
  quick: {
    type: "tween" as const,
    duration: 0.2,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
  /** Slow tween for dramatic reveals */
  dramatic: {
    type: "tween" as const,
    duration: 0.8,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
  /** Exit transition */
  exit: {
    type: "tween" as const,
    duration: 0.2,
    ease: [0.22, 0, 0.36, 0] as [number, number, number, number],
  },
};

// ============================================================
// ANIMATION VARIANTS
// ============================================================

/**
 * Page transition variants
 */
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: transitions.exit,
  },
};

/**
 * Fade in up variants for scroll-triggered elements
 */
export const fadeInUp = {
  hidden: {
    opacity: 0,
    y: 40,
  },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...transitions.smooth,
      delay,
    },
  }),
};

/**
 * Fade in from left
 */
export const fadeInLeft = {
  hidden: {
    opacity: 0,
    x: -40,
  },
  visible: (delay: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: {
      ...transitions.smooth,
      delay,
    },
  }),
};

/**
 * Fade in from right
 */
export const fadeInRight = {
  hidden: {
    opacity: 0,
    x: 40,
  },
  visible: (delay: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: {
      ...transitions.smooth,
      delay,
    },
  }),
};

/**
 * Scale in variants for modal/popup elements
 */
export const scaleIn = {
  hidden: {
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: transitions.exit,
  },
};

/**
 * Staggered children animation
 */
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: (staggerDelay: number = 0.08) => ({
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.1,
    },
  }),
};

export const staggerItem = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

/**
 * Card hover variants
 */
export const cardHover = {
  rest: {
    y: 0,
    scale: 1,
    boxShadow: "var(--shadow-sm)",
  },
  hover: {
    y: -6,
    scale: 1.01,
    boxShadow: "var(--shadow-lg)",
    transition: transitions.spring,
  },
  tap: {
    scale: 0.98,
    transition: transitions.quick,
  },
};

/**
 * Button hover variants
 */
export const buttonHover = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.03,
    transition: transitions.spring,
  },
  tap: {
    scale: 0.97,
    transition: transitions.quick,
  },
};

/**
 * Icon rotation variants
 */
export const iconRotate = {
  rest: {
    rotate: 0,
  },
  hover: {
    rotate: 180,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

/**
 * Expand/collapse variants for accordion
 */
export const expandCollapse = {
  collapsed: {
    height: 0,
    opacity: 0,
    overflow: "hidden" as const,
  },
  expanded: {
    height: "auto",
    opacity: 1,
    overflow: "visible" as const,
    transition: {
      height: {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      },
      opacity: {
        duration: 0.2,
        delay: 0.1,
      },
    },
  },
};

/**
 * Navigation bar variants based on scroll
 */
export const navbarVariants = {
  top: {
    backgroundColor: "transparent",
    backdropFilter: "blur(0px)",
    borderBottomColor: "transparent",
  },
  scrolled: {
    backgroundColor: "var(--bg-overlay)",
    backdropFilter: "blur(20px)",
    borderBottomColor: "var(--border-primary)",
  },
};

/**
 * Mobile menu variants
 */
export const mobileMenuVariants = {
  closed: {
    opacity: 0,
    y: -20,
    pointerEvents: "none" as const,
  },
  open: {
    opacity: 1,
    y: 0,
    pointerEvents: "auto" as const,
    transition: {
      duration: 0.3,
      staggerChildren: 0.1,
    },
  },
};

export const mobileMenuItemVariants = {
  closed: {
    opacity: 0,
    x: -20,
  },
  open: {
    opacity: 1,
    x: 0,
    transition: transitions.smooth,
  },
};

// ============================================================
// ANIMATION UTILITIES
// ============================================================

/**
 * Generate staggered delay for list items
 */
export function getStaggerDelay(
  index: number, 
  baseDelay: number = 0.08,
  maxDelay: number = 1.5
): number {
  return Math.min(index * baseDelay, maxDelay);
}

/**
 * Generate viewport intersection options
 */
export function getViewportOptions(options?: {
  once?: boolean;
  margin?: string;
  amount?: "some" | "all" | number;
}) {
  return {
    once: options?.once ?? true,
    margin: options?.margin ?? "-80px",
    amount: options?.amount ?? ("some" as const),
  };
}

/**
 * Responsive animation config — reduces motion for users who prefer it
 */
export function getResponsiveAnimation(
  animation: Record<string, unknown>,
  prefersReducedMotion: boolean
): Record<string, unknown> {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.1 },
    };
  }
  return animation;
}

// ============================================================
// SCROLL-BASED ANIMATION CONFIGS
// ============================================================

/**
 * Parallax scroll configuration
 */
export const parallaxConfig = {
  /** Background parallax (slow follow) */
  background: {
    inputRange: [0, 1],
    outputRange: [0, -100],
  },
  /** Foreground parallax (fast follow) */
  foreground: {
    inputRange: [0, 1],
    outputRange: [0, 50],
  },
  /** Hero section parallax */
  hero: {
    inputRange: [0, 1],
    outputRange: [0, -200],
  },
};

/**
 * Scroll-triggered progress bar configuration
 */
export const scrollProgressConfig = {
  /** Reading progress bar at top of page */
  readingProgress: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 60,
    gradient: "from-cyan-500 via-violet-500 to-pink-500",
  },
};

// ============================================================
// THEME-AWARE ANIMATION CONFIGS
// ============================================================

/**
 * Glow animation for dark theme
 */
export const glowAnimation = {
  dark: {
    boxShadow: [
      "0 0 20px rgba(6, 182, 212, 0)",
      "0 0 20px rgba(6, 182, 212, 0.15)",
      "0 0 20px rgba(6, 182, 212, 0)",
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
  light: {
    boxShadow: [
      "0 0 15px rgba(8, 145, 178, 0)",
      "0 0 15px rgba(8, 145, 178, 0.08)",
      "0 0 15px rgba(8, 145, 178, 0)",
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

/**
 * Floating animation for decorative elements
 */
export const floatingAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

/**
 * Pulse animation for status indicators
 */
export const pulseAnimation = {
  scale: [1, 1.2, 1],
  opacity: [0.7, 1, 0.7],
  transition: {
    duration: 1.5,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

/**
 * Shimmer effect for loading states
 */
export const shimmerAnimation = {
  backgroundPosition: ["-200% 0", "200% 0"],
  transition: {
    duration: 1.5,
    repeat: Infinity,
    ease: "linear",
  },
};

/**
 * Typewriter cursor blink
 */
export const cursorBlink = {
  opacity: [1, 0, 1],
  transition: {
    duration: 0.8,
    repeat: Infinity,
    ease: "steps(1)",
  },
};

/**
 * Orbital rotation for hero graphic
 */
export const orbitalRotation = (duration: number = 20) => ({
  rotate: 360,
  transition: {
    duration,
    repeat: Infinity,
    ease: "linear",
  },
});

/**
 * Counter animation config
 */
export const counterAnimation = {
  duration: 2000,
  delay: 200,
  easing: (t: number) => 1 - Math.pow(1 - t, 3), // ease-out-cubic
};

// ============================================================
// CSS ANIMATION KEYFRAMES (for use with Tailwind)
// ============================================================

export const cssAnimations = {
  /** Gradient rotation keyframes */
  gradientRotate: `
    @keyframes gradient-rotate {
      0% { --angle: 0deg; }
      100% { --angle: 360deg; }
    }
  `,
  /** Glow pulse keyframes */
  glowPulse: `
    @keyframes glow-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
  `,
  /** Float animation keyframes */
  float: `
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-6px); }
    }
  `,
  /** Shimmer effect keyframes */
  shimmer: `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `,
  /** Spin animation */
  spin: `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `,
  /** Bounce animation */
  bounce: `
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-25%); }
    }
  `,
  /** Ping animation for notifications */
  ping: `
    @keyframes ping {
      75%, 100% {
        transform: scale(2);
        opacity: 0;
      }
    }
  `,
  /** Slide in from right */
  slideInRight: `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `,
  /** Slide in from left */
  slideInLeft: `
    @keyframes slideInLeft {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `,
};

// ============================================================
// GESTURE CONFIGS
// ============================================================

/**
 * Drag constraints for card elements
 */
export const dragConstraints = {
  card: {
    top: -10,
    bottom: 10,
    left: -10,
    right: 10,
  },
  slider: {
    top: 0,
    bottom: 0,
  },
};

/**
 * Swipe threshold for mobile interactions
 */
export const swipeConfig = {
  swipeThreshold: 50,
  swipeVelocityThreshold: 500,
  springConfig: transitions.spring,
};
