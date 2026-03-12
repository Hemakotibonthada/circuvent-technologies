// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Firmware Version Value Object
// Semantic version parsing, comparison, and compatibility checking.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Firmware Version value object implementing Semantic Versioning (SemVer).
 * Provides comparison, compatibility, and rollback safety checks.
 *
 * @invariant Follows MAJOR.MINOR.PATCH format
 * @invariant Versions are immutable once created
 *
 * @example
 * ```ts
 * const v1 = FirmwareVersion.parse("2.1.0");
 * const v2 = FirmwareVersion.parse("2.2.0");
 *
 * v1.isOlderThan(v2);      // true
 * v1.isCompatibleWith(v2);  // true (same major)
 * v1.isBreakingChange(v2);  // false
 * ```
 */
export class FirmwareVersion {
  public readonly major: number;
  public readonly minor: number;
  public readonly patch: number;
  public readonly preRelease: string | null;

  private constructor(major: number, minor: number, patch: number, preRelease: string | null = null) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.preRelease = preRelease;
  }

  /**
   * Parses a version string.
   * @param version String like "1.2.3", "2.0.0-beta.1"
   * @throws Error if format is invalid
   */
  static parse(version: string): FirmwareVersion {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) {
      throw new Error(
        `Invalid firmware version: '${version}'. Expected format: MAJOR.MINOR.PATCH[-prerelease]`
      );
    }
    return new FirmwareVersion(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
      match[4] || null,
    );
  }

  /** Creates from individual components */
  static create(major: number, minor: number, patch: number): FirmwareVersion {
    if (major < 0 || minor < 0 || patch < 0) {
      throw new Error("Version components must be non-negative");
    }
    return new FirmwareVersion(major, minor, patch);
  }

  // ── Comparison ─────────────────────────────────────────────────────────────

  /** Returns true if this version is older than the other */
  isOlderThan(other: FirmwareVersion): boolean {
    return this.compareTo(other) < 0;
  }

  /** Returns true if this version is newer than the other */
  isNewerThan(other: FirmwareVersion): boolean {
    return this.compareTo(other) > 0;
  }

  /** Returns: -1 (older), 0 (same), 1 (newer) */
  compareTo(other: FirmwareVersion): number {
    if (this.major !== other.major) return this.major > other.major ? 1 : -1;
    if (this.minor !== other.minor) return this.minor > other.minor ? 1 : -1;
    if (this.patch !== other.patch) return this.patch > other.patch ? 1 : -1;
    return 0;
  }

  equals(other: FirmwareVersion): boolean {
    return this.compareTo(other) === 0;
  }

  // ── Compatibility Checks ──────────────────────────────────────────────────

  /**
   * Checks if upgrading from this version to `target` is a safe minor/patch update.
   * Compatible = same major version (per SemVer contract).
   */
  isCompatibleWith(target: FirmwareVersion): boolean {
    return this.major === target.major;
  }

  /**
   * Checks if upgrading to `target` is a breaking change (major version bump).
   */
  isBreakingChange(target: FirmwareVersion): boolean {
    return target.major > this.major;
  }

  /**
   * Determines the minimum safe rollback version.
   * Rule: Can rollback within the same major.minor, cannot rollback across major.
   */
  canSafelyRollbackTo(target: FirmwareVersion): { safe: boolean; reason?: string } {
    if (target.major < this.major) {
      return { safe: false, reason: `Major version rollback (${this.major}→${target.major}) may cause data incompatibility` };
    }
    if (target.equals(this)) {
      return { safe: false, reason: "Already on this version" };
    }
    if (target.isNewerThan(this)) {
      return { safe: false, reason: "Target is newer — this is an upgrade, not a rollback" };
    }
    return { safe: true };
  }

  /**
   * Calculates the distance between two versions.
   * Useful for determining if an OTA update is a big jump.
   */
  distanceTo(other: FirmwareVersion): { major: number; minor: number; patch: number } {
    return {
      major: Math.abs(this.major - other.major),
      minor: Math.abs(this.minor - other.minor),
      patch: Math.abs(this.patch - other.patch),
    };
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toString(): string {
    const base = `${this.major}.${this.minor}.${this.patch}`;
    return this.preRelease ? `${base}-${this.preRelease}` : base;
  }

  toJSON(): string {
    return this.toString();
  }
}
