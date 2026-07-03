# AI Features (Summarize + Ask Saturn)

Saturn has two AI features, powered by Google's **Gemini** free tier:

- **✦ Summarize** — on any note's toolbar. Streams a Markdown summary into a
  panel below the note; "Insert into note" appends it to the note body as an
  `## AI summary` section (you still click **Save changes** to keep it).
- **Ask Saturn** — on the Notes screen. Ask a question in plain language;
  Saturn sends your notes along with the question and answers using only
  what your notes contain, citing `[[Note titles]]`.

Both require **Google sign-in** (see `GOOGLE_AUTH.md`). That's deliberate:
the AI endpoint refuses anonymous requests so strangers can't drain the free
quota on a public deployment.

## How it works

```
Browser ──(question/note + Firebase ID token)──▶ /api/ai (Vercel function)
                                                   │ verifies the token (jose/JWT)
                                                   ▼
                                            Gemini API (gemini-3.5-flash)
                                                   │ streams text back
Browser ◀──────────────(plain text stream)─────────┘
```

- The Gemini API key lives **only** in a server environment variable — it is
  never shipped to the browser.
- Your notes are sent to Google's Gemini API for the duration of the request;
  nothing is stored server-side.
- Very large knowledge bases are capped at ~500KB per request.

## Setup

1. **Get a free Gemini API key**: https://aistudio.google.com → *Get API key*.
   No credit card. Free tier allows a few hundred requests/day on Flash models.
2. **Set two environment variables** wherever the function runs:

   | Variable | Value |
   |---|---|
   | `GEMINI_API_KEY` | the key from AI Studio |
   | `FIREBASE_PROJECT_ID` | the `projectId` from `public/firebase-config.js` |

   - **Vercel**: Project → Settings → Environment Variables (then redeploy).
   - **Local** (`npx vercel dev`): put them in `.env.local` or export them.

3. Sign in with Google in the app — the AI buttons enable automatically.

## Errors you might see

| Message | Meaning |
|---|---|
| "Sign in with Google to use AI." | Not signed in, or the ID token was rejected |
| "AI is not configured on the server yet." | Env vars missing on Vercel |
| "The free AI quota is used up for now" | Gemini free-tier daily/minute limit hit — wait and retry |
| "Your notes are too large for one AI request." | Knowledge base exceeds the request cap |

## Model

`gemini-3.5-flash` — the current stable free-tier Flash model (set in
`api/ai.js` as `GEMINI_MODEL` if you want to change it).
