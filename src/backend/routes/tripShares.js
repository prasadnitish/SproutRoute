import crypto from 'node:crypto';

export function mountTripShareRoutes(app, { store, createLimiter, readLimiter }) {
  const base = '/api/v1/trip/shares';
  app.use(base, (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  function fail(res, error) {
    const unavailable = error?.code === 'SHARE_UNAVAILABLE';
    const invalid = error?.code === 'SHARE_INVALID';
    res.status(unavailable ? 404 : invalid ? 400 : 503).json({
      code: unavailable ? 'SHARE_UNAVAILABLE' : invalid ? 'SHARE_INVALID' : 'SHARE_STORAGE_UNAVAILABLE',
      message: unavailable ? 'This trip link has expired, was stopped, or is unavailable.' : invalid ? error.message : 'Trip links are temporarily unavailable. You can still copy the summary.',
      category: unavailable ? 'not_found' : invalid ? 'validation' : 'dependency',
      retryable: !unavailable && !invalid,
      requestId: crypto.randomUUID(),
    });
  }
  app.post(base, createLimiter, async (req, res) => {
    try { res.status(201).json(await store.create(req.body?.tripData)); }
    catch (error) { fail(res, error); }
  });
  // Tokens travel in headers, never request paths/query strings or request logs.
  app.get(`${base}/view`, readLimiter, async (req, res) => {
    try { res.json(await store.read(req.get('x-trip-share-token'))); }
    catch (error) { fail(res, error); }
  });
  app.delete(base, readLimiter, async (req, res) => {
    try { await store.revoke(req.get('x-trip-share-token'), req.get('x-trip-share-owner-token')); res.sendStatus(204); }
    catch (error) { fail(res, error); }
  });
}
