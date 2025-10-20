// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDe9f6r1B4SsgINjxaTJBHbEDRBSLkFnYs",
  authDomain: "careerfairdb-48105.firebaseapp.com",
  projectId: "careerfairdb-48105",
  storageBucket: "careerfairdb-48105.firebasestorage.app.appspot.com",
  messagingSenderId: "427612226177",
  appId: "1:427612226177:web:f00d7f82c10ab89e9a0380",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
