import "@testing-library/jest-dom";

/*
 * Every file-backed store writes under DATA_DIR, which defaults to ./.data —
 * the developer's real one. Left alone, a test that files an incident leaves it
 * in the console, and a test that asserts on "the incidents in the store" is
 * really asserting on whatever previous runs happened to leave behind.
 *
 * Pointed at a temp directory named for the test file, so files are isolated
 * from the working tree, from each other, and from parallel workers. Set here
 * rather than in a test because setupFilesAfterEnv runs before the test module
 * is evaluated, and data-file.ts reads DATA_DIR once at import.
 */
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require("os");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  const key = (expect.getState().testPath || "shared").replace(/[^a-z0-9]/gi, "-").slice(-60);
  const dir = path.join(os.tmpdir(), "cv-jest-data", key);
  /*
   * Emptied, not just pointed at. A directory keyed on the test file survives
   * between runs, so the second run of a suite would start with whatever the
   * first one wrote — which is the same leak this exists to prevent, only
   * slower to notice. It cost an afternoon: a test that filed an incident
   * passed once and then failed forever after, because the incident was
   * already there and the deduplicating bridge correctly refused to file it
   * twice.
   */
  fs.rmSync(dir, { recursive: true, force: true });
  process.env.DATA_DIR = dir;
}

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Mock framer-motion
jest.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        return function MotionComponent({
          children,
          ...props
        }: {
          children?: React.ReactNode;
          [key: string]: unknown;
        }) {
          const Component = prop as string;
          const filteredProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(props)) {
            if (
              !key.startsWith("animate") &&
              !key.startsWith("initial") &&
              !key.startsWith("exit") &&
              !key.startsWith("transition") &&
              !key.startsWith("variants") &&
              !key.startsWith("whileHover") &&
              !key.startsWith("whileTap") &&
              !key.startsWith("whileInView") &&
              !key.startsWith("viewport") &&
              key !== "layoutId" &&
              key !== "layout"
            ) {
              filteredProps[key] = value;
            }
          }
          if (Component === "div" || Component === "span" || Component === "button" || Component === "a" || Component === "header") {
            const El = Component as keyof JSX.IntrinsicElements;
            return <El {...(filteredProps as React.HTMLAttributes<HTMLElement>)}>{children}</El>;
          }
          return <div {...(filteredProps as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
        };
      },
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useInView: () => true,
  useMotionValue: () => ({ set: jest.fn(), get: () => 0 }),
  useTransform: () => 0,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
}));

/*
 * TextEncoder/TextDecoder, which jsdom does not provide.
 *
 * Node has had both as globals since v11 and every runtime this ships to has
 * them; jsdom is the only environment in the stack that does not. So a module
 * that is perfectly correct in production — anything doing CBOR or binary
 * decoding, WebAuthn included — fails to import under test with
 * "TextDecoder is not defined", which reads as a broken dependency rather than
 * a gap in the test environment.
 *
 * Taken from node:util so the test environment matches the real one instead of
 * a reimplementation of it.
 */
if (typeof globalThis.TextDecoder === "undefined" || typeof globalThis.TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TextEncoder, TextDecoder } = require("util");
  globalThis.TextEncoder = globalThis.TextEncoder ?? TextEncoder;
  globalThis.TextDecoder = globalThis.TextDecoder ?? TextDecoder;
}

// Browser-only globals — guarded so tests using the `node` test environment
// (e.g. database/adapter tests) can share this setup file without crashing.
if (typeof window !== "undefined") {
  // Mock matchMedia
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Mock IntersectionObserver
  class MockIntersectionObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: MockIntersectionObserver,
  });

  // Mock ResizeObserver
  class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: MockResizeObserver,
  });
}
