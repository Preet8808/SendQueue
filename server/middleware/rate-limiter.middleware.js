// SendQueue Sliding-Window Rate Limiting Middleware

function createRateLimiter({ windowMs = 60000, max = 60, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map(); // key -> array of timestamps

  // Periodic cleanup of stale records every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, Math.max(60000, windowMs));

  // Allow process exit without hanging on interval
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    const now = Date.now();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const key = `${clientIp}:${req.baseUrl || req.path}`;

    let timestamps = hits.get(key) || [];
    timestamps = timestamps.filter(t => now - t < windowMs);

    const remaining = Math.max(0, max - timestamps.length);
    const resetTime = Math.ceil((windowMs - (now - (timestamps[0] || now))) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, remaining - 1));
    res.setHeader('RateLimit-Reset', resetTime);

    if (timestamps.length >= max) {
      res.setHeader('Retry-After', resetTime);
      return res.status(429).json({
        error: message,
        retryAfterSec: resetTime
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

// Preset Limiters for Public Endpoints
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 login attempts per IP
  message: 'Too many login attempts from this IP address. Please wait 15 minutes.'
});

const complianceRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 unsubscribe calls per minute
  message: 'Too many unsubscribe requests in a short period. Please try again in a moment.'
});

const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 webhook events per minute
  message: 'Webhook rate limit exceeded.'
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  complianceRateLimiter,
  webhookRateLimiter
};
