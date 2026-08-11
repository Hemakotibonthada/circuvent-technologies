import { osaDistance, editBudget, tokenize, squash, fuzzyMatchesToken, nearestToken } from "@/lib/fuzzy";
import { matchesQuery, correctQuery } from "@/lib/shop-filters";
import type { Product } from "@/lib/shop-data";

function product(over: Partial<Product> = {}): Product {
  const base: Product = {
    id: "p1",
    slug: "smart-plug-16a",
    name: "Smart Plug 16A",
    tagline: "Metered switching for heavy appliances",
    category: "Energy",
    price: 1499,
    description: "A Wi-Fi smart plug with energy metering.",
    specs: ["16A relay", "Wi-Fi 2.4GHz"],
  } as Product;
  return { ...base, ...over };
}

describe("osaDistance", () => {
  it("counts a transposition as one edit, not two", () => {
    // The whole reason for OSA over plain Levenshtein: plain Levenshtein
    // scores this 2 and a 1-edit budget would reject it.
    expect(osaDistance("plgu", "plug", 2)).toBe(1);
    expect(osaDistance("recieve", "receive", 2)).toBe(1);
  });

  it("counts single insert, delete and substitute as one edit", () => {
    expect(osaDistance("swich", "switch", 2)).toBe(1); // insert
    expect(osaDistance("plugg", "plug", 2)).toBe(1); // delete
    expect(osaDistance("plyg", "plug", 2)).toBe(1); // substitute
  });

  it("returns 0 for equal strings and handles empties", () => {
    expect(osaDistance("plug", "plug", 2)).toBe(0);
    expect(osaDistance("", "ab", 2)).toBe(2);
    expect(osaDistance("ab", "", 2)).toBe(2);
  });

  it("gives up past the budget instead of computing a real distance", () => {
    // Contract is "> max", not the true distance, so callers can compare
    // directly against the budget without a sentinel.
    expect(osaDistance("plug", "camera", 1)).toBeGreaterThan(1);
    expect(osaDistance("abcdefgh", "zz", 2)).toBeGreaterThan(2);
  });

  it("is symmetric", () => {
    expect(osaDistance("swich", "switch", 2)).toBe(osaDistance("switch", "swich", 2));
  });
});

describe("editBudget", () => {
  it("gives short terms no tolerance", () => {
    // One edit on a 3-letter term reaches too much of the catalogue to be useful.
    expect(editBudget("pro")).toBe(0);
    expect(editBudget("4k")).toBe(0);
  });

  it("scales tolerance with length", () => {
    expect(editBudget("plug")).toBe(1);
    expect(editBudget("switch")).toBe(1);
    expect(editBudget("thermostat")).toBe(2);
  });
});

describe("tokenize", () => {
  it("splits on punctuation and lowercases", () => {
    expect(tokenize("Wi-Fi 2.4GHz Plug!")).toEqual(["wi", "fi", "wifi", "2", "4ghz", "24ghz", "plug"]);
  });

  it("indexes a hyphenated word squashed as well as split", () => {
    // The catalogue writes "Wi-Fi"; shoppers type "wifi".
    expect(tokenize("Wi-Fi")).toContain("wifi");
  });
});

describe("squash", () => {
  it("removes punctuation inside words but keeps words apart", () => {
    expect(squash("Wi-Fi Smart Plug")).toBe("wifi smart plug");
  });

  it("does not join across a space, so terms cannot span two words", () => {
    expect(squash("plug metering")).not.toContain("ugmeter");
  });
});

describe("fuzzyMatchesToken", () => {
  const tokens = ["smart", "plug", "16a", "switch"];

  it("matches a prefix so search works mid-typing", () => {
    expect(fuzzyMatchesToken("swi", tokens)).toBe(true);
  });

  it("matches within budget but not beyond it", () => {
    expect(fuzzyMatchesToken("plgu", tokens)).toBe(true);
    expect(fuzzyMatchesToken("camera", tokens)).toBe(false);
  });

  it("matches a mistyped prefix of an inflected word", () => {
    // "swich" is 4 from "switching" as whole strings, but 1 from its opening —
    // and the catalogue says "switching", not "switch".
    expect(fuzzyMatchesToken("swich", ["metered", "switching"])).toBe(true);
    expect(fuzzyMatchesToken("meterng", ["switching", "metering"])).toBe(true);
  });

  it("does not let a short term drift onto an unrelated long word", () => {
    expect(fuzzyMatchesToken("plug", ["professional", "photography"])).toBe(false);
    // One edit from "plum", so only the prefix-length floor keeps these apart.
    expect(fuzzyMatchesToken("plug", ["plumbing"])).toBe(false);
  });
});

describe("nearestToken", () => {
  it("returns the closest token within budget", () => {
    expect(nearestToken("swich", ["camera", "switch", "sensor"])).toBe("switch");
  });

  it("returns null when nothing is close enough", () => {
    expect(nearestToken("zzzzzz", ["camera", "switch"])).toBeNull();
  });

  it("returns null for terms too short to correct safely", () => {
    expect(nearestToken("pro", ["pri", "pre"])).toBeNull();
  });
});

describe("matchesQuery", () => {
  const p = product();

  it("still matches exactly, across every searched field", () => {
    expect(matchesQuery(p, "plug")).toBe(true);
    expect(matchesQuery(p, "energy")).toBe(true); // category
    expect(matchesQuery(p, "metering")).toBe(true); // description
    expect(matchesQuery(p, "relay")).toBe(true); // specs
  });

  it("matches the typos that returned zero results in production", () => {
    expect(matchesQuery(p, "plgu")).toBe(true);
    expect(matchesQuery(p, "swich")).toBe(true);
  });

  it("matches a punctuated catalogue term typed without punctuation", () => {
    expect(matchesQuery(p, "wifi")).toBe(true);
  });

  it("requires every term to match, not just one", () => {
    expect(matchesQuery(p, "smart plug")).toBe(true);
    expect(matchesQuery(p, "smart camera")).toBe(false);
  });

  it("does not match unrelated products", () => {
    expect(matchesQuery(p, "doorbell")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesQuery(p, "   ")).toBe(true);
  });
});

describe("correctQuery", () => {
  const list = [product(), product({ id: "p2", name: "Motion Sensor", category: "Safety" })];

  it("leaves a query that already finds something alone", () => {
    // Never second-guess a real hit.
    expect(correctQuery(list, "plug")).toEqual({ effective: "plug", corrected: false });
  });

  it("corrects a typo that finds nothing", () => {
    expect(correctQuery(list, "swich")).toEqual({ effective: "switching", corrected: true });
  });

  it("leaves a genuinely unknown word alone rather than inventing a match", () => {
    const out = correctQuery(list, "zzzzzz");
    expect(out.corrected).toBe(false);
    expect(out.effective).toBe("zzzzzz");
  });

  it("returns an empty query unchanged", () => {
    expect(correctQuery(list, "")).toEqual({ effective: "", corrected: false });
  });
});
