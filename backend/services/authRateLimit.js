const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Mongo-backed fixed-window rate limiter using an atomic pipeline update
 * (safe across multiple Node instances).
 * @param {object} AuthRateLimit mongoose model
 */
async function assertWithinRateLimit(
  AuthRateLimit,
  key,
  limit,
  windowMs = DEFAULT_WINDOW_MS,
  now = new Date()
) {
  if (!key || !AuthRateLimit) {
    return { ok: false, message: "Rate limit unavailable." };
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  const windowEnd = new Date(nowDate.getTime() + windowMs);

  let doc;
  try {
    doc = await AuthRateLimit.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            key,
            count: {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $type: "$windowExpiresAt" }, "missing"] },
                    { $lte: ["$windowExpiresAt", nowDate] },
                  ],
                },
                1,
                { $add: [{ $ifNull: ["$count", 0] }, 1] },
              ],
            },
            windowExpiresAt: {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $type: "$windowExpiresAt" }, "missing"] },
                    { $lte: ["$windowExpiresAt", nowDate] },
                  ],
                },
                windowEnd,
                "$windowExpiresAt",
              ],
            },
          },
        },
      ],
      { upsert: true, new: true }
    );
  } catch (_) {
    return { ok: false, message: "Rate limit unavailable." };
  }

  if (!doc || doc.count > limit) {
    return { ok: false, message: "Too many requests. Please try again later." };
  }

  return { ok: true, remaining: Math.max(0, limit - doc.count) };
}

module.exports = {
  DEFAULT_WINDOW_MS,
  assertWithinRateLimit,
};
