import { auth } from "../firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

export interface User {
  uid: string;
  email: string;
  role: "student" | "employer" | "representative";
  [key: string]: any;
}

export const authUtils = {
  registerStudent: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Optionally store additional data in localStorage
      const currentUser: User = { uid: user.uid, email: user.email!, role: "student", ...additionalData };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  registerEmployer: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const currentUser: User = { uid: user.uid, email: user.email!, role: "employer", ...additionalData };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  registerRepresentative: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const currentUser: User = { uid: user.uid, email: user.email!, role: "representative", ...additionalData };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  loginStudent: async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const currentUser: User = { uid: user.uid, email: user.email!, role: "student" };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  loginEmployer: async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const currentUser: User = { uid: user.uid, email: user.email!, role: "employer" };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  loginRepresentative: async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const currentUser: User = { uid: user.uid, email: user.email!, role: "representative" };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

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
