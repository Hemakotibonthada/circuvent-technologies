import "@testing-library/jest-dom";

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
