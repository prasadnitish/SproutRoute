/**
 * Photo service — fetches activity photos from Unsplash.
 * Free tier: 50 requests/hour, requires attribution.
 */

const UNSPLASH_BASE = "https://api.unsplash.com/search/photos";
const UNSPLASH_ACCESS_KEY = "YOUR_UNSPLASH_ACCESS_KEY"; // TODO: move to backend proxy

export interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string; thumb: string };
  alt_description: string | null;
  user: { name: string; links: { html: string } };
}

export async function searchPhotos(
  query: string,
  perPage = 3,
): Promise<UnsplashPhoto[]> {
  try {
    const url = `${UNSPLASH_BASE}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}
