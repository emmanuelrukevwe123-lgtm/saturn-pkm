# Security

Report vulnerabilities privately to the repository owner; do not open a public issue with exploit details. Include impact, reproduction steps, and suggested remediation. Expect acknowledgement within seven days.

Firestore and Storage deny access by default and permit only an authenticated user whose UID matches the path. AI additionally requires a verified email in `AI_ALLOWED_EMAILS` and applies durable Upstash limits of 10 requests per 10 minutes and 100 per day. Secrets belong in deployment environment variables, never in `src/`, `public/` or any `VITE_` variable, because those all reach the browser. The Firebase web config in `src/config.js` is an identifier, not a secret: restrict its API key to this site's domain in Google Cloud Console.

Note text is only ever turned into HTML by `renderMarkdown`, which escapes it first; pasted content enters notes as plain text; and the Content Security Policy allows scripts only from this site and Google's sign-in service.

Supported security updates target the current `main` branch and the Node version in `.nvmrc`.
