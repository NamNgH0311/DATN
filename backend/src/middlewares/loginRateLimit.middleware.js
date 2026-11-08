// Single-process, per-IP fixed-window limiter. For multiple instances use a shared
// store (e.g. Redis) before deploying behind a load balancer.
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 10;
const MAX_KEYS = 10000;
const buckets = new Map();

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    for (const [ip, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(ip);
    }
    if (buckets.size >= MAX_KEYS && !buckets.has(key)) {
      res.set("Retry-After", "60");
      return res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        errorCode: "RATE_LIMITED",
        message: "Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.",
      });
    }
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  const remainingSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000),
  );
  res.set("RateLimit-Limit", String(MAX_REQUESTS));
  res.set(
    "RateLimit-Remaining",
    String(Math.max(0, MAX_REQUESTS - bucket.count - 1)),
  );
  res.set("RateLimit-Reset", String(remainingSeconds));
  if (bucket.count >= MAX_REQUESTS) {
    res.set("Retry-After", String(remainingSeconds));
    return res.status(429).json({
      success: false,
      code: "RATE_LIMITED",
      errorCode: "RATE_LIMITED",
      message: "Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.",
    });
  }
  bucket.count += 1;
  next();
}

module.exports = loginRateLimit;
