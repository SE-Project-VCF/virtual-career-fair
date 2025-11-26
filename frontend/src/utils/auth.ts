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

export interface User {
  uid: string;
  email: string;
  role: "student" | "representative" | "company" | "companyOwner" | "administrator";
  [key: string]: any;
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
        email,
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

      // ------------------------------------
      // Existing User — Block Re-registration
      // ------------------------------------
      if (userSnap.exists()) {
        const existing = userSnap.data();

        return {
          success: false,   // ❗ important: not a successful registration
          exists: true,     // tells UI a user already exists
          needsProfile: false,
          role: existing.role,
          error: "An account already exists with this Google email. Please sign in instead.",
        };
      }


      // ------------------------------------
      // New User — Only allowed if registering
      // ------------------------------------
      if (!createIfMissing) {
        // LOGIN MODE: block unregistered users
        return {
          success: true,
          exists: false,
          needsProfile: false,
          role: undefined,
        };
      }

      /// ------------------------------------
      // New user — Registration mode
      // ------------------------------------
      let firstName = "";
      let lastName = "";

      // Parse Google name (prefill only)
      if (user.displayName) {
        const parts = user.displayName.trim().split(" ");
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || "";
      }

      // Do NOT create Firestore user yet.
      // Let frontend collect full profile, then create user manually.
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

      // Add user to company's representativeIDs array (if not already there)
      const companyRef = doc(db, "companies", companyId);
      const companyData = await getDoc(companyRef);

      if (companyData.exists()) {
        const currentReps = companyData.data().representativeIDs || [];
        if (!currentReps.includes(userId)) {
          // Use arrayUnion to add the user ID - this is safer and works better with security rules
          await updateDoc(companyRef, {
            representativeIDs: arrayUnion(userId),
          });
        }
      }

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
        inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      }

      // Check if invite code is already in use by another company
      const companiesRef = collection(db, "companies");
      const companiesSnapshot = await getDocs(companiesRef);
      let codeInUse = false;

      companiesSnapshot.forEach((doc) => {
        if (doc.id !== companyId && doc.data().inviteCode === inviteCode) {
          codeInUse = true;
        }
      });

      if (codeInUse) {
        // If regenerating, try again (up to 5 times)
        if (!newInviteCode) {
          let attempts = 0;
          while (codeInUse && attempts < 5) {
            inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
            codeInUse = false;
            companiesSnapshot.forEach((doc) => {
              if (doc.id !== companyId && doc.data().inviteCode === inviteCode) {
                codeInUse = true;
              }
            });
            attempts++;
          }

          if (codeInUse) {
            return { success: false, error: "Failed to generate unique invite code. Please try again." };
          }
        } else {
          return { success: false, error: "This invite code is already in use by another company" };
        }
      }

      // Update the invite code
      await updateDoc(companyRef, {
        inviteCode: inviteCode,
        inviteCodeUpdatedAt: new Date().toISOString(),
      });

      return { success: true, inviteCode };
    } catch (err: any) {
      console.error("Error updating invite code:", err);
      return { success: false, error: err.message || "Failed to update invite code" };
    }
  },
};
