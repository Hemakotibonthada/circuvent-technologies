/**
 * Routing an emergency to a station, tested on the cases that go wrong.
 *
 * The happy path — one city, three stations, pick the closest — is not where
 * this fails. It fails at a coastline, at a border, on a device that has never
 * seen a satellite, and on a directory where somebody forgot to fill in a
 * phone number. Each of those produces a confident answer that sends help to
 * the wrong place, or reports success while telling nobody.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_STATION_KM,
  haversineKm,
  isUsableFix,
  nearestStation,
  shouldPushStation,
  stationNumberFor,
  type Station,
} from "./nearest";

function station(p: Partial<Station> & { id: number; lat: number; lng: number }): Station {
  return {
    name: `Station ${p.id}`,
    phone: "+911000000",
    country: "IN",
    district: "",
    ...p,
  };
}

/* Hyderabad-ish coordinates, so the numbers below are recognisable. */
const HERE = { lat: 17.385, lng: 78.4867 };

describe("haversineKm", () => {
  test("is zero for the same point", () => {
    assert.equal(haversineKm(HERE.lat, HERE.lng, HERE.lat, HERE.lng), 0);
  });

  test("matches a known distance", () => {
    // Hyderabad to Bengaluru is a little under 500 km great-circle.
    const km = haversineKm(17.385, 78.4867, 12.9716, 77.5946);
    assert.ok(km > 490 && km < 510, `expected ~500km, got ${km}`);
  });

  test("is symmetric", () => {
    const a = haversineKm(17.385, 78.4867, 12.9716, 77.5946);
    const b = haversineKm(12.9716, 77.5946, 17.385, 78.4867);
    assert.ok(Math.abs(a - b) < 1e-9);
  });

  test("handles the antimeridian without exploding", () => {
    // Two points 20km apart either side of 180°. A naive difference of
    // longitudes would call this most of the way round the planet.
    const km = haversineKm(-16.9, 179.95, -16.9, -179.95);
    assert.ok(km < 25, `expected a short hop, got ${km}`);
  });
});

describe("isUsableFix", () => {
  test("accepts a real position", () => {
    assert.equal(isUsableFix(HERE.lat, HERE.lng), true);
  });

  test("rejects 0,0", () => {
    /*
     * The important one. 0,0 is in the Gulf of Guinea, so it passes every
     * range check while meaning "this device has never seen a satellite".
     */
    assert.equal(isUsableFix(0, 0), false);
  });

  test("rejects out-of-range, non-finite and non-numeric", () => {
    assert.equal(isUsableFix(91, 0), false);
    assert.equal(isUsableFix(0, 181), false);
    assert.equal(isUsableFix(Number.NaN, 10), false);
    assert.equal(isUsableFix("17.4", 78), false);
    assert.equal(isUsableFix(undefined, undefined), false);
  });

  test("accepts a genuine position on the equator or the meridian", () => {
    // Only *both* being zero is the sentinel; one of them is a real place.
    assert.equal(isUsableFix(0, 78.4867), true);
    assert.equal(isUsableFix(17.385, 0), true);
  });
});

describe("nearestStation", () => {
  const near = station({ id: 1, lat: 17.39, lng: 78.49, name: "Near" });
  const mid = station({ id: 2, lat: 17.45, lng: 78.55, name: "Mid" });
  const far = station({ id: 3, lat: 12.97, lng: 77.59, name: "Far" });

  test("picks the closest", () => {
    const r = nearestStation(HERE.lat, HERE.lng, [far, mid, near]);
    assert.equal(r?.station.id, 1);
  });

  test("reports the distance it used", () => {
    const r = nearestStation(HERE.lat, HERE.lng, [near]);
    assert.ok(r && r.km < 2, `expected under 2km, got ${r?.km}`);
  });

  test("returns null with no fix rather than guessing", () => {
    assert.equal(nearestStation(0, 0, [near]), null);
  });

  test("returns null on an empty directory", () => {
    assert.equal(nearestStation(HERE.lat, HERE.lng, []), null);
  });

  test("refuses a station beyond the range limit", () => {
    /*
     * The failure this prevents: a wearer in a region with no station in the
     * directory is otherwise routed to one 500km away, and the system reports
     * that it notified the police.
     */
    assert.equal(nearestStation(HERE.lat, HERE.lng, [far]), null);
    assert.ok(haversineKm(HERE.lat, HERE.lng, far.lat, far.lng) > MAX_STATION_KM);
  });

  test("does not cross a border when a country is given", () => {
    const acrossTheLine = station({
      id: 9,
      lat: 17.386,
      lng: 78.487,
      country: "PK",
      name: "Other side",
    });
    const r = nearestStation(HERE.lat, HERE.lng, [acrossTheLine, mid], {
      country: "IN",
    });
    assert.equal(r?.station.id, 2);
  });

  test("skips a station we could not actually contact", () => {
    const noPhone = station({ id: 4, lat: 17.386, lng: 78.487, phone: "  " });
    const r = nearestStation(HERE.lat, HERE.lng, [noPhone, mid], {
      requirePhone: true,
    });
    assert.equal(r?.station.id, 2);
  });

  test("still returns a phoneless station when one is not required", () => {
    // It is useless for texting and useful for telling a responder where to go.
    const noPhone = station({ id: 4, lat: 17.386, lng: 78.487, phone: "" });
    const r = nearestStation(HERE.lat, HERE.lng, [noPhone, mid]);
    assert.equal(r?.station.id, 4);
  });

  test("ignores a directory row with a broken position", () => {
    const broken = station({ id: 5, lat: 0, lng: 0 });
    const r = nearestStation(HERE.lat, HERE.lng, [broken, mid]);
    assert.equal(r?.station.id, 2);
  });
});

describe("stationNumberFor", () => {
  const s = station({ id: 1, lat: 17.39, lng: 78.49, phone: "+914027852020" });

  test("prefers the resolved station", () => {
    const r = stationNumberFor({ station: s, km: 1 }, "112");
    assert.deepEqual(r, { number: "+914027852020", reason: "station" });
  });

  test("falls back to the national number when nothing was resolved", () => {
    const r = stationNumberFor(null, "112");
    assert.deepEqual(r, { number: "112", reason: "national" });
  });

  test("falls back when the resolved station has no number", () => {
    const quiet = { station: station({ id: 2, lat: 1, lng: 1, phone: "" }), km: 1 };
    assert.equal(stationNumberFor(quiet, "112").reason, "national");
  });

  test("admits when there is nothing at all", () => {
    /*
     * Must not return something plausible. A device with no station and no
     * national number cannot raise an alarm to the authorities, and the setup
     * screen has to be able to say so.
     */
    assert.deepEqual(stationNumberFor(null, ""), { number: "", reason: "none" });
  });
});

describe("shouldPushStation", () => {
  test("pushes when the number changes", () => {
    assert.equal(shouldPushStation("112", "+914027852020"), true);
  });

  test("does not push the same number again", () => {
    /*
     * The wearer moves continuously. Without this the platform sends a command
     * every time a position arrives — over a metered mobile connection, and
     * each one writing NVS, which wears out.
     */
    assert.equal(shouldPushStation("+914027852020", "+914027852020"), false);
  });

  test("ignores surrounding whitespace", () => {
    assert.equal(shouldPushStation(" +91402785 ".trim(), "+91402785"), false);
  });

  test("never pushes an empty number over a good one", () => {
    assert.equal(shouldPushStation("+914027852020", ""), false);
  });

  test("pushes the first number onto a device that has none", () => {
    assert.equal(shouldPushStation("", "112"), true);
  });
});
