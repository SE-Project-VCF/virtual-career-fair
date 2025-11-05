// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth"; // ✅ added GoogleAuthProvider
import { getFirestore } from "firebase/firestore";

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
export const storage = getStorage(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider(); // ✅ added this line
