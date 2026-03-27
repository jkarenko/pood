import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/storage";

// ──────────────────────────────────────────────────
// Replace with your Firebase project config.
// 1. Create a project at https://console.firebase.google.com
// 2. Enable Cloud Firestore (test mode is fine to start)
// 3. Enable Storage
// 4. Copy your web app config here
// ──────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export const isConfigured =
  firebaseConfig.apiKey !== "" && firebaseConfig.projectId !== "";

if (isConfigured) {
  firebase.initializeApp(firebaseConfig);
}

export const db = isConfigured ? firebase.firestore() : null;
export const storage = isConfigured ? firebase.storage() : null;
