// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Firmware Version Value Object
// ══════════════════════════════════════════════════════════════════════════════

import { FirmwareVersion } from "../../../src/domain/value-objects/firmware-version.vo";

describe("FirmwareVersion", () => {
  describe("Parsing", () => {
    it("should parse valid semver string", () => {
      const v = FirmwareVersion.parse("2.1.3");
      expect(v.major).toBe(2);
      expect(v.minor).toBe(1);
      expect(v.patch).toBe(3);
    });

    it("should parse pre-release version", () => {
      const v = FirmwareVersion.parse("3.0.0-beta.1");
      expect(v.major).toBe(3);
      expect(v.preRelease).toBe("beta.1");
    });

    it("should reject invalid format", () => {
      expect(() => FirmwareVersion.parse("1.2")).toThrow("Invalid firmware version");
      expect(() => FirmwareVersion.parse("abc")).toThrow("Invalid firmware version");
      expect(() => FirmwareVersion.parse("")).toThrow("Invalid firmware version");
    });

    it("should create from components", () => {
      const v = FirmwareVersion.create(1, 0, 0);
      expect(v.toString()).toBe("1.0.0");
    });

    it("should reject negative components", () => {
      expect(() => FirmwareVersion.create(-1, 0, 0)).toThrow("non-negative");
    });
  });

  describe("Comparison", () => {
    it("should detect older version", () => {
      const v1 = FirmwareVersion.parse("1.2.3");
      const v2 = FirmwareVersion.parse("2.0.0");
      expect(v1.isOlderThan(v2)).toBe(true);
    });

    it("should detect newer version", () => {
      const v1 = FirmwareVersion.parse("2.0.0");
      const v2 = FirmwareVersion.parse("1.9.9");
      expect(v1.isNewerThan(v2)).toBe(true);
    });

    it("should detect equal versions", () => {
      const v1 = FirmwareVersion.parse("2.1.0");
      const v2 = FirmwareVersion.parse("2.1.0");
      expect(v1.equals(v2)).toBe(true);
    });

    it("should compare minor versions correctly", () => {
      const v1 = FirmwareVersion.parse("2.1.0");
      const v2 = FirmwareVersion.parse("2.2.0");
      expect(v1.isOlderThan(v2)).toBe(true);
    });

    it("should compare patch versions correctly", () => {
      const v1 = FirmwareVersion.parse("2.1.3");
      const v2 = FirmwareVersion.parse("2.1.4");
      expect(v1.isOlderThan(v2)).toBe(true);
    });
  });

  describe("Compatibility", () => {
    it("should detect compatible versions (same major)", () => {
      const v1 = FirmwareVersion.parse("2.1.0");
      const v2 = FirmwareVersion.parse("2.5.0");
      expect(v1.isCompatibleWith(v2)).toBe(true);
    });

    it("should detect breaking changes (major bump)", () => {
      const v1 = FirmwareVersion.parse("1.9.0");
      const v2 = FirmwareVersion.parse("2.0.0");
      expect(v1.isBreakingChange(v2)).toBe(true);
    });

    it("should allow safe minor rollback", () => {
      const v1 = FirmwareVersion.parse("2.5.0");
      const v2 = FirmwareVersion.parse("2.3.0");
      const check = v1.canSafelyRollbackTo(v2);
      expect(check.safe).toBe(true);
    });

    it("should warn on major rollback", () => {
      const v1 = FirmwareVersion.parse("3.0.0");
      const v2 = FirmwareVersion.parse("2.9.0");
      const check = v1.canSafelyRollbackTo(v2);
      expect(check.safe).toBe(false);
      expect(check.reason).toContain("Major version rollback");
    });

    it("should prevent 'rollback' to newer version", () => {
      const v1 = FirmwareVersion.parse("2.0.0");
      const v2 = FirmwareVersion.parse("2.5.0");
      const check = v1.canSafelyRollbackTo(v2);
      expect(check.safe).toBe(false);
      expect(check.reason).toContain("upgrade");
    });
  });

  describe("Distance", () => {
    it("should calculate version distance", () => {
      const v1 = FirmwareVersion.parse("1.2.3");
      const v2 = FirmwareVersion.parse("3.0.0");
      const d = v1.distanceTo(v2);
      expect(d.major).toBe(2);
      expect(d.minor).toBe(2);
      expect(d.patch).toBe(3);
    });
  });

  describe("Serialization", () => {
    it("should serialize to string", () => {
      expect(FirmwareVersion.parse("2.1.0").toString()).toBe("2.1.0");
      expect(FirmwareVersion.parse("3.0.0-rc.1").toString()).toBe("3.0.0-rc.1");
    });
  });
});
