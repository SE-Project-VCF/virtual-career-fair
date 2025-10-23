import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  role: "student" | "employer" | "representative";
  [key: string]: any;
}

export const authUtils = {
  // ------------------------------
  // Register Student
  // ------------------------------
  registerStudent: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // ✅ Add user to Firestore collection "students"
      await setDoc(doc(db, "students", user.uid), {
        uid: user.uid,
        email,
        role: "student",
        createdAt: new Date().toISOString(),
        ...additionalData,
      });

      // Save current user locally
      const currentUser: User = {
        uid: user.uid,
        email: user.email!,
        role: "student",
        ...additionalData,
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      return { success: true };
    } catch (err: any) {
      console.error("Error registering student:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Register Employer
  // ------------------------------
  registerEmployer: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // ✅ Add to Firestore collection "employers"
      await setDoc(doc(db, "employers", user.uid), {
        uid: user.uid,
        email,
        role: "employer",
        createdAt: new Date().toISOString(),
        ...additionalData,
      });

      const currentUser: User = {
        uid: user.uid,
        email: user.email!,
        role: "employer",
        ...additionalData,
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      return { success: true };
    } catch (err: any) {
      console.error("Error registering employer:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Register Representative
  // ------------------------------
  registerRepresentative: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // ✅ Add to Firestore collection "representatives"
      await setDoc(doc(db, "representatives", user.uid), {
        uid: user.uid,
        email,
        role: "representative",
        createdAt: new Date().toISOString(),
        ...additionalData,
      });

      const currentUser: User = {
        uid: user.uid,
        email: user.email!,
        role: "representative",
        ...additionalData,
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      return { success: true };
    } catch (err: any) {
      console.error("Error registering representative:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Logins
  // ------------------------------
  loginStudent: async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const currentUser: User = { uid: user.uid, email: user.email!, role: "student" };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in student:", err);
      return { success: false, error: err.message };
    }
  },

  loginEmployer: async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const currentUser: User = { uid: user.uid, email: user.email!, role: "employer" };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in employer:", err);
      return { success: false, error: err.message };
    }
  },

  loginRepresentative: async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const currentUser: User = { uid: user.uid, email: user.email!, role: "representative" };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in representative:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Logout / User helpers
  // ------------------------------
  logout: () => {
    localStorage.removeItem("currentUser");
    auth.signOut();
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem("currentUser");
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated: (): boolean => {
    return authUtils.getCurrentUser() !== null;
  },
};