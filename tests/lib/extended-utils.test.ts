import {
  truncate,
  slugify,
  titleCase,
  getInitials,
  formatNumber,
  formatPercentage,
  clamp,
  lerp,
  mapRange,
  formatBytes,
  calculateReadTime,
  isValidEmail,
  isValidUrl,
  isBlank,
  hasMinLength,
  groupBy,
  uniqueBy,
  chunk,
  shuffle,
  pick,
  omit,
  isEmpty,
  stringToColor,
  hexToRgb,
  rgbToHex,
  getContrastColor,
  debounce,
  throttle,
} from "@/lib/extended-utils";

describe("String Utilities", () => {
  describe("truncate", () => {
    it("returns original string if under max length", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("truncates with ellipsis at max length", () => {
      expect(truncate("hello world this is long", 10)).toBe("hello w...");
    });

    it("handles exact length", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });
  });

  describe("slugify", () => {
    it("converts to lowercase kebab-case", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("removes special characters", () => {
      expect(slugify("Hello! @World#")).toBe("hello-world");
    });

    it("handles multiple spaces", () => {
      expect(slugify("Hello   World")).toBe("hello-world");
    });

    it("trims leading/trailing dashes", () => {
      expect(slugify(" Hello World ")).toBe("hello-world");
    });
  });

  describe("titleCase", () => {
    it("capitalizes first letter of each word", () => {
      expect(titleCase("hello world")).toBe("Hello World");
    });

    it("handles already capitalized", () => {
      expect(titleCase("HELLO WORLD")).toBe("Hello World");
    });
  });

  describe("getInitials", () => {
    it("returns first two initials", () => {
      expect(getInitials("Harsha Bonthada")).toBe("HB");
    });

    it("handles single name", () => {
      expect(getInitials("Harsha")).toBe("H");
    });

    it("limits to 2 characters", () => {
      expect(getInitials("Harsha Venkata Bonthada")).toBe("HV");
    });
  });
});

describe("Number Utilities", () => {
  describe("formatNumber", () => {
    it("formats thousands", () => {
      expect(formatNumber(1500)).toBe("1.5K");
    });

    it("formats millions", () => {
      expect(formatNumber(2500000)).toBe("2.5M");
    });

    it("formats billions", () => {
      expect(formatNumber(1200000000)).toBe("1.2B");
    });

    it("keeps small numbers as-is", () => {
      expect(formatNumber(999)).toBe("999");
    });
  });

  describe("formatPercentage", () => {
    it("formats with default decimal", () => {
      expect(formatPercentage(94.235)).toBe("94.2%");
    });

    it("formats with custom decimals", () => {
      expect(formatPercentage(94.235, 2)).toBe("94.23%");
    });
  });

  describe("clamp", () => {
    it("clamps above max", () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it("clamps below min", () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it("returns value within range", () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });
  });

  describe("lerp", () => {
    it("interpolates at 0", () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it("interpolates at 1", () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it("interpolates at 0.5", () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });
  });

  describe("mapRange", () => {
    it("maps value from one range to another", () => {
      expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    });
  });

  describe("formatBytes", () => {
    it("formats bytes", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
    });

    it("formats KB", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("formats MB", () => {
      expect(formatBytes(1048576)).toBe("1 MB");
    });

    it("formats GB", () => {
      expect(formatBytes(1073741824)).toBe("1 GB");
    });
  });

  describe("calculateReadTime", () => {
    it("calculates read time from word count", () => {
      const text = Array(400).fill("word").join(" ");
      expect(calculateReadTime(text)).toBe("2 min read");
    });

    it("rounds up to 1 min minimum", () => {
      expect(calculateReadTime("short")).toBe("1 min read");
    });
  });
});

describe("Validation Utilities", () => {
  describe("isValidEmail", () => {
    it("accepts valid emails", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("test@sub.domain.com")).toBe(true);
    });

    it("rejects invalid emails", () => {
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("@no-user.com")).toBe(false);
    });
  });

  describe("isValidUrl", () => {
    it("accepts valid URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://localhost:3000")).toBe(true);
    });

    it("rejects invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("isBlank", () => {
    it("detects blank strings", () => {
      expect(isBlank("")).toBe(true);
      expect(isBlank("   ")).toBe(true);
      expect(isBlank(null)).toBe(true);
      expect(isBlank(undefined)).toBe(true);
    });

    it("detects non-blank strings", () => {
      expect(isBlank("hello")).toBe(false);
    });
  });

  describe("hasMinLength", () => {
    it("validates minimum length", () => {
      expect(hasMinLength("hello", 3)).toBe(true);
      expect(hasMinLength("hi", 3)).toBe(false);
    });
  });
});

describe("Array & Object Utilities", () => {
  describe("groupBy", () => {
    it("groups items by key function", () => {
      const items = [
        { name: "a", type: "x" },
        { name: "b", type: "y" },
        { name: "c", type: "x" },
      ];
      const result = groupBy(items, (i) => i.type);
      expect(Object.keys(result)).toEqual(["x", "y"]);
      expect(result["x"]).toHaveLength(2);
      expect(result["y"]).toHaveLength(1);
    });
  });

  describe("uniqueBy", () => {
    it("removes duplicates by key", () => {
      const items = [
        { id: "1", name: "a" },
        { id: "2", name: "b" },
        { id: "1", name: "c" },
      ];
      expect(uniqueBy(items, (i) => i.id)).toHaveLength(2);
    });
  });

  describe("chunk", () => {
    it("splits array into chunks", () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("handles chunk size larger than array", () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });
  });

  describe("shuffle", () => {
    it("returns array of same length", () => {
      const arr = [1, 2, 3, 4, 5];
      expect(shuffle(arr)).toHaveLength(5);
    });

    it("does not modify original array", () => {
      const arr = [1, 2, 3, 4, 5];
      shuffle(arr);
      expect(arr).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("pick", () => {
    it("picks specified keys", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
    });
  });

  describe("omit", () => {
    it("omits specified keys", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
    });
  });

  describe("isEmpty", () => {
    it("detects empty objects", () => {
      expect(isEmpty({})).toBe(true);
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });
});

describe("Color Utilities", () => {
  describe("stringToColor", () => {
    it("returns consistent HSL color", () => {
      const color1 = stringToColor("test");
      const color2 = stringToColor("test");
      expect(color1).toBe(color2);
    });

    it("returns different colors for different strings", () => {
      expect(stringToColor("a")).not.toBe(stringToColor("b"));
    });
  });

  describe("hexToRgb", () => {
    it("converts hex to RGB", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
    });

    it("returns null for invalid hex", () => {
      expect(hexToRgb("invalid")).toBeNull();
    });
  });

  describe("rgbToHex", () => {
    it("converts RGB to hex", () => {
      expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
      expect(rgbToHex(0, 255, 0)).toBe("#00ff00");
    });
  });

  describe("getContrastColor", () => {
    it("returns white for dark backgrounds", () => {
      expect(getContrastColor("#000000")).toBe("#ffffff");
    });

    it("returns black for light backgrounds", () => {
      expect(getContrastColor("#ffffff")).toBe("#000000");
    });
  });
});

describe("Timing Utilities", () => {
  describe("debounce", () => {
    jest.useFakeTimers();

    it("delays execution", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 300);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();
      jest.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("throttle", () => {
    jest.useFakeTimers();

    it("limits call frequency", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 300);

      throttled();
      throttled();
      throttled();

      expect(fn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(300);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
