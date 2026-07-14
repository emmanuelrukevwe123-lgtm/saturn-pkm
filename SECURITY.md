# Security

Report vulnerabilities privately to the repository owner; do not open a public issue with exploit details. Include impact, reproduction steps, and suggested remediation. Expect acknowledgement within seven days.

Firestore and Storage deny access by default and permit only an authenticated user whose UID matches the path. AI additionally requires a verified email in `AI_ALLOWED_EMAILS` and applies durable Upstash limits of 10 requests per 10 minutes and 100 per day. Secrets belong in deployment environment variables, never `public/`.

Supported security updates target the current `main` branch and the Node version in `.nvmrc`.
