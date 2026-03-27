// src/backend/utils/placesCache.js
export class PlacesCache {
  constructor({ maxSize = 500, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this._map = new Map();
    this._maxSize = maxSize;
    this._ttlMs = ttlMs;
  }

  _key(name, destination) {
    return `${(name || "").toLowerCase().trim()}||${(destination || "").toLowerCase().trim()}`;
  }

  get(name, destination) {
    const key = this._key(name, destination);
    const entry = this._map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(name, destination, value) {
    const key = this._key(name, destination);
    if (this._map.size >= this._maxSize && !this._map.has(key)) {
      const firstKey = this._map.keys().next().value;
      this._map.delete(firstKey);
    }
    this._map.set(key, { value, ts: Date.now() });
  }
}
