import { useState } from "react";
import { analytics } from "../utils/analytics.js";

// Shown once, and only where analytics could run. Nothing is loaded until "Allow".
export default function AnalyticsConsent() {
  const [open, setOpen] = useState(() => analytics.needsConsent());
  if (!open) return null;

  const choose = (value) => {
    analytics.setConsent(value);
    setOpen(false);
  };

  return (
    <section
      role="region"
      aria-label="Analytics choice"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg rounded-2xl bg-white p-4 shadow-xl border border-gray-200"
    >
      <p className="text-sm text-gray-800">
        Allow anonymous usage analytics (page views and clicks, no session recording) to help improve SproutRoute? See the{" "}
        <a className="underline" href="/privacy.html">privacy policy</a>.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => choose("denied")} className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
          No thanks
        </button>
        <button type="button" onClick={() => choose("granted")} className="rounded-lg bg-sprout-green px-3 py-2 text-sm font-medium text-white">
          Allow
        </button>
      </div>
    </section>
  );
}
