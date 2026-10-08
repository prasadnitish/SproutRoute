import { useEffect, useState } from 'react';
import ResultsScreen from './ResultsScreen.jsx';
import { getTripShare, revokeTripShare } from '../services/api.js';
import { loadJSON } from '../utils/storage.js';
import { SHARE_PRIVACY_NOTICE, shareOwnerKey, forgetShareOwner, formatShareExpiry } from '../utils/tripShare.js';

export default function SharedTripScreen() {
  const [shared, setShared] = useState(null);
  const [error, setError] = useState('');
  const [stopping, setStopping] = useState(false);
  const token = window.location.hash.slice(1);
  const ownerToken = loadJSON(shareOwnerKey(token))?.ownerToken;

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setError('This trip link is invalid or unavailable.'); return; }
    const controller = new AbortController();
    getTripShare(token, { signal: controller.signal }).then(data => {
      if (data.snapshot?.schemaVersion !== 1 || !data.snapshot?.tripData || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new Error('This trip link has expired or is unavailable.');
      setShared(data);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message || 'This trip link is unavailable.'); });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!shared) return;
    const timer = setTimeout(() => { setShared(null); setError('This trip link has expired.'); }, Math.max(0, Date.parse(shared.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [shared]);

  async function stopSharing() {
    setStopping(true);
    try {
      await revokeTripShare(token, ownerToken);
      forgetShareOwner(token);
      setShared(null);
      setError('Sharing stopped. This link no longer opens the trip.');
    } catch (err) { setError(err.message); }
    finally { setStopping(false); }
  }

  return <div className="min-h-screen bg-[#f9fafb] font-body">
    <nav className="border-b border-gray-200 bg-white px-4 py-3"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
      <a href="/" className="font-bold text-meadow-700">SproutRoute</a>
      <a href="/" className="text-sm font-semibold text-meadow-700 underline">Plan your own trip</a>
    </div></nav>
    <main className="mx-auto max-w-5xl">
      <section className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">{SHARE_PRIVACY_NOTICE}</p>
        {shared && <><p className="mt-2">Saved itinerary · Expires {formatShareExpiry(shared.expiresAt)}</p><p className="mt-1 text-xs">Weather was saved with this trip. Check current conditions before travel.</p></>}
        {ownerToken && shared && <button type="button" onClick={stopSharing} disabled={stopping} className="mt-2 font-semibold underline">Stop sharing</button>}
      </section>
      {error && <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
      {!shared && !error && <p role="status" className="p-6 text-gray-600">Opening shared itinerary…</p>}
      {shared && <ResultsScreen readOnly tripData={shared.snapshot.tripData} parsedInput={shared.snapshot.tripData.parsed} progress={{ itinerary: 'done', weather: 'done' }} steps={[]} />}
    </main>
  </div>;
}
