import { useEffect, useRef, useState } from 'react';
import { analytics } from '../utils/analytics.js';
import { buildShareSummary } from '../utils/shareSummary.js';

export default function ShareTripDialog({ isOpen, onClose, tripData }) {
  const dialogRef = useRef(null);
  const summaryRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const text = buildShareSummary(tripData, window.location.origin);

  useEffect(() => {
    if (isOpen) {
      setStatus('');
      dialogRef.current.showModal();
    } else {
      dialogRef.current.close();
    }
  }, [isOpen]);

  async function copySummary() {
    setBusy(true);
    setStatus('');
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Summary copied. Paste it into a message or email.');
      analytics.shareClicked();
    } catch {
      setStatus("Couldn't copy automatically. Select the summary below and copy it manually.");
      summaryRef.current.focus();
      summaryRef.current.select();
    } finally {
      setBusy(false);
    }
  }

  async function shareSummary() {
    setBusy(true);
    setStatus('');
    try {
      await navigator.share({ title: 'SproutRoute trip plan', text });
      setStatus('Trip summary shared.');
      analytics.shareClicked();
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus("Couldn't open sharing. Copy the summary instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="share-trip-title"
      aria-describedby="share-trip-description"
      className="w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] rounded-2xl bg-white p-5 sm:p-6 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="share-trip-title" className="text-lg font-bold text-gray-900">Share your trip</h2>
        <button type="button" onClick={onClose} autoFocus aria-label="Close sharing" className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-meadow-600">Close</button>
      </div>
      <p id="share-trip-description" className="mt-2 text-sm text-gray-600">Copy the itinerary generated so far to share in a message or email.</p>
      <p role="status" aria-live="polite" className="my-3 min-h-5 text-sm font-medium text-meadow-800">{status}</p>
      <label htmlFor="share-trip-summary" className="text-sm font-semibold text-gray-700">Trip summary</label>
      <textarea id="share-trip-summary" ref={summaryRef} readOnly value={text} className="mt-2 h-56 w-full resize-y rounded-xl border border-gray-300 p-3 text-sm text-gray-800 focus:border-meadow-600 focus:outline-meadow-600" />
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={copySummary} className="rounded-lg bg-meadow-600 px-4 py-2 font-semibold text-white hover:bg-meadow-700 disabled:opacity-50 focus-visible:outline-meadow-600">Copy summary</button>
        {typeof navigator.share === 'function' && <button type="button" disabled={busy} onClick={shareSummary} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-meadow-600">Share via…</button>}
      </div>
    </dialog>
  );
}
