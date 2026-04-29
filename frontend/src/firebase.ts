// src/firebase.ts
import { initializeApp } from "firebase/app";

import { getAuth, GoogleAuthProvider, onAuthStateChanged, type User } from "firebase/auth"; // ✅ added GoogleAuthProvider
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDe9f6r1B4SsgINjxaTJBHbEDRBSLkFnYs",
  authDomain: "careerfairdb-48105.firebaseapp.com",
  projectId: "careerfairdb-48105",
  storageBucket: "careerfairdb-48105.appspot.com",
  messagingSenderId: "427612226177",
  appId: "1:427612226177:web:f00d7f82c10ab89e9a0380",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/** Resolves when Firebase has restored `currentUser` (or null after timeout). Use before token calls after navigation. */
export function waitForFirebaseUser(): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        clearTimeout(timer);
        unsub();
        resolve(u);
      }
    });
  });
}

export const storage = getStorage(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider(); // ✅ added this line
