import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, setDoc, getDoc, collection } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  role: "student" | "representative" | "company" | "companyOwner";
  [key: string]: any;
}

export const authUtils = {
  // ------------------------------
  // Register user (student, representative, or companyOwner)
  // ------------------------------
  registerUser: async (
    email: string,
    password: string,
    role: "student" | "representative" | "companyOwner",
    additionalData?: any
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      let companyId = null;
      let inviteCode = null;

      // If companyOwner, create an entry in companies collection
      if (role === "companyOwner") {
        const companyRef = doc(collection(db, "companies"));
        companyId = companyRef.id;
        inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

        await setDoc(companyRef, {
          companyId,
          companyName: additionalData?.companyName || "Untitled Company",
          ownerId: user.uid,
          inviteCode,
          createdAt: new Date().toISOString(),
        });
      }

      // Add user to "users" collection
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email,
        role,
        companyId,
        inviteCode,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        ...additionalData,
      });

      return { success: true, needsVerification: true };
    } catch (err: any) {
      console.error("Error registering user:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Login user (student, representative, companyOwner)
  // ------------------------------
  loginUser: async (
    email: string,
    password: string,
    role: string
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await auth.signOut();
        return { success: false, error: "Account not found." };
      }

      const userData = userDoc.data();
      if (userData.role !== role) {
        await auth.signOut();
        return { success: false, error: `Invalid account type. Expected ${role}.` };
      }

      if (!user.emailVerified) {
        await auth.signOut();
        return {
          success: false,
          error: "Please verify your email before logging in.",
          needsVerification: true,
        };
      }

      const currentUser = { uid: user.uid, email: user.email!, role, ...userData };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // ✅ Centralized verification + auto-login helper
  // ------------------------------
  verifyAndLogin: async (email?: string, password?: string) => {
    try {
      let user: FirebaseUser | null = auth.currentUser;

      if (!user && email && password) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;
      }

      if (!user) {
        return { success: false, error: "No user found. Please log in again." };
      }

      await user.reload();

      if (user.emailVerified) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          return { success: false, error: "User record not found in Firestore." };
        }

        const userData = userDoc.data();
        const currentUser = { uid: user.uid, email: user.email!, ...userData };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));

        return { success: true, user: currentUser };
      } else {
        return { success: false, error: "Email not yet verified." };
      }
    } catch (err: any) {
      console.error("verifyAndLogin error:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Logout / helpers
  // ------------------------------
  logout: () => {
    localStorage.removeItem("currentUser");
    signOut(auth);
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem("currentUser");
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated: (): boolean => {
    return authUtils.getCurrentUser() !== null;
  },
};
