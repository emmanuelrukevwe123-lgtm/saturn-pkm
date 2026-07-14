import { describe, expect, it } from "vitest";
import { allowedEmail, callGemini, validatePayload } from "../../api/ai.js";
import { checkRateLimit } from "../../api/rate-limit.js";

const PROMPT = { system: "s", user: "u", maxOutputTokens: 100 };

function fetchScript(...responses) {
  const bodies = [];
  const impl = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return responses[Math.min(bodies.length - 1, responses.length - 1)];
  };
  return { impl, bodies };
}

describe("callGemini retry ladder", () => {
  it("disables thinking on the first attempt", async () => {
    const { impl, bodies } = fetchScript({ ok: true, status: 200 });
    await callGemini(PROMPT, { apiKey: "k", fetchImpl: impl });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("falls back without thinkingConfig when the API rejects it", async () => {
    const { impl, bodies } = fetchScript({ ok: false, status: 400 }, { ok: true, status: 200 });
    const upstream = await callGemini(PROMPT, { apiKey: "k", fetchImpl: impl });
    expect(upstream.status).toBe(200);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined();
  });

  it("retries once after a pause when the model is overloaded", async () => {
    const delays = [];
    const { impl, bodies } = fetchScript({ ok: false, status: 503 }, { ok: true, status: 200 });
    const upstream = await callGemini(PROMPT, {
      apiKey: "k", fetchImpl: impl, delay: async (ms) => delays.push(ms),
    });
    expect(upstream.status).toBe(200);
    expect(bodies).toHaveLength(2);
    expect(delays).toEqual([2000]);
  });

  it("gives up after one overload retry when no fallback is configured", async () => {
    const { impl, bodies } = fetchScript({ ok: false, status: 503 });
    const upstream = await callGemini(PROMPT, { apiKey: "k", fallbackModel: "", fetchImpl: impl, delay: async () => {} });
    expect(upstream.status).toBe(503);
    expect(bodies).toHaveLength(2);
  });

  it("tries the configured fallback model on sustained overload", async () => {
    const urls = [];
    const scripted = async (url) => {
      urls.push(url);
      return urls.length <= 2 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    };
    const upstream = await callGemini(PROMPT, {
      apiKey: "k", fallbackModel: "gemini-3.5-flash-lite", fetchImpl: scripted, delay: async () => {},
    });
    expect(upstream.status).toBe(200);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("gemini-3.5-flash:");
    expect(urls[2]).toContain("gemini-3.5-flash-lite:");
  });
});

describe("AI policy", () => {
  it("requires verified allowlisted email", () => {
    expect(allowedEmail({ email: "Owner@Example.com", email_verified: true }, "owner@example.com")).toBe(true);
    expect(allowedEmail({ email: "owner@example.com", email_verified: false }, "owner@example.com")).toBe(false);
    expect(allowedEmail({ email: "other@example.com", email_verified: true }, "owner@example.com")).toBe(false);
  });

  it("bounds payload count and field sizes", () => {
    expect(validatePayload({ mode: "ask", question: "?", notes: Array(26).fill({ title: "x", body: "", tags: [] }) })).toMatch(/At most/);
    expect(validatePayload({ mode: "summarize", note: { title: "x", body: "ok", tags: [] } })).toBeNull();
  });

  it("enforces both durable windows", async () => {
    const counts = new Map();
    const fake = { multi() { const jobs = []; return {
      incr(key) { jobs.push(["incr", key]); return this; },
      expire(key) { jobs.push(["expire", key]); return this; },
      async exec() { return jobs.map(([command, key]) => command === "expire" ? 1 : counts.set(key, (counts.get(key) || 0) + 1).get(key)); },
    }; } };
    let result;
    for (let i = 0; i < 11; i += 1) result = await checkRateLimit("u", 0, fake);
    expect(result.allowed).toBe(false);
    expect(result.limit).toMatch(/10 minutes/);
  });
});
