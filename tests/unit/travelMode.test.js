import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveTravelMode } from "../../src/backend/services/travelMode.js";

describe("deriveTravelMode", () => {
  it('returns "drive" when distance < 500 miles (NYC to DC)', () => {
    // NYC: 40.7128, -74.0060  DC: 38.9072, -77.0369  (~225 miles)
    const result = deriveTravelMode({
      originLat: 40.7128,
      originLon: -74.006,
      destLat: 38.9072,
      destLon: -77.0369,
      countryCode: "US",
    });
    assert.equal(result, "drive");
  });

  it('returns "fly" when distance >= 500 miles (NYC to Miami)', () => {
    // NYC: 40.7128, -74.0060  Miami: 25.7617, -80.1918  (~1,090 miles)
    const result = deriveTravelMode({
      originLat: 40.7128,
      originLon: -74.006,
      destLat: 25.7617,
      destLon: -80.1918,
      countryCode: "US",
    });
    assert.equal(result, "fly");
  });

  it('returns "fly" when countryCode is not "US" (international)', () => {
    // London: 51.5074, -0.1278
    const result = deriveTravelMode({
      originLat: 40.7128,
      originLon: -74.006,
      destLat: 51.5074,
      destLon: -0.1278,
      countryCode: "GB",
    });
    assert.equal(result, "fly");
  });

  it('returns "fly" when countryCode is not "US" even if distance < 500 (Detroit to Windsor, ON)', () => {
    // Detroit: 42.3314, -83.0458  Windsor: 42.3149, -83.0364  (~1 mile)
    const result = deriveTravelMode({
      originLat: 42.3314,
      originLon: -83.0458,
      destLat: 42.3149,
      destLon: -83.0364,
      countryCode: "CA",
    });
    assert.equal(result, "fly");
  });

  it('returns "fly" as default when lat/lon not available', () => {
    const result = deriveTravelMode({
      countryCode: "US",
    });
    assert.equal(result, "fly");
  });

  it('allows frontend override — explicit "fly" overrides short distance', () => {
    const result = deriveTravelMode({
      originLat: 40.7128,
      originLon: -74.006,
      destLat: 38.9072,
      destLon: -77.0369,
      countryCode: "US",
      override: "fly",
    });
    assert.equal(result, "fly");
  });

  it('allows frontend override — explicit "drive" overrides long distance', () => {
    const result = deriveTravelMode({
      originLat: 40.7128,
      originLon: -74.006,
      destLat: 25.7617,
      destLon: -80.1918,
      countryCode: "US",
      override: "drive",
    });
    assert.equal(result, "drive");
  });
});
