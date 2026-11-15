import { useEffect, useRef } from "react";
import { Icon } from "./Icon.jsx";
import { AI_DISCLOSURE } from "../utils/aiConsent.js";

function Group({ title, items }) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[14px] text-gray-700 leading-snug">
            <span aria-hidden="true" className="text-gray-400">&bull;</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shown before the first trip is planned. Nothing is sent for planning until the
// visitor agrees. Opened again from the input screen, it lets them withdraw.
export default function AiConsentSheet({ isOpen, alreadyAgreed = false, onAgree, onDecline, onWithdraw }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onDecline(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onDecline]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        tabIndex={-1}
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl outline-none"
      >
        <div className="overflow-y-auto px-5 pt-5 pb-3 space-y-4">
          <h2 id="ai-consent-title" className="font-display font-bold text-[20px] text-gray-900">
            Before we plan
          </h2>
          <p className="text-[14px] text-gray-800 leading-snug">{AI_DISCLOSURE.summary}</p>
          <Group title="What we send" items={AI_DISCLOSURE.sentItems} />
          <Group title="What we don't send" items={AI_DISCLOSURE.notSentItems} />
          <p className="text-[13px] text-gray-600 leading-snug">{AI_DISCLOSURE.locationNote}</p>
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900">Who receives it</h3>
            <ul className="mt-1.5 space-y-1">
              {AI_DISCLOSURE.providers.map((provider) => (
                <li key={provider.name}>
                  <a
                    href={provider.privacyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[14px] text-meadow-700 hover:text-meadow-800 underline underline-offset-2"
                  >
                    {provider.name} privacy policy <Icon name="arrowRight" size={11} />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-gray-600 leading-snug">{AI_DISCLOSURE.routingNote}</p>
          </div>
          <p className="text-[13px] text-gray-600 leading-snug">{AI_DISCLOSURE.advice}</p>
          <p className="text-[13px] text-gray-600 leading-snug">
            You can change this any time from &ldquo;AI data choices&rdquo; on the home screen. If you decline,
            SproutRoute can&rsquo;t plan new trips.{" "}
            <a className="underline" href="/privacy.html" target="_blank" rel="noopener noreferrer">Read our privacy policy</a>.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
          {alreadyAgreed ? (
            <>
              <button type="button" onClick={onDecline} className="w-full rounded-xl bg-meadow-600 text-white font-semibold text-[15px] px-4 py-3 hover:bg-meadow-700 transition">
                Keep planning with AI
              </button>
              <button type="button" onClick={onWithdraw} className="w-full rounded-xl border border-gray-200 text-gray-800 font-semibold text-[15px] px-4 py-3 hover:bg-gray-50 transition">
                Withdraw consent
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onAgree} className="w-full rounded-xl bg-meadow-600 text-white font-semibold text-[15px] px-4 py-3 hover:bg-meadow-700 transition">
                Agree and continue
              </button>
              <button type="button" onClick={onDecline} className="w-full rounded-xl border border-gray-200 text-gray-800 font-semibold text-[15px] px-4 py-3 hover:bg-gray-50 transition">
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
