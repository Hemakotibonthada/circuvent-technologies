"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseCountUpOptions {
  start?: number;
  end: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  easing?: (t: number) => number;
  onComplete?: () => void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp({
  start = 0,
  end,
  duration = 2000,
  delay = 0,
  decimals = 0,
  easing = easeOutCubic,
  onComplete,
}: UseCountUpOptions): {
  value: number;
  formattedValue: string;
  isComplete: boolean;
  reset: () => void;
} {
  const [value, setValue] = useState(start);
  const [isComplete, setIsComplete] = useState(false);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const animate = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(progress);

      const currentValue = start + (end - start) * easedProgress;
      setValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setValue(end);
        setIsComplete(true);
        onComplete?.();
      }
    },
    [start, end, duration, easing, onComplete]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      startTimeRef.current = 0;
      animationRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationRef.current);
    };
  }, [animate, delay]);

  const reset = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    setValue(start);
    setIsComplete(false);
    startTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);
  }, [start, animate]);

  const formattedValue =
    decimals > 0
      ? value.toFixed(decimals)
      : Math.round(value).toLocaleString();

  return { value, formattedValue, isComplete, reset };
}
