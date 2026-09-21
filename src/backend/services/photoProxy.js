import { tracedFetch } from './tracing.js';
export const MAX_PHOTO_BYTES = 1_500_000;
export const PHOTO_TIMEOUT_MS = 5_000;

function photoTooLargeError() {
  return Object.assign(new Error("Photo response is too large"), { statusCode: 413 });
}

export async function readBoundedResponseBody(response, maxBytes = MAX_PHOTO_BYTES) {
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw photoTooLargeError();
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel(photoTooLargeError());
        throw photoTooLargeError();
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

/** Resolve Google's default redirect explicitly, retaining SSRF and size protections. */
export async function fetchPlacePhoto(ref, apiKey, fetchFn = tracedFetch) {
  const signal = AbortSignal.timeout(PHOTO_TIMEOUT_MS);
  const metadata = await fetchFn(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&skipHttpRedirect=true`, {
    headers: { 'X-Goog-Api-Key': apiKey }, signal, redirect: 'error',
  });
  if (!metadata.ok) return metadata;
  const { photoUri } = JSON.parse((await readBoundedResponseBody(metadata, 16000)).toString('utf8'));
  const url = new URL(photoUri);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com') || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Untrusted photo destination');
  }
  return fetchFn(url.href, { signal, redirect: 'error' });
}
