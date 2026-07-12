export function promptLengthBucket(text = "") {
  const length = String(text || "").trim().length;
  if (length === 0) return "empty";
  if (length <= 40) return "1-40";
  if (length <= 120) return "41-120";
  if (length <= 240) return "121-240";
  return "241+";
}

export function buildTripSearchProperties(text, properties = {}) {
  return {
    prompt_length_bucket: promptLengthBucket(text),
    has_profile: Boolean(properties.hasProfile),
  };
}

export function buildTripErrorProperties(errorCode) {
  return {
    error_code: String(errorCode || "trip_generation_failed").slice(0, 80),
  };
}
