// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — MAC Address Value Object
// ══════════════════════════════════════════════════════════════════════════════

import { MacAddress } from "../../../src/domain/value-objects/mac-address.vo";

describe("MacAddress", () => {
  describe("Creation", () => {
    it("should create from colon-separated format", () => {
      const mac = MacAddress.create("AA:BB:CC:DD:EE:FF");
      expect(mac.toString()).toBe("AA:BB:CC:DD:EE:FF");
    });

    it("should normalize dash-separated format", () => {
      const mac = MacAddress.create("aa-bb-cc-dd-ee-ff");
      expect(mac.toString()).toBe("AA:BB:CC:DD:EE:FF");
    });

    it("should normalize continuous hex", () => {
      const mac = MacAddress.create("aabbccddeeff");
      expect(mac.toString()).toBe("AA:BB:CC:DD:EE:FF");
    });

    it("should normalize lowercase to uppercase", () => {
      const mac = MacAddress.create("ab:cd:ef:01:23:45");
      expect(mac.toString()).toBe("AB:CD:EF:01:23:45");
    });

    it("should reject invalid MAC addresses", () => {
      expect(() => MacAddress.create("invalid")).toThrow("Invalid MAC address");
      expect(() => MacAddress.create("AA:BB:CC")).toThrow("Invalid MAC address");
      expect(() => MacAddress.create("GG:HH:II:JJ:KK:LL")).toThrow("Invalid MAC address");
      expect(() => MacAddress.create("")).toThrow("Invalid MAC address");
    });
  });

  describe("OUI and NIC", () => {
    it("should extract OUI (first 3 octets)", () => {
      const mac = MacAddress.create("AA:BB:CC:DD:EE:FF");
      expect(mac.toOUI()).toBe("AA:BB:CC");
    });

    it("should extract NIC (last 3 octets)", () => {
      const mac = MacAddress.create("AA:BB:CC:DD:EE:FF");
      expect(mac.toNIC()).toBe("DD:EE:FF");
    });
  });

  describe("Multicast & Locally Administered", () => {
    it("should detect multicast MAC", () => {
      // LSB of first octet = 1 → multicast
      const mac = MacAddress.create("01:00:5E:00:00:01");
      expect(mac.isMulticast()).toBe(true);
    });

    it("should detect unicast MAC", () => {
      const mac = MacAddress.create("00:1A:2B:3C:4D:5E");
      expect(mac.isMulticast()).toBe(false);
    });

    it("should detect locally administered MAC", () => {
      // Second LSB of first octet = 1 → locally administered
      const mac = MacAddress.create("02:42:AC:11:00:02");
      expect(mac.isLocallyAdministered()).toBe(true);
    });
  });

  describe("Equality", () => {
    it("should be equal for same MAC in different formats", () => {
      const mac1 = MacAddress.create("AA:BB:CC:DD:EE:FF");
      const mac2 = MacAddress.create("aa-bb-cc-dd-ee-ff");
      expect(mac1.equals(mac2)).toBe(true);
    });

    it("should not be equal for different MACs", () => {
      const mac1 = MacAddress.create("AA:BB:CC:DD:EE:FF");
      const mac2 = MacAddress.create("11:22:33:44:55:66");
      expect(mac1.equals(mac2)).toBe(false);
    });
  });

  describe("Serialization", () => {
    it("should serialize to normalized string", () => {
      const mac = MacAddress.create("aabbccddeeff");
      expect(mac.toJSON()).toBe("AA:BB:CC:DD:EE:FF");
    });
  });
});
