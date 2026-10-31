import { useState, useEffect, useCallback, useRef } from "react";
import { requestBrowserLocation } from "../utils/locationRequest.js";

// Location comes only from the browser, after the visitor allows it. There is deliberately no IP-based
// fallback: that sent the visitor's address to a third party before any consent.
//
// On load the browser is asked once, quietly: a yes sets the location, anything else leaves the screen
// unchanged. The "Use my location" button calls request(), which also reports a refusal or a failure.
export function useGeolocation() {
  const [state, setState] = useState({ location: null, status: "idle" });
  const latest = useRef(0);
  const geolocation = typeof navigator !== "undefined" ? navigator.geolocation : undefined;

  const run = useCallback(async ({ explicit }) => {
    const attempt = ++latest.current;
    if (explicit) setState((current) => ({ ...current, status: "requesting" }));
    const result = await requestBrowserLocation(geolocation, { timeoutMs: explicit ? 10000 : 5000 });
    if (attempt !== latest.current) return;
    if (result.status === "granted") setState({ location: result.location, status: "granted" });
    else if (result.status === "unavailable" || explicit) setState({ location: null, status: result.status });
    else setState({ location: null, status: "idle" });
  }, [geolocation]);

  useEffect(() => { run({ explicit: false }); }, [run]);

  const request = useCallback(() => run({ explicit: true }), [run]);
  const clear = useCallback(() => {
    latest.current += 1; // drop an answer that is still on its way
    setState({ location: null, status: "idle" });
  }, []);

  return { location: state.location, status: state.status, request, clear };
}
