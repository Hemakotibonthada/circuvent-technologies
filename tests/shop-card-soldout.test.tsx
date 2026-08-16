/**
 * The sold-out card, rendered.
 *
 * The static assertions in shop-availability.test.ts prove the wiring exists.
 * They cannot prove a shopper sees anything, and this is a change made
 * specifically because most of the catalogue is sold out — so the sold-out
 * path is the one that has to be looked at, not the happy one.
 */
import { render, screen } from "@testing-library/react";
import ProductCard from "@/components/shop/ProductCard";
import type { Product } from "@/lib/shop-data";

jest.mock("@/components/shop/CartProvider", () => ({
  useCart: () => ({ add: jest.fn(), items: [] }),
}));
jest.mock("@/components/shop/WishlistProvider", () => ({
  useWishlist: () => ({ has: () => false, toggle: jest.fn() }),
}));
jest.mock("@/components/shop/CompareProvider", () => ({
  useCompare: () => ({ has: () => false, toggle: jest.fn(), count: 0 }),
  MAX_COMPARE: 4,
}));
jest.mock("@/components/shop/AccountProvider", () => ({
  useAccount: () => ({ account: null }),
}));
jest.mock("@/components/shop/ToastProvider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
// The card is being checked for what it offers, not how it animates or how its
// artwork loads. These are the presentation wrappers around the same markup.
jest.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (p: Record<string, unknown>) => p.children ?? null }),
  useReducedMotion: () => true,
}));
jest.mock("@/components/shop/Tilt3D", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Depth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/components/shop/ProductMedia", () => ({
  __esModule: true,
  default: () => <div data-testid="product-media" />,
}));

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "smart-plug",
    slug: "circuvent-smart-plug",
    name: "Circuvent Smart Plug",
    tagline: "Switch anything from your phone",
    description: "A compact Wi-Fi smart plug.",
    price: 999,
    category: "Home Automation",
    image: "/img/product-smart-plug.svg",
    accent: "#06b6d4",
    icon: "🔌",
    specs: ["Works with Alexa"],
    stock: 5,
    rating: 4.6,
    ...over,
  }) as unknown as Product;

const draw = (p: Product) =>
  render(<ProductCard product={p} index={0} view="grid" onQuickView={() => {}} />);

describe("a card that cannot be bought", () => {
  it("offers to tell the shopper when it is back", () => {
    /*
     * The change. This card used to be a disabled button and nothing else, on
     * the one surface where somebody has already decided they want the thing.
     */
    draw(product({ stock: 0 }));
    expect(screen.getByRole("button", { name: /notify me/i })).toBeInTheDocument();
  });

  it("does not also offer a dead add-to-cart", () => {
    draw(product({ stock: 0 }));
    expect(screen.queryByRole("button", { name: /add to cart/i })).not.toBeInTheDocument();
  });

  it("still says it is out of stock", () => {
    // The badge carries the fact; the button carries the offer. Dropping the
    // badge would make a sold-out card look ordinary until the shopper pressed
    // something.
    draw(product({ stock: 0 }));
    expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
  });
});

describe("a card that can be bought is untouched", () => {
  it("still adds to cart", () => {
    draw(product({ stock: 5 }));
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /notify me/i })).not.toBeInTheDocument();
  });
});

describe("a card that is not sold out but still cannot be bought", () => {
  it("does not promise a restock for something unreleased", () => {
    /*
     * A product that has not launched has no stock by definition. Offering to
     * email somebody "when it is back" is a promise about a thing that has
     * never been anywhere.
     *
     * Matched exactly, because a coming-soon card legitimately reads "Notify
     * me at launch" on its own button — that is a different promise about a
     * different event, and a loose match would have this test pass by
     * accident on the very thing it is meant to tell apart.
     */
    draw(product({ stock: 0, releaseAt: "2099-01-01" } as Partial<Product>));
    expect(screen.queryByRole("button", { name: /^notify me$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("does not promise a restock for something withdrawn", () => {
    draw(product({ stock: 0, discontinued: true } as Partial<Product>));
    expect(screen.queryByRole("button", { name: /^notify me$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/discontinued/i)).toBeInTheDocument();
  });
});
