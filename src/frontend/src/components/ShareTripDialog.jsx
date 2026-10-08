import { useEffect, useRef, useState } from 'react';
import { analytics } from '../utils/analytics.js';
import { buildShareSummary } from '../utils/shareSummary.js';
import { buildSharedTripSnapshot } from '../../../shared/shareSnapshot.js';
import { createTripShare, revokeTripShare } from '../services/api.js';
import { saveJSON } from '../utils/storage.js';
import { SHARE_PRIVACY_NOTICE, shareOwnerKey, forgetShareOwner, formatShareExpiry } from '../utils/tripShare.js';

export default function ShareTripDialog({ isOpen, onClose, tripData, canCreateLink = false }) {
  const dialogRef = useRef(null);
  const summaryRef = useRef(null);
  const linkRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(null);
  const text = buildShareSummary(tripData, window.location.origin);
  const link = share ? `${window.location.origin}/s#${share.token}` : '';

  async function createLink() {
    setBusy(true);
    setStatus('Creating your trip link…');
    try {
      const created = await createTripShare(buildSharedTripSnapshot(tripData).tripData);
      setShare(created);
      saveJSON(shareOwnerKey(created.token), { ownerToken: created.ownerToken }, Math.max(1, Date.parse(created.expiresAt) - Date.now()));
      setStatus('Trip link ready. It expires 7 days after creation.');
      analytics.featureUsed('trip_link_created', { expires_in_days: 7 });
    } catch (error) { setStatus(error.message || 'Could not create a trip link. You can still copy the summary.'); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(link);
      setStatus('Trip link copied. Anyone with the link can view the itinerary.');
      analytics.shareClicked();
    } catch {
      setStatus("Couldn't copy automatically. Select the link and copy it manually.");
      linkRef.current?.focus();
      linkRef.current?.select();
    } finally { setBusy(false); }
  }

  async function stopSharing() {
    setBusy(true);
    try {
      await revokeTripShare(share.token, share.ownerToken);
      forgetShareOwner(share.token);
      setShare(null);
      setStatus('Sharing stopped. The old link no longer opens this trip.');
    } catch (error) { setStatus(error.message || 'Could not stop sharing. Please try again.'); }
    finally { setBusy(false); }
  }

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
      await navigator.share(share ? { title: 'SproutRoute trip plan', url: link } : { title: 'SproutRoute trip plan', text });
      setStatus(share ? 'Trip link shared.' : 'Trip summary shared.');
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
      {isOpen && <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="share-trip-title" className="text-lg font-bold text-gray-900">Share your trip</h2>
        <button type="button" onClick={onClose} autoFocus aria-label="Close sharing" className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-meadow-600">Close</button>
      </div>
      <p id="share-trip-description" className="mt-2 text-sm text-gray-600">Create a link to this exact itinerary, or copy a text summary.</p>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">{SHARE_PRIVACY_NOTICE}</p>
        <p className="mt-1">Links expire 7 days after creation. Includes itinerary, route, dates and weather.</p>
      </div>
      {share ? <div className="mt-3 space-y-2 ph-no-capture">
        <label htmlFor="trip-share-link" className="text-sm font-semibold text-gray-700">Trip link</label>
        <input id="trip-share-link" ref={linkRef} readOnly value={link} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
        <p className="text-xs text-gray-600">Expires {formatShareExpiry(share.expiresAt)}</p>
        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={copyLink} className="rounded-lg bg-meadow-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Copy link</button>
          <button type="button" disabled={busy} onClick={stopSharing} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Stop sharing</button>
        </div>
      </div> : <div className="mt-3">
        <button type="button" disabled={busy || !canCreateLink} onClick={createLink} className="rounded-lg bg-meadow-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Create 7-day link</button>
        {!canCreateLink && <p className="mt-1 text-xs text-gray-600">Your link will be available once the itinerary finishes loading.</p>}
      </div>}
      <p role="status" aria-live="polite" className="my-3 min-h-5 text-sm font-medium text-meadow-800">{status}</p>
      <label htmlFor="share-trip-summary" className="text-sm font-semibold text-gray-700">Trip summary</label>
      <textarea id="share-trip-summary" ref={summaryRef} readOnly value={text} className="mt-2 h-40 w-full resize-y rounded-xl border border-gray-300 p-3 text-sm text-gray-800 focus:border-meadow-600 focus:outline-meadow-600" />
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={copySummary} className="rounded-lg bg-meadow-600 px-4 py-2 font-semibold text-white hover:bg-meadow-700 disabled:opacity-50 focus-visible:outline-meadow-600">Copy summary</button>
        {typeof navigator.share === 'function' && <button type="button" disabled={busy} onClick={shareSummary} className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-meadow-600">Share via…</button>}
      </div>
      </>}
    </dialog>
  );
}
