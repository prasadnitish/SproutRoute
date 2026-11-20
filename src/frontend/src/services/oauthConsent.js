// Only a registered host callback may receive authorization codes or state.
export function trustedCallback(value, callbacks) {
  const url = new URL(value);
  const target = url.origin + url.pathname;
  const allowedParams = [
    "code",
    "state",
    "error",
    "error_description",
    "error_uri",
    "iss",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !callbacks.includes(target) ||
    [...url.searchParams.keys()].some((key) => !allowedParams.includes(key))
  )
    throw new Error("Unrecognized connector callback.");
  return url.href;
}
