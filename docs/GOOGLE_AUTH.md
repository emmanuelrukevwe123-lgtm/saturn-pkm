# Google Sign-In Setup

Saturn supports optional Google sign-in through Firebase Authentication.

Important: this does not add cloud sync by itself. Notes still live in browser
localStorage. When a user signs in, Saturn stores that browser's notes under a
Google-user-specific localStorage key. Deleted notes use a matching
Google-scoped bin key. On first sign-in, the existing local notes and bin are
copied into that Google-scoped notebook.

## 1. Create or Open a Firebase Project

1. Go to the Firebase console.
2. Create a project, or open an existing project.
3. Add a Web app to the project.
4. Copy the Firebase config object for that Web app.

## 2. Enable Google Provider

In Firebase:

1. Go to **Authentication**.
2. Open **Sign-in method**.
3. Enable **Google**.
4. Save.

For deployed sites, also make sure your live domain is allowed in Firebase
Authentication settings. Add your Vercel domain after deployment.

## 3. Fill in Saturn's Config

Edit `public/firebase-config.js`:

```js
window.SATURN_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};
```

These Firebase web config values identify the project; they are not private
passwords. Firebase security comes from provider settings and backend rules.

## 4. Run Locally

Use a local server instead of opening the HTML file directly:

```bash
cd public
python3 -m http.server
```

Then visit `http://localhost:8000`.

## What Changes After Sign-In

- The sidebar shows the signed-in Google account.
- The **Sign out** button appears.
- Notes are stored under `saturn-pkm-notes:<firebase-user-id>`.
- Deleted notes are stored under `saturn-pkm-deleted-notes:<firebase-user-id>`.
- Signed-out notes remain under `saturn-pkm-notes`.
- Signing in on another browser or device will not show the same notes until a
  cloud database sync feature is added.
