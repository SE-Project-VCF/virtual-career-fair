import { auth, db, googleProvider } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  signInWithPopup,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { API_URL } from "../config";

async function trySyncStreamUser(uid: string, email: string, firstName?: string, lastName?: string) {
  try {
    await syncStreamUser(uid, email, firstName, lastName)
  } catch (error_) {
    console.warn("Warning: Failed to sync chat user:", error_)
  }
}

async function syncStreamUser(uid: string, email: string, firstName?: string, lastName?: string) {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    await fetch(`${API_URL}/api/sync-stream-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        uid,
        email,
        firstName: firstName || "",
        lastName: lastName || "",
      }),
    });
  } catch (err) {
    console.error("Stream sync failed:", err);
    throw new Error("Failed to sync chat user. Chat features may not work properly.");
  }
}


export interface User {
  uid: string;
  email: string;
  role: "student" | "representative" | "company" | "companyOwner" | "administrator";
  [key: string]: any;
}
// Shared login success handler
async function handleLoginSuccess(user: FirebaseUser, userData: any, role?: string) {
  if (!user.emailVerified) {
    await auth.signOut();
    return {
      success: false,
      error: "Please verify your email before logging in.",
      needsVerification: true,
    };
  }
  const currentUser = { uid: user.uid, email: user.email!, role: role || userData.role, ...userData };
  localStorage.setItem("currentUser", JSON.stringify(currentUser));
  // Attempt to sync user to Stream Chat, but don't block login if it fails
  await trySyncStreamUser(user.uid, user.email!, userData.firstName, userData.lastName);
  return { success: true };
}

export const authUtils = {
  // ------------------------------
  // Register user (student, representative, or companyOwner)
  // ------------------------------
  registerUser: async (
    email: string,
    password: string,
    role: "student" | "representative" | "companyOwner" | "administrator",
    additionalData?: any
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      let userData: any = {
        uid: user.uid,
        email: email.trim().toLowerCase(),
        role,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        ...additionalData,
      };

      // Remove any undefined values from userData (Firestore doesn't allow undefined)
      userData = Object.fromEntries(
        Object.entries(userData).filter(([_, value]) => value !== undefined)
      );

      // Save user data first, then send verification email
      await setDoc(doc(db, "users", user.uid), userData);

      // Only send verification email after successful registration
      await sendEmailVerification(user);

      // Attempt to sync user to Stream Chat, but don't block registration if it fails
      await trySyncStreamUser(user.uid, email, userData.firstName, userData.lastName);

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
      return await handleLoginSuccess(user, userData);
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
      return await handleLoginSuccess(user, userData, role);
    } catch (err: any) {
      console.error("Error logging in:", err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // Google Sign-In (with optional creation)
  // --------------------------------------------------------
  loginWithGoogle: async (
    role: "student" | "representative" | "companyOwner" | "administrator",
    createIfMissing: boolean
  ): Promise<{
    success: boolean;
    exists?: boolean;
    needsProfile?: boolean;
    role?: string;
    error?: string;
  }> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      // --------------------------------------------------------
      // EXISTING USER FOUND
      // --------------------------------------------------------
      if (userSnap.exists()) {
        const existingData = userSnap.data();

        if (createIfMissing) {
          // ❌ REGISTER SCREEN → blocking login here
          return {
            success: false,
            exists: true,
            error: "An account already exists with this Google email. Please sign in instead.",
          };
        }

        // ✔ LOGIN SCREEN → allow login
        const currentUser = {
          uid: user.uid,
          email: user.email!,
          role: existingData.role,
          ...existingData,
        };

        localStorage.setItem("currentUser", JSON.stringify(currentUser));

        // Attempt to sync user to Stream Chat, but don't block login if it fails
        await trySyncStreamUser(user.uid, user.email!, existingData.firstName, existingData.lastName);

        return {
          success: true,
          exists: true,
          needsProfile: false,
          role: existingData.role,
        };
      }


      // --------------------------------------------------------
      // CASE 2: USER DOES NOT EXIST, AND THIS IS LOGIN MODE
      // --------------------------------------------------------
      if (!createIfMissing) {
        return {
          success: false,
          exists: false,
          needsProfile: false,
          error: "No account found. Please register first.",
        };
      }

      // --------------------------------------------------------
      // CASE 3: USER DOES NOT EXIST — REGISTRATION MODE
      // --------------------------------------------------------
      
      // Tell frontend to collect profile info
      return {
        success: true,
        exists: false,
        needsProfile: true,
        role,
      };

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
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
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
      const inviteCode = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

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
            companyName,
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

  // ------------------------------
  // Link Representative to Company via Invite Code
  // ------------------------------
  linkRepresentativeToCompany: async (
    inviteCode: string,
    userId: string
  ): Promise<{ success: boolean; error?: string; companyId?: string; companyName?: string }> => {
    try {
      // Find company with matching invite code
      const companiesRef = collection(db, "companies");
      const companiesSnapshot = await getDocs(companiesRef);

      let companyDoc: any = null;
      let companyId: string | null = null;

      companiesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.inviteCode === inviteCode.toUpperCase()) {
          companyDoc = { id: doc.id, ...data };
          companyId = doc.id;
        }
      });

      if (!companyDoc || !companyId) {
        return { success: false, error: "Invalid invite code." };
      }

      // Check if user is already linked to this company
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.companyId === companyId) {
          return { success: false, error: "You are already linked to this company." };
        }
      }

      // Add user to company's representativeIDs array
      // arrayUnion is atomic and won't add duplicates, so no need to check first
      const companyRef = doc(db, "companies", companyId);
      await updateDoc(companyRef, {
        representativeIDs: arrayUnion(userId),
      });

      // Update user document with companyId and companyName
      await setDoc(userRef, {
        companyId,
        companyName: companyDoc.companyName,
      }, { merge: true });

      // Update localStorage
      const currentUser = authUtils.getCurrentUser();
      if (currentUser) {
        localStorage.setItem(
          "currentUser",
          JSON.stringify({
            ...currentUser,
            companyId,
            companyName: companyDoc.companyName,
          })
        );
      }

      return {
        success: true,
        companyId,
        companyName: companyDoc.companyName
      };
    } catch (err: any) {
      console.error("Error linking representative to company:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Delete Company (for company owners)
  // ------------------------------
  deleteCompany: async (
    companyId: string,
    ownerId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Verify the company exists and user is the owner
      const companyRef = doc(db, "companies", companyId);
      const companyDoc = await getDoc(companyRef);

      if (!companyDoc.exists()) {
        return { success: false, error: "Company not found." };
      }

      const companyData = companyDoc.data();
      if (companyData.ownerId !== ownerId) {
        return { success: false, error: "You don't have permission to delete this company." };
      }

      // Remove companyId from owner's user document
      const ownerRef = doc(db, "users", ownerId);
      const ownerDoc = await getDoc(ownerRef);
      if (ownerDoc.exists()) {
        const ownerData = ownerDoc.data();
        // If owner has multiple companies, only remove this one
        // But if companyId is just a string, replace it with null
        if (ownerData.companyId === companyId) {
          await setDoc(ownerRef, {
            companyId: null,
          }, { merge: true });
        }
      }

      // Remove companyId and companyName from all representatives' user documents
      const representativeIDs = companyData.representativeIDs || [];
      for (const repId of representativeIDs) {
        const repRef = doc(db, "users", repId);
        const repDoc = await getDoc(repRef);
        if (repDoc.exists()) {
          const repData = repDoc.data();
          if (repData.companyId === companyId) {
            await setDoc(repRef, {
              companyId: null,
              companyName: null,
            }, { merge: true });
          }
        }
      }

      // Delete the company document
      await deleteDoc(companyRef);

      // Optionally delete associated booth if it exists
      if (companyData.boothId) {
        try {
          const boothRef = doc(db, "booths", companyData.boothId);
          await deleteDoc(boothRef);
        } catch (err) {
          // Booth deletion is optional, don't fail if it doesn't exist
          console.warn("Could not delete booth:", err);
        }
      }

      return { success: true };
    } catch (err: any) {
      console.error("Error deleting company:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Update Company Invite Code (for company owners)
  // ------------------------------
  updateInviteCode: async (
    companyId: string,
    ownerId: string,
    newInviteCode?: string
  ): Promise<{ success: boolean; error?: string; inviteCode?: string }> => {
    try {
      // Verify the company exists and user is the owner
      const companyRef = doc(db, "companies", companyId);
      const companyDoc = await getDoc(companyRef);

      if (!companyDoc.exists()) {
        return { success: false, error: "Company not found" };
      }

      const companyData = companyDoc.data();
      if (companyData.ownerId !== ownerId) {
        return { success: false, error: "Only the company owner can update the invite code" };
      }

      // Generate new invite code if not provided, or validate provided one
      let inviteCode: string;
      if (newInviteCode) {
        // Validate custom invite code (alphanumeric, 4-20 characters)
        const trimmedCode = newInviteCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{4,20}$/.test(trimmedCode)) {
          return {
            success: false,
            error: "Invite code must be 4-20 characters and contain only letters and numbers"
          };
        }
        inviteCode = trimmedCode;
      } else {
        // Generate random 8-character code
        inviteCode = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      }

      // Use backend API to ensure atomic update and prevent race conditions
      const currentUser = auth.currentUser;
      const idToken = await currentUser?.getIdToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5002"}/api/update-invite-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          companyId,
          userId: currentUser?.uid,
          newInviteCode: inviteCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "Failed to update invite code" };
      }

      // Backend returns the final invite code (useful if it was generated)
      inviteCode = data.inviteCode;

      return { success: true, inviteCode };
    } catch (err: any) {
      console.error("Error updating invite code:", err);
      return { success: false, error: err.message || "Failed to update invite code" };
    }
  },
};
