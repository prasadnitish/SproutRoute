export function bucketTextLength(value) {
  const length = typeof value === "number" ? value : String(value || "").trim().length;
  if (length <= 0) return "empty";
  if (length <= 40) return "1-40";
  if (length <= 120) return "41-120";
  if (length <= 240) return "121-240";
  return "241+";
}

export function parserLogContext({ reqId, text, detectedLat, detectedLon }) {
  const textLen = String(text || "").length;
  return {
    reqId,
    textLen,
    textLengthBucket: bucketTextLength(textLen),
    hasDetectedLocation:
      Number.isFinite(Number.parseFloat(detectedLat)) &&
      Number.isFinite(Number.parseFloat(detectedLon)),
  };
}
