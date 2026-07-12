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
