import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  deleteUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, query, collection, getDocs, where, updateDoc, arrayUnion } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  role: "student" | "companyOwner" | "representative";
  [key: string]: any;
}

const generateInviteCode = (): string => {
  // Generate a cryptographically secure random invite code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  // Use crypto.getRandomValues for better randomness
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < 8; i++) {
    result += chars[array[i] % chars.length];
  }
  
  return result;
};

const validateInviteCode = async (inviteCode: string) => {
  try {
    // Query companies collection for matching invite code
    const q = query(
      collection(db, "companies"),
      where("inviteCode", "==", inviteCode)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { valid: false, error: "Invalid invite code" };
    }
    
    const companyDoc = querySnapshot.docs[0];
    const companyData = companyDoc.data();
    
    return {
      valid: true,
      companyId: companyDoc.id,
      companyName: companyData.companyName || companyData.name,
      ownerId: companyData.ownerId || companyData.createdBy
    };
  } catch (err) {
    return { valid: false, error: "Error validating invite code" };
  }
};

export const authUtils = {
  // ------------------------------
  // Register Student
  // ------------------------------
  registerStudent: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      try {
        // ✅ Add user to Firestore collection "users" FIRST
        // Filter out undefined values (Firestore doesn't allow undefined)
        const userData = {
          uid: user.uid,
          email,
          role: "student",
          emailVerified: false,
          createdAt: new Date().toISOString(),
          ...additionalData,
        };
        // Remove undefined fields
        const cleanedData = Object.fromEntries(
          Object.entries(userData).filter(([_, value]) => value !== undefined)
        );
        
        await setDoc(doc(db, "users", user.uid), cleanedData);

        // Only send verification email if Firestore write succeeds
        await sendEmailVerification(user);

        // Don't save to localStorage yet - user needs to verify email first
        return { success: true, needsVerification: true };
      } catch (firestoreError: any) {
        // If Firestore write fails, clean up the Auth user
        try {
          await deleteUser(user);
        } catch (deleteError) {
          console.error("Failed to delete user after Firestore error:", deleteError);
        }
        throw firestoreError; // Re-throw to be caught by outer catch
      }
    } catch (err: any) {
      console.error("Error registering student:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Register Company Owner
  // ------------------------------
  registerCompanyOwner: async (
    email: string,
    password: string,
    additionalData?: any
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      try {
        // ✅ Add to Firestore collection "users" FIRST
        // Filter out undefined values (Firestore doesn't allow undefined)
        const userData = {
          uid: user.uid,
          email,
          role: "companyOwner",
          emailVerified: false,
          createdAt: new Date().toISOString(),
          ...additionalData,
        };
        // Remove undefined fields
        const cleanedData = Object.fromEntries(
          Object.entries(userData).filter(([_, value]) => value !== undefined)
        );
        
        await setDoc(doc(db, "users", user.uid), cleanedData);

        // Only send verification email if Firestore write succeeds
        await sendEmailVerification(user);

        // Don't save to localStorage yet - user needs to verify email first
        return { success: true, needsVerification: true };
      } catch (firestoreError: any) {
        // If Firestore write fails, clean up the Auth user
        try {
          await deleteUser(user);
        } catch (deleteError) {
          console.error("Failed to delete user after Firestore error:", deleteError);
        }
        throw firestoreError; // Re-throw to be caught by outer catch
      }
    } catch (err: any) {
      console.error("Error registering company owner:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Create Company
  // ------------------------------
  createCompany: async (
    companyName: string,
    ownerId: string
  ): Promise<{ success: boolean; companyId?: string; inviteCode?: string; error?: string }> => {
    try {
      const inviteCode = generateInviteCode();
      
      // Create company document
      const companyRef = doc(collection(db, "companies"));
      await setDoc(companyRef, {
        companyName,
        ownerId,
        inviteCode,
        representativeIDs: [],
        createdAt: new Date().toISOString(),
      });

      return { 
        success: true, 
        companyId: companyRef.id, 
        inviteCode 
      };
    } catch (err: any) {
      console.error("Error creating company:", err);
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
  ): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    let userCredential: any = null;
    try {
      // Create user first (authenticates them for Firestore queries)
      userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Now validate invite code (user is authenticated, so Firestore rules allow the query)
      let inviteValidation: { valid: boolean; error?: string; companyId?: string; companyName?: string; ownerId?: string } | null = null;
      
      // Only validate invite code if provided
      if (additionalData?.inviteCode) {
        inviteValidation = await validateInviteCode(additionalData.inviteCode);
        if (!inviteValidation.valid) {
          // Validation failed - clean up the Auth user
          try {
            await deleteUser(user);
          } catch (deleteError) {
            console.error("Failed to delete user after invite code validation error:", deleteError);
          }
          return { success: false, error: inviteValidation.error };
        }
      }

      try {
        // ✅ Add to Firestore collection "users" FIRST
        // Filter out undefined values (Firestore doesn't allow undefined)
        const userData = {
          uid: user.uid,
          email,
          role: "representative",
          ...(inviteValidation && {
            companyId: inviteValidation.companyId, // Link to company
            companyName: inviteValidation.companyName,
            ...(inviteValidation.ownerId && { ownerId: inviteValidation.ownerId }), // Link to company owner
          }),
          emailVerified: false,
          createdAt: new Date().toISOString(),
          ...additionalData,
        };
        // Remove undefined fields
        const cleanedData = Object.fromEntries(
          Object.entries(userData).filter(([_, value]) => value !== undefined)
        );
        
        await setDoc(doc(db, "users", user.uid), cleanedData);

        // ✅ Update company's representativeIDs array if invite code was used
        if (inviteValidation && inviteValidation.companyId) {
          await updateDoc(doc(db, "companies", inviteValidation.companyId), {
            representativeIDs: arrayUnion(user.uid)
          });
        }

        // Only send verification email if all Firestore writes succeed
        await sendEmailVerification(user);

        // Don't save to localStorage yet - user needs to verify email first
        return { success: true, needsVerification: true };
      } catch (firestoreError: any) {
        // If Firestore write fails, clean up the Auth user
        try {
          await deleteUser(user);
        } catch (deleteError) {
          console.error("Failed to delete user after Firestore error:", deleteError);
        }
        throw firestoreError; // Re-throw to be caught by outer catch
      }
    } catch (err: any) {
      // If user creation failed, no need to clean up
      // If user was created but something else failed, it should already be cleaned up
      console.error("Error registering representative:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Logins
  // ------------------------------
  loginStudent: async (email: string, password: string): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch user data from Firestore to verify they are actually a student
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        // User is not registered as a student, sign them out
        await auth.signOut();
        return { success: false, error: "No student account found with this email." };
      }
      
      const userData = userDoc.data();
      
      // Verify the role matches
      if (userData.role !== "student") {
        await auth.signOut();
        return { success: false, error: "Invalid account type. Please use the correct login portal." };
      }
      
      // Check if email is verified
      if (!user.emailVerified) {
        await auth.signOut();
        return { 
          success: false, 
          error: "Please verify your email before logging in. Check your inbox for a verification link.",
          needsVerification: true 
        };
      }
      
      const currentUser: User = { 
        uid: user.uid, 
        email: user.email!, 
        role: "student",
        ...userData
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in student:", err);
      return { success: false, error: err.message };
    }
  },

  loginCompanyOwner: async (email: string, password: string): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch user data from Firestore to verify they are actually a company owner
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        // User is not registered as a company owner, sign them out
        await auth.signOut();
        return { success: false, error: "No company owner account found with this email." };
      }
      
      const userData = userDoc.data();
      
      // Verify the role matches
      if (userData.role !== "companyOwner") {
        await auth.signOut();
        return { success: false, error: "Invalid account type. Please use the correct login portal." };
      }
      
      // Check if email is verified
      if (!user.emailVerified) {
        await auth.signOut();
        return { 
          success: false, 
          error: "Please verify your email before logging in. Check your inbox for a verification link.",
          needsVerification: true 
        };
      }
      
      const currentUser: User = { 
        uid: user.uid, 
        email: user.email!, 
        role: "companyOwner",
        ...userData
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in company owner:", err);
      return { success: false, error: err.message };
    }
  },

  loginRepresentative: async (email: string, password: string): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch user data from Firestore to verify they are actually a representative
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        // User is not registered as a representative, sign them out
        await auth.signOut();
        return { success: false, error: "No representative account found with this email." };
      }
      
      const userData = userDoc.data();
      
      // Verify the role matches
      if (userData.role !== "representative") {
        await auth.signOut();
        return { success: false, error: "Invalid account type. Please use the correct login portal." };
      }
      
      // Check if email is verified
      if (!user.emailVerified) {
        await auth.signOut();
        return { 
          success: false, 
          error: "Please verify your email before logging in. Check your inbox for a verification link.",
          needsVerification: true 
        };
      }
      
      const currentUser: User = { 
        uid: user.uid, 
        email: user.email!, 
        role: "representative",
        ...userData
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in representative:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Unified Login (tries all roles)
  // ------------------------------
  login: async (email: string, password: string): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch user from users collection
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        await auth.signOut();
        return { success: false, error: "No account found with this email." };
      }
      
      const userData = userDoc.data();
      const userRole = userData.role as "student" | "companyOwner" | "representative";
      
      // Verify the role is valid
      if (!["student", "companyOwner", "representative"].includes(userRole)) {
        await auth.signOut();
        return { success: false, error: "Invalid account type. Please contact support." };
      }
      
      // Check if email is verified
      if (!user.emailVerified) {
        await auth.signOut();
        return { 
          success: false, 
          error: "Please verify your email before logging in. Check your inbox for a verification link.",
          needsVerification: true 
        };
      }
      
      const currentUser: User = { 
        uid: user.uid, 
        email: user.email!, 
        role: userRole,
        ...userData
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in:", err);
      return { success: false, error: err.message };
    }
  },

  // ------------------------------
  // Role validation helpers
  // ------------------------------
  validateUserRole: async (uid: string, expectedRole: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      // Check users collection
      const userDoc = await getDoc(doc(db, "users", uid));
      
      if (!userDoc.exists()) {
        return { valid: false, error: "User not found." };
      }
      
      const userData = userDoc.data();
      const actualRole = userData.role;
      
      if (actualRole !== expectedRole) {
        return { 
          valid: false, 
          error: `Invalid role. Expected ${expectedRole}, but user is registered as ${actualRole}.` 
        };
      }
      
      return { valid: true };
    } catch (err) {
      return { valid: false, error: "Error validating user role." };
    }
  },

  // ------------------------------
  // Log user in after email verification
  // ------------------------------
  loginAfterVerification: async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const user = auth.currentUser;
      if (!user || !user.emailVerified) {
        return { success: false, error: "User not verified or not logged in." };
      }

      // Fetch user data from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        return { success: false, error: "User document not found." };
      }

      const userData = userDoc.data();
      const userRole = userData.role as "student" | "companyOwner" | "representative";
      
      // Verify the role is valid
      if (!["student", "companyOwner", "representative"].includes(userRole)) {
        return { success: false, error: "Invalid account type." };
      }

      // Save to localStorage (log them in)
      const currentUser: User = {
        uid: user.uid,
        email: user.email!,
        role: userRole,
        ...userData
      };
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      
      return { success: true };
    } catch (err: any) {
      console.error("Error logging in after verification:", err);
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