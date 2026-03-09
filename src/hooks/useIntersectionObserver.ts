"use client";

import { useState, useEffect, useRef, RefObject } from "react";

interface IntersectionOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  freezeOnceVisible?: boolean;
}

interface IntersectionResult {
  ref: RefObject<Element | null>;
  isIntersecting: boolean;
  entry: IntersectionObserverEntry | null;
}

export function useIntersectionObserver(
  options: IntersectionOptions = {}
): IntersectionResult {
  const {
    threshold = 0,
    root = null,
    rootMargin = "0px",
    freezeOnceVisible = false,
  } = options;

  const ref = useRef<Element | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const frozen = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (frozen.current) return;

    const observer = new IntersectionObserver(
      ([observerEntry]) => {
        setEntry(observerEntry);
        setIsIntersecting(observerEntry.isIntersecting);

        if (observerEntry.isIntersecting && freezeOnceVisible) {
          frozen.current = true;
          observer.unobserve(node);
        }
      },
      { threshold, root, rootMargin }
    );

    observer.observe(node);

    return () => {
      observer.unobserve(node);
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, freezeOnceVisible]);

  return { ref, isIntersecting, entry };
}
