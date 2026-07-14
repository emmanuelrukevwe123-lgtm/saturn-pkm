/* Saturn PKM — AI endpoint (Vercel serverless function)
   Proxies summarize / ask requests to the Gemini API so the API key
   never reaches the browser. Requires a signed-in Google user: the
   client sends its Firebase ID token, verified here as a JWT against
   Google's public keys (no firebase-admin needed).

   Env vars (set in Vercel Project Settings or locally for `vercel dev`):
     GEMINI_API_KEY      — free key from https://aistudio.google.com
     FIREBASE_PROJECT_ID — same project id as public/firebase-config.js */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { checkRateLimit } from "./rate-limit.js";

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  GEMINI_MODEL + ":streamGenerateContent?alt=sse";

// Firebase ID tokens are signed by this Google service account.
const JWKS = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
));

const MAX_INPUT_CHARS = 500_000; // keeps requests inside Gemini's context and Vercel's body limit
const MAX_NOTES = 25;
const UPSTREAM_TIMEOUT_MS = 30_000;

function noteAsText(note, index) {
  const title = (note?.title || "Untitled note").slice(0, 300);
  const tags = Array.isArray(note?.tags) ? note.tags.join(", ") : "";
  const body = typeof note?.body === "string" ? note.body : "";
  return `--- Note ${index + 1}: ${title}${tags ? ` [tags: ${tags}]` : ""} ---\n${body}`;
}

export function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be an object.";
  if (body.mode === "summarize") {
    if (!body.note || typeof body.note !== "object") return "A note is required.";
    if (typeof body.note.title !== "string" || body.note.title.length > 300) return "Note title is invalid.";
    if (typeof body.note.body !== "string" || body.note.body.length > MAX_INPUT_CHARS) return "Note body is too large.";
    if (!Array.isArray(body.note.tags) || body.note.tags.length > 30 || body.note.tags.some((tag) => typeof tag !== "string" || tag.length > 100)) return "Note tags are invalid.";
    return null;
  }
  if (body.mode === "ask") {
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 2_000) return "Question is invalid.";
    if (!Array.isArray(body.notes) || body.notes.length > MAX_NOTES) return `At most ${MAX_NOTES} notes are allowed.`;
    for (const note of body.notes) {
      if (!note || typeof note !== "object" || typeof note.title !== "string" || note.title.length > 300 || typeof note.body !== "string" || note.body.length > 20_000)
        return "A note is invalid or too large.";
      if (!Array.isArray(note.tags) || note.tags.length > 30 || note.tags.some((tag) => typeof tag !== "string" || tag.length > 100)) return "Note tags are invalid.";
    }
    return null;
  }
  return "Mode must be summarize or ask.";
}

export function buildPrompt(body) {
  if (body?.mode === "summarize" && body.note) {
    return {
      system:
        "You are the AI assistant inside Saturn, a personal knowledge management app. " +
        "Summarize the user's note faithfully and concisely in Markdown: a one-sentence " +
        "essence line, then 3-6 short bullet points of the key ideas. Do not invent " +
        "content that is not in the note. Keep [[wiki links]] intact if you mention them.",
      user: noteAsText(body.note, 0),
      maxOutputTokens: 2048,
    };
  }
  if (body?.mode === "ask" && typeof body.question === "string" && Array.isArray(body.notes)) {
    const corpus = body.notes.map(noteAsText).join("\n\n");
    return {
      system:
        "You are the AI assistant inside Saturn, a personal knowledge management app. " +
        "Answer the user's question using ONLY their notes, provided below. Quote or " +
        "reference note titles (as [[Note title]]) when they support your answer. If the " +
        "notes do not contain the answer, say so plainly rather than guessing. Respond " +
        "in concise Markdown.",
      user: `MY NOTES:\n\n${corpus}\n\nQUESTION: ${body.question.slice(0, 2000)}`,
      maxOutputTokens: 4096,
    };
  }
  return null;
}

export async function verifyUser(req, projectId) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload : null;
  } catch {
    return null;
  }
}

export function allowedEmail(claims, allowlist = process.env.AI_ALLOWED_EMAILS || "") {
  const allowed = new Set(allowlist.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  return claims?.email_verified === true && typeof claims.email === "string" && allowed.has(claims.email.toLowerCase());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId || !process.env.AI_ALLOWED_EMAILS ||
      !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    res.status(500).json({ error: "AI is not configured on the server yet." });
    return;
  }

  const claims = await verifyUser(req, projectId);
  if (!claims) {
    res.status(401).json({ error: "Sign in with Google to use AI." });
    return;
  }

  if (!allowedEmail(claims)) {
    res.status(403).json({ error: "This account is not allowed to use Saturn AI." });
    return;
  }

  let rate;
  try {
    rate = await checkRateLimit(claims.sub);
  } catch {
    res.status(503).json({ error: "AI rate limiting is temporarily unavailable. Try again later." });
    return;
  }
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfter));
    res.status(429).json({ error: `AI limit reached (${rate.limit}). Try again in ${rate.retryAfter} seconds.` });
    return;
  }

  const payloadError = validatePayload(req.body);
  if (payloadError) {
    res.status(400).json({ error: payloadError });
    return;
  }

  const prompt = buildPrompt(req.body);
  if (!prompt) {
    res.status(400).json({ error: "Bad request." });
    return;
  }
  if (prompt.user.length > MAX_INPUT_CHARS) {
    res.status(413).json({ error: "Your notes are too large for one AI request." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("AI request timed out")), UPSTREAM_TIMEOUT_MS);
  const disconnect = () => { if (!res.writableEnded) controller.abort(new Error("Client disconnected")); };
  req.once?.("aborted", disconnect);
  res.once?.("close", disconnect);
  let upstream;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        generationConfig: { maxOutputTokens: prompt.maxOutputTokens },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(error?.name === "AbortError" ? 504 : 502).json({ error: "The AI service did not respond in time." });
    return;
  }

  if (!upstream.ok) {
    clearTimeout(timeout);
    // Surface WHY Gemini rejected the call: status in the client message,
    // a truncated error snippet in the function logs (never note content —
    // Gemini error bodies describe the request problem, not the prompt).
    let snippet = "";
    try { snippet = (await upstream.text()).slice(0, 300); } catch { /* opaque */ }
    console.error(`Gemini rejected the request: HTTP ${upstream.status} ${snippet}`);
    const status = upstream.status === 429 ? 429 : 502;
    res.status(status).json({
      error: status === 429
        ? "The free AI quota is used up for now — try again later."
        : `The AI service returned an error (HTTP ${upstream.status}). Try again in a moment.`,
    });
    return;
  }

  // Re-stream Gemini's SSE as plain text chunks.
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parts = JSON.parse(payload)?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (typeof part.text === "string") res.write(part.text);
          }
        } catch {
          // Partial or non-JSON SSE line — skip it.
        }
      }
    }
  } catch {
    // The timeout or a client disconnect cancels the upstream reader.
  } finally {
    clearTimeout(timeout);
    if (!res.writableEnded) res.end();
  }
}
