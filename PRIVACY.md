# Privacy

Saturn is local-first. Notes, deleted notes, projects, tasks, settings, and cached images are stored in the browser. A complete `.saturn` backup is only created when the user requests an export.

Google sign-in sends authentication data to Firebase. Cloud sync sends owner-scoped records to Firestore and referenced images to Firebase Storage only when the deployment feature flag is enabled. AI features send selected note text to the Saturn serverless endpoint and Gemini only after a verified, allowlisted user asks for a summary or answer. The endpoint does not log note contents.

Clearing browser storage removes the local cache. Export a backup first. Contact the repository owner for account-data deletion requests.
