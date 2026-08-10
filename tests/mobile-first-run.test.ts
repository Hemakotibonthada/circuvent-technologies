import {
  PERMISSIONS,
  RELOCK_AFTER_MS,
  biometricAvailable,
  canPrompt,
  pending,
  shouldLock,
  shouldRunFirstRun,
  type PermissionKey,
  type PermissionState,
} from "../mobile/src/first-run";

const states = (over: Partial<Record<PermissionKey, PermissionState>> = {}): Record<PermissionKey, PermissionState> => ({
  notifications: "undetermined",
  location: "undetermined",
  camera: "undetermined",
  ...over,
});

describe("asking for permissions", () => {
  /*
   * iOS shows a permission dialog once. After a refusal, request() returns
   * denied immediately and displays nothing, so an app that keeps calling it
   * looks broken. Anything already decided has to go to Settings instead.
   */
  it("only counts a prompt as possible when nothing has been decided", () => {
    expect(canPrompt("undetermined")).toBe(true);
    expect(canPrompt("denied")).toBe(false);
    expect(canPrompt("granted")).toBe(false);
  });

  it("skips the whole first-run screen when every answer is already recorded", () => {
    const decided = states({ notifications: "granted", location: "denied", camera: "granted" });
    expect(shouldRunFirstRun(decided, false)).toBe(false);
  });

  it("shows it when something can still be asked", () => {
    expect(shouldRunFirstRun(states({ notifications: "granted" }), false)).toBe(true);
  });

  it("does not show it twice", () => {
    expect(shouldRunFirstRun(states(), true)).toBe(false);
  });

  it("asks only for what is still open, in order", () => {
    const list = pending(states({ camera: "granted" }));
    expect(list.map((p) => p.key)).toEqual(["notifications", "location"]);
  });

  /*
   * The first prompt is the one most likely to be granted, and a granted prompt
   * makes the next more likely to be read. Location goes last: most wariness,
   * least essential.
   */
  it("leads with notifications and leaves location until last", () => {
    expect(PERMISSIONS[0].key).toBe("notifications");
    expect(PERMISSIONS[PERMISSIONS.length - 1].key).toBe("location");
  });

  it("treats none of them as required, because the app works without any", () => {
    expect(PERMISSIONS.every((p) => !p.required)).toBe(true);
  });

  it("explains each one in terms of what it is for", () => {
    for (const p of PERMISSIONS) {
      expect(p.why.length).toBeGreaterThan(30);
      expect(p.title).toBeTruthy();
    }
  });
});

describe("whether a biometric lock can be offered", () => {
  /*
   * A fingerprint reader with nothing enrolled cannot authenticate anybody.
   * Offering the switch there gives someone a way to lock themselves out of
   * their own app with no route back in.
   */
  it("is not offered on hardware with nothing enrolled and no passcode", () => {
    expect(biometricAvailable({ hasHardware: true, isEnrolled: false, hasPasscode: false })).toBe(false);
  });

  it("is offered when a passcode exists, which the OS will accept as a fallback", () => {
    expect(biometricAvailable({ hasHardware: true, isEnrolled: false, hasPasscode: true })).toBe(true);
    expect(biometricAvailable({ hasHardware: false, isEnrolled: false, hasPasscode: true })).toBe(true);
  });

  it("is offered when a fingerprint or face is enrolled", () => {
    expect(biometricAvailable({ hasHardware: true, isEnrolled: true, hasPasscode: false })).toBe(true);
  });
});

describe("when to demand a fingerprint", () => {
  const base = { enabled: true, available: true, now: 1_000_000 };

  it("locks on a cold start", () => {
    expect(shouldLock({ ...base, backgroundedAt: null })).toEqual({ lock: true });
  });

  it("locks after a long absence", () => {
    expect(shouldLock({ ...base, backgroundedAt: base.now - RELOCK_AFTER_MS })).toEqual({ lock: true });
  });

  /*
   * Being challenged after switching out for ten seconds to read a code from a
   * text message is what makes people turn the lock off — at which point it
   * protects nothing at all.
   */
  it("does not lock on a brief switch away", () => {
    expect(shouldLock({ ...base, backgroundedAt: base.now - 5_000 })).toEqual({ lock: false, reason: "recent" });
  });

  it("stays out of the way when the setting is off", () => {
    expect(shouldLock({ ...base, enabled: false, backgroundedAt: null })).toEqual({ lock: false, reason: "disabled" });
  });

  /*
   * If the device lost its enrolment since the setting was turned on, locking
   * would present a challenge that cannot be answered.
   */
  it("does not lock when the device can no longer authenticate anybody", () => {
    expect(shouldLock({ ...base, available: false, backgroundedAt: null })).toEqual({
      lock: false,
      reason: "unavailable",
    });
  });

  it("locks rather than trusts a clock that moved backwards", () => {
    expect(shouldLock({ ...base, backgroundedAt: base.now + 60_000 })).toEqual({ lock: true });
    expect(shouldLock({ ...base, backgroundedAt: Number.NaN })).toEqual({ lock: true });
  });
});
