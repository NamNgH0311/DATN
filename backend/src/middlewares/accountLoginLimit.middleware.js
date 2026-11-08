const crypto = require("crypto");

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_ENTRIES = 10000;

const attempts = new Map();

function getKey(email) {
  if (typeof email !== "string") return null;

  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 255) return null;

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function cleanup(now) {
  for (const [key, entry] of attempts) {
    if (now >= entry.expiresAt) attempts.delete(key);
  }
}

function accountLoginLimit(req, res, next) {
  const key = getKey(req.body?.email);
  if (!key) return next();

  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now >= entry.expiresAt) {
    return next();
  }

  if (entry.blockedUntil > now) {
    res.set(
      "Retry-After",
      String(Math.ceil((entry.blockedUntil - now) / 1000)),
    );

    return res.status(429).json({
      success: false,
      code: "RATE_LIMITED",
      errorCode: "RATE_LIMITED",
      message: "Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau.",
    });
  }

  next();
}

function recordFailure(email) {
  const key = getKey(email);
  if (!key) return;

  const now = Date.now();
  let entry = attempts.get(key);

  if (!entry || now >= entry.expiresAt) {
    cleanup(now);

    if (attempts.size >= MAX_ENTRIES) return;

    entry = {
      count: 0,
      expiresAt: now + WINDOW_MS,
      blockedUntil: 0,
    };
  }

  entry.count += 1;

  if (entry.count >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS;
    entry.expiresAt = entry.blockedUntil;
  }

  attempts.set(key, entry);
}

function clearFailures(email) {
  const key = getKey(email);
  if (key) attempts.delete(key);
}

module.exports = {
  accountLoginLimit,
  recordFailure,
  clearFailures,
};
