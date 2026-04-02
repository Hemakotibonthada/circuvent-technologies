// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — MAC Address Value Object
// Immutable, validated, normalized MAC address representation.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * MAC Address value object. Validates format, normalizes to uppercase colon-
 * separated notation (AA:BB:CC:DD:EE:FF).
 *
 * @invariant Must be exactly 6 octets in hex
 * @invariant Stored in normalized uppercase colon format
 *
 * @example
 * ```ts
 * const mac = MacAddress.create("aa-bb-cc-dd-ee-ff");
 * console.log(mac.toString()); // "AA:BB:CC:DD:EE:FF"
 * console.log(mac.toOUI());    // "AA:BB:CC"
 * ```
 */
export class MacAddress {
  private readonly value: string;

  private constructor(normalized: string) {
    this.value = normalized;
  }

  /**
   * Creates a validated MAC address from various input formats.
   * Accepts: "AA:BB:CC:DD:EE:FF", "AA-BB-CC-DD-EE-FF", "AABBCCDDEEFF"
   *
   * @throws Error if the format is invalid
   */
  static create(input: string): MacAddress {
    const cleaned = input.replace(/[:\-.\s]/g, "").toUpperCase();

    if (!/^[0-9A-F]{12}$/.test(cleaned)) {
      throw new Error(
        `Invalid MAC address: '${input}'. Expected 12 hex characters ` +
        `(e.g., 'AA:BB:CC:DD:EE:FF' or 'AABBCCDDEEFF')`
      );
    }

    // Normalize to colon-separated uppercase
    const normalized = cleaned.match(/.{2}/g)!.join(":");
    return new MacAddress(normalized);
  }

  /**
   * Creates without validation (for data already known to be valid).
   * Use only when loading from the database.
   */
  static fromTrusted(mac: string): MacAddress {
    return new MacAddress(mac.toUpperCase());
  }

  /** Returns the OUI (Organizationally Unique Identifier) — first 3 octets */
  toOUI(): string {
    return this.value.split(":").slice(0, 3).join(":");
  }

  /** Returns the NIC-specific portion — last 3 octets */
  toNIC(): string {
    return this.value.split(":").slice(3).join(":");
  }

  /** Checks if this is a multicast address (LSB of first octet = 1) */
  isMulticast(): boolean {
    const firstOctet = parseInt(this.value.split(":")[0], 16);
    return (firstOctet & 0x01) === 1;
  }

  /** Checks if this is a locally administered address (second LSB of first octet = 1) */
  isLocallyAdministered(): boolean {
    const firstOctet = parseInt(this.value.split(":")[0], 16);
    return (firstOctet & 0x02) === 2;
  }

  equals(other: MacAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  /** For JSON serialization */
  toJSON(): string {
    return this.value;
  }
}
