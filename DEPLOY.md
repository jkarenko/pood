# PoOD — Picture of Our Day

## Deployment Guide

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (disable Google Analytics if you don't need it)
3. Go to **Build > Firestore Database** → Create database → Start in **test mode**
4. Go to **Build > Storage** → Get started → Start in **test mode**
5. Go to **Project settings > General**, scroll to "Your apps", click the web icon (`</>`)
6. Register an app (any name), copy the `firebaseConfig` object

### 2. Add your config

Edit `src/lib/firebase.ts` and paste your config values:

```ts
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123...",
  appId: "1:123...:web:abc...",
};
```

### 3. Build

```bash
cd pood
pnpm install
bash /path/to/bundle-artifact.sh
# Or use Vite for development: pnpm dev
```

The output is `bundle.html` — a single self-contained file.

### 4. Deploy (pick one)

**Cloudflare Pages** (recommended — free, fast, global CDN):
```bash
# Push to a Git repo, connect it in Cloudflare Pages dashboard
# Build command: (not needed — just deploy the static file)
# Or use Wrangler CLI:
npx wrangler pages deploy dist/
```

**Vercel**:
```bash
npm i -g vercel
vercel --prod
```

**Netlify**:
```bash
# Drag and drop `dist/` folder at app.netlify.com/drop
```

**GitHub Pages**:
Commit `bundle.html` as `index.html` to a `gh-pages` branch.

### 5. Lock down Firebase (before sharing)

Replace the test-mode security rules:

**Firestore rules** (Console > Firestore > Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /days/{day} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

**Storage rules** (Console > Storage > Rules):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /images/{allPaths=**} {
      allow read: if true;
      allow write: if request.resource.size < 2 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

These allow public read/write but restrict uploads to images under 2MB. For a private friend group this is sufficient. Add Firebase Authentication if you want proper access control.

### Architecture

```
Storage priority: Firebase → window.storage (Claude) → in-memory

Firestore:   days/{YYYY-MM-DD}  →  { entries: [{ gridPos, name, tilt, ... }] }
Storage:     images/{YYYY-MM-DD}/{gridPos}.jpg
Local:       localStorage "pood:lastuser" (remembered name)
```

Bundle is ~737KB (Firebase SDK is ~400KB of that). For a production deployment with Vite + tree-shaking using the modular Firebase SDK, this could be significantly smaller, but Parcel has issues with the modular imports.
