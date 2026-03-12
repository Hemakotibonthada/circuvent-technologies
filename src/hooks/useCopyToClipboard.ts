"use client";

import { useState, useCallback } from "react";

interface UseCopyToClipboardResult {
  copiedText: string | null;
  isCopied: boolean;
  copy: (text: string) => Promise<boolean>;
  reset: () => void;
}

export function useCopyToClipboard(
  resetAfterMs: number = 2000
): UseCopyToClipboardResult {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!navigator?.clipboard) {
        console.warn("Clipboard not supported");
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopiedText(text);
        setIsCopied(true);

        if (resetAfterMs > 0) {
          setTimeout(() => {
            setIsCopied(false);
            setCopiedText(null);
          }, resetAfterMs);
        }

        return true;
      } catch {
        console.warn("Failed to copy to clipboard");
        setCopiedText(null);
        setIsCopied(false);
        return false;
      }
    },
    [resetAfterMs]
  );

  const reset = useCallback(() => {
    setCopiedText(null);
    setIsCopied(false);
  }, []);

  return { copiedText, isCopied, copy, reset };
}
