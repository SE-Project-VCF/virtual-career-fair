import { auth, db, googleProvider } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  signInWithPopup,
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

      await sendEmailVerification(user);

      let userData: any = {
        uid: user.uid,
        email,
        role,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        ...additionalData,
      };

      // ✅ Only create company & attach company fields for companyOwner
      if (role === "companyOwner") {
        const companyRef = doc(collection(db, "companies"));
        const companyId = companyRef.id;
        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

        await setDoc(companyRef, {
          companyId,
          companyName: additionalData?.companyName || "Untitled Company",
          ownerId: user.uid,
          inviteCode,
          createdAt: new Date().toISOString(),
        });

        // Add company fields only for company owners
        userData = {
          ...userData,
          companyId,
          inviteCode,
        };
      }

      await setDoc(doc(db, "users", user.uid), userData);

      return { success: true, needsVerification: true };
    } catch (err: any) {
      console.error("Error registering user:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Unified login (auto-detects user role)
  // ------------------------------
  login: async (
    email: string,
    password: string
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
      const role = userData.role;

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
  // ✅ Google Sign-In (creates user + company if missing)
  // ------------------------------
  loginWithGoogle: async (
    role: "student" | "representative" | "companyOwner"
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);

      // --- Case 1: Existing user ---
      if (userDoc.exists()) {
        const existingUser = userDoc.data();
        localStorage.setItem(
          "currentUser",
          JSON.stringify({
            uid: user.uid,
            email: user.email,
            role: existingUser.role,
            provider: "google",
            ...existingUser,
          })
        );
        return { success: true };
      }

      // --- Case 2: New user (create record) ---
      let companyId: string | null = null;
      let inviteCode: string | null = null;

      if (role === "companyOwner") {
        // Create a new company with a null companyName (editable later)
        const companyRef = doc(collection(db, "companies"));
        companyId = companyRef.id;
        inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

        await setDoc(companyRef, {
          companyId,
          companyName: null, // null value by design
          ownerId: user.uid,
          inviteCode,
          createdAt: new Date().toISOString(),
        });
      }

      // Create new user record in Firestore
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        role,
        provider: "google",
        emailVerified: user.emailVerified,
        companyId,
        inviteCode,
        createdAt: new Date().toISOString(),
      });

      // Store user in localStorage
      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          uid: user.uid,
          email: user.email,
          role,
          companyId,
          inviteCode,
          provider: "google",
        })
      );

      return { success: true };
    } catch (err: any) {
      console.error("Google Sign-In failed:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Verify + Auto-login helper
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

  // ------------------------------
  // Create Company (for company owners)
  // ------------------------------
  createCompany: async (
    companyName: string,
    ownerId: string
  ): Promise<{ success: boolean; error?: string; companyId?: string }> => {
    try {
      const companyRef = doc(collection(db, "companies"));
      const companyId = companyRef.id;
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      await setDoc(companyRef, {
        companyId,
        companyName,
        ownerId,
        inviteCode,
        createdAt: new Date().toISOString(),
      });

      // Update the user's companyId if they don't have one
      const userRef = doc(db, "users", ownerId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (!userData.companyId) {
          await setDoc(userRef, {
            ...userData,
            companyId,
            inviteCode,
          }, { merge: true });
        }
      }

      return { success: true, companyId };
    } catch (err: any) {
      console.error("Error creating company:", err);
      return { success: false, error: err.message };
    }
  },
};
