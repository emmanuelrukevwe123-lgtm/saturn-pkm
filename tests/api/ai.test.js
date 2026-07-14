import { describe, expect, it } from "vitest";
import { allowedEmail, validatePayload } from "../../api/ai.js";
import { checkRateLimit } from "../../api/rate-limit.js";

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
