/**
 * The shop must not claim to be selling things it cannot sell.
 *
 * WHAT WENT WRONG
 *
 * The listing page led with "22 Devices in stock". That number was
 * `products.length` — the size of the catalogue, which has nothing to do with
 * stock. Twenty-one of the twenty-two were sold out, so the first thing a
 * shopper read sat directly above a grid of "Out of stock" badges, and was
 * provably false by the time their eye reached the second row.
 *
 * A number that looks authoritative and is wrong is worse than no number: it
 * is the page telling somebody it does not know what it is talking about,
 * before they have scrolled.
 *
 * The second half is the dead end. A sold-out card was a disabled button and
 * nothing else, on the one surface where a shopper has already decided they
 * want the thing — they are looking at it and they know the price. The demand
 * was real and it was thrown away.
 */
import fs from "node:fs";
import path from "node:path";

import { productAvailability } from "@/lib/product-availability";

const root = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");

const shopPage = read("src", "app", "shop", "page.tsx");
const card = read("src", "components", "shop", "ProductCard.tsx");
const cardButton = read("src", "components", "shop", "RestockCardButton.tsx");
const detailForm = read("src", "components", "shop", "RestockNotify.tsx");
const hook = read("src", "components", "shop", "useRestockAlert.ts");

describe("the in-stock figure is counted, not assumed", () => {
  it("no longer reports the catalogue size as stock", () => {
    expect(shopPage).not.toMatch(/value: `\$\{products\.length\}`,\s*label: "Devices in stock"/);
  });

  it("derives it from the same availability rule the cards use", () => {
    // One owner for "can this be bought". A second opinion here is how the
    // headline and the grid end up disagreeing again.
    expect(shopPage).toMatch(/productAvailability\(p\)\.canBuy/);
  });

  it("says what the number means when it is not the whole catalogue", () => {
    // "0 in stock of 22" is a fact somebody can act on. "22 devices in stock"
    // above sold-out cards is not.
    expect(shopPage).toMatch(/In stock of \$\{products\.length\}/);
  });

  it("counts the way the page now claims to", () => {
    /*
     * The arithmetic itself, against the same helper the page imports — so
     * this fails if `canBuy` ever starts meaning something else.
     */
    const catalogue = [
      { id: "a", stock: 4 },
      { id: "b", stock: 0 },
      { id: "c", available: false, stock: 9 },
      { id: "d", stock: 2, releaseAt: "2099-01-01" },
      { id: "e", stock: 1, discontinued: true },
      { id: "f", stock: 7 },
    ];
    const buyable = catalogue.filter((p) => productAvailability(p).canBuy).length;
    expect(buyable).toBe(2);
    expect(buyable).not.toBe(catalogue.length);
  });
});

describe("a sold-out card offers something other than refusal", () => {
  it("renders a restock control instead of a dead button", () => {
    expect(card).toMatch(/RestockCardButton/);
    expect(card).toMatch(/availability\.offerRestockAlert \?/);
  });

  it("asks availability rather than re-deciding what sold out means", () => {
    /*
     * `offerRestockAlert` rather than `soldOut`, and the difference is not
     * cosmetic: a product that has not launched has no stock by definition, and
     * one that is discontinued is never coming back. Offering to email either
     * of them "when it is back" is a promise nobody can keep.
     */
    const avail = (input: Parameters<typeof productAvailability>[0]) =>
      productAvailability(input).offerRestockAlert;
    expect(avail({ stock: 0 })).toBe(true);
    expect(avail({ stock: 0, releaseAt: "2099-01-01" })).toBe(false);
    expect(avail({ stock: 0, discontinued: true })).toBe(false);
    expect(avail({ stock: 5 })).toBe(false);
  });
});

describe("the restock request is written once", () => {
  it("both surfaces go through the shared hook", () => {
    /*
     * The card is a button and the detail page is a full-width form, which is
     * exactly the situation that produces two implementations of one request.
     * They then drift: one learns that a signed-in shopper needs no email
     * field, or that a dropped connection is not a refusal, and the other does
     * not.
     */
    expect(cardButton).toMatch(/useRestockAlert/);
    expect(detailForm).toMatch(/useRestockAlert/);
  });

  it("neither surface calls the endpoint itself", () => {
    for (const src of [cardButton, detailForm]) {
      expect(src).not.toMatch(/notify-restock/);
      expect(src).not.toMatch(/fetch\(/);
    }
    expect(hook).toMatch(/\/api\/notify-restock/);
  });

  it("does not ask a signed-in shopper for an address it already has", () => {
    expect(hook).toMatch(/needsEmail: !account\?\.email/);
    expect(cardButton).toMatch(/if \(!alert\.needsEmail\)/);
  });

  it("tells a dropped connection apart from a refusal", () => {
    /*
     * "Could not subscribe" on a network failure reads as the shop rejecting
     * the request, and somebody who believes they were refused does not try
     * again — which is the whole value of asking.
     */
    expect(hook).toMatch(/Could not reach the shop/);
    expect(hook).toMatch(/Could not subscribe/);
  });
});
