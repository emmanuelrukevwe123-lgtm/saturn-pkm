import { Redis } from "@upstash/redis";

const TEN_MINUTES = 600;
const DAY = 86_400;
let redis;

function client() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
    throw new Error("Rate limiting is not configured.");
  redis ||= Redis.fromEnv();
  return redis;
}

export async function checkRateLimit(userId, now = Date.now(), instance = client()) {
  const shortWindow = Math.floor(now / (TEN_MINUTES * 1000));
  const dailyWindow = Math.floor(now / (DAY * 1000));
  const prefix = `saturn:ai:${userId}`;
  const transaction = instance.multi();
  transaction.incr(`${prefix}:10m:${shortWindow}`);
  transaction.expire(`${prefix}:10m:${shortWindow}`, TEN_MINUTES + 60);
  transaction.incr(`${prefix}:day:${dailyWindow}`);
  transaction.expire(`${prefix}:day:${dailyWindow}`, DAY + 60);
  const [shortCount, , dailyCount] = await transaction.exec();
  const shortRetry = TEN_MINUTES - Math.floor((now / 1000) % TEN_MINUTES);
  const dailyRetry = DAY - Math.floor((now / 1000) % DAY);
  if (Number(shortCount) > 10) return { allowed: false, retryAfter: shortRetry, limit: "10 requests per 10 minutes" };
  if (Number(dailyCount) > 100) return { allowed: false, retryAfter: dailyRetry, limit: "100 requests per day" };
  return { allowed: true, remaining: Math.min(10 - Number(shortCount), 100 - Number(dailyCount)) };
}
