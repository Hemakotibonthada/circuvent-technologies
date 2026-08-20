"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================================
// useParallax - Smooth parallax scrolling
// ============================================================================

export function useParallax(speed: number = 0.5) {
  const [offset, setOffset] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const elementCenter = rect.top + rect.height / 2;
      const relativePosition = (elementCenter - windowHeight / 2) / windowHeight;
      setOffset(relativePosition * speed * 100);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed]);

  return { ref, offset };
}

// ============================================================================
// useMouseParallax - Element movement based on mouse position
// ============================================================================

export function useMouseParallax(intensity: number = 20) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = ((e.clientX - centerX) / rect.width) * intensity;
      const y = ((e.clientY - centerY) / rect.height) * intensity;
      setPosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [intensity]);

  return { ref, position };
}

// ============================================================================
// useTypewriter - Advanced typewriter effect with multiple phrases
// ============================================================================

interface UseTypewriterOptions {
  words: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  delayBetween?: number;
  loop?: boolean;
}

export function useTypewriter({
  words,
  typingSpeed = 100,
  deletingSpeed = 50,
  delayBetween = 2000,
  loop = true,
}: UseTypewriterOptions) {
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (isComplete && !loop) return;

    const currentWord = words[wordIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting) {
      if (text.length < currentWord.length) {
        timeout = setTimeout(() => {
          setText(currentWord.slice(0, text.length + 1));
        }, typingSpeed + Math.random() * 50);
      } else {
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, delayBetween);
      }
    } else {
      if (text.length > 0) {
        timeout = setTimeout(() => {
          setText(text.slice(0, -1));
        }, deletingSpeed);
      } else {
        setIsDeleting(false);
        const nextIndex = (wordIndex + 1) % words.length;
        if (nextIndex === 0 && !loop) {
          setIsComplete(true);
        }
        setWordIndex(nextIndex);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, wordIndex, isDeleting, words, typingSpeed, deletingSpeed, delayBetween, loop, isComplete]);

  return { text, isDeleting, wordIndex, isComplete };
}

// ============================================================================
// useScrollDirection - Detect scroll direction
// ============================================================================

export function useScrollDirection() {
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      setScrollY(current);
      setDirection(current > lastScrollRef.current ? "down" : "up");
      lastScrollRef.current = current;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { direction, scrollY };
}

// ============================================================================
// useAnimationFrame - Custom animation loop
// ============================================================================

export function useAnimationFrame(callback: (deltaTime: number) => void, isRunning: boolean = true) {
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isRunning) return;

    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        callbackRef.current(deltaTime);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning]);
}

// ============================================================================
// useScrollReveal - Fine-grained scroll reveal control
// ============================================================================

interface UseScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function useScrollReveal({
  threshold = 0.1,
  rootMargin = "0px",
  once = true,
}: UseScrollRevealOptions = {}) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setProgress(entry.intersectionRatio);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
          setProgress(0);
        }
      },
      { threshold: Array.from({ length: 20 }, (_, i) => i * 0.05), rootMargin }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, isVisible, progress };
}

// ============================================================================
// useTilt - 3D tilt effect on mouse hover
// ============================================================================

export function useTilt(maxTilt: number = 15) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setTilt({
        x: (y - 0.5) * maxTilt * -1,
        y: (x - 0.5) * maxTilt,
      });
    },
    [maxTilt]
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return {
    ref,
    tilt,
    style: {
      transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
      transition: "transform 0.15s ease-out",
    },
  };
}

// ============================================================================
// useSmoothCounter - Smooth number counting
// ============================================================================

export function useSmoothCounter(
  target: number,
  duration: number = 2000,
  startOnVisible: boolean = true
) {
  const [value, setValue] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const startTime = Date.now();
    const startValue = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startValue + (target - startValue) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isVisible, target, duration]);

  return { value, ref };
}

// ============================================================================
// useColorScheme - System color scheme detection
// ============================================================================

export function useColorScheme() {
  const [scheme, setScheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setScheme(mql.matches ? "dark" : "light");

    const handler = (e: MediaQueryListEvent) => {
      setScheme(e.matches ? "dark" : "light");
    };

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return scheme;
}

// ============================================================================
// useThrottle - Throttle a value
// ============================================================================

export function useThrottle<T>(value: T, interval: number = 200): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now >= lastUpdated.current + interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timeout = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, interval);
      return () => clearTimeout(timeout);
    }
  }, [value, interval]);

  return throttledValue;
}

// ============================================================================
// usePrefersReducedMotion
// ============================================================================

export function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mql.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReduced;
}

// ============================================================================
// useOnScreen - Track if element is on screen with details
// ============================================================================

export function useOnScreen(options: IntersectionObserverInit = {}) {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => setEntry(e),
      { threshold: [0, 0.25, 0.5, 0.75, 1], ...options }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options]);

  return {
    ref,
    isIntersecting: entry?.isIntersecting ?? false,
    intersectionRatio: entry?.intersectionRatio ?? 0,
  };
}

// ============================================================================
// useMeasure - Measure element dimensions
// ============================================================================

export function useMeasure() {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.target.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      });
    });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, ...dimensions };
}

// ============================================================================
// useStaggerAnimation - Staggered animation for lists
// ============================================================================

export function useStaggerAnimation(itemCount: number, staggerDelay: number = 0.1) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const getItemProps = useCallback(
    (index: number) => ({
      initial: { opacity: 0, y: 20 },
      animate: isVisible ? { opacity: 1, y: 0 } : {},
      transition: { delay: index * staggerDelay, duration: 0.4 },
    }),
    [isVisible, staggerDelay]
  );

  return { ref, isVisible, getItemProps };
}

// ============================================================================
// useMagneticEffect - Magnetic attraction to cursor
// ============================================================================

export function useMagneticEffect(strength: number = 0.5, maxDistance: number = 100) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distX = e.clientX - centerX;
      const distY = e.clientY - centerY;
      const distance = Math.sqrt(distX * distX + distY * distY);

      if (distance < maxDistance) {
        const factor = (maxDistance - distance) / maxDistance;
        setOffset({
          x: distX * factor * strength,
          y: distY * factor * strength,
        });
      } else {
        setOffset({ x: 0, y: 0 });
      }
    },
    [strength, maxDistance]
  );

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    const el = ref.current;
    if (el) {
      el.addEventListener("mouseleave", handleMouseLeave);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (el) {
        el.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [handleMouseMove, handleMouseLeave]);

  return {
    ref,
    style: {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      transition: "transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
    },
  };
}

// ============================================================================
// useRipple - Click ripple effect
// ============================================================================

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);

  const addRipple = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple: Ripple = {
      id: nextIdRef.current++,
      x: e.clientX - rect.left - size / 2,
      y: e.clientY - rect.top - size / 2,
      size,
    };

    setRipples((prev) => [...prev, ripple]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
    }, 600);
  }, []);

  return { ref, ripples, addRipple };
}

// ============================================================================
// useSound - Sound effects (placeholder, no actual audio to avoid dependencies)
// ============================================================================

export function useSound() {
  const play = useCallback((type: "click" | "hover" | "success" | "error") => {
    // Placeholder for sound implementation
    // In production, integrate with howler.js or native Audio API
    if (typeof window !== "undefined" && "AudioContext" in window) {
      try {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        gainNode.gain.value = 0.02;

        const frequencies: Record<string, number> = {
          click: 800,
          hover: 600,
          success: 1200,
          error: 300,
        };

        oscillator.frequency.value = frequencies[type] || 600;
        oscillator.type = "sine";

        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        oscillator.stop(ctx.currentTime + 0.1);
      } catch {
        // Ignore audio errors
      }
    }
  }, []);

  return { play };
}
