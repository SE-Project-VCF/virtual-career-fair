import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, getDoc, query, collection, getDocs, where } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  role: "student" | "employer" | "representative";
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
    // Query employers collection for matching invite code
    const q = query(
      collection(db, "employers"),
      where("inviteCode", "==", inviteCode)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { valid: false, error: "Invalid invite code" };
    }
    
    const employerDoc = querySnapshot.docs[0];
    const employerData = employerDoc.data();
    
    return {
      valid: true,
      employerId: employerDoc.id,
      companyName: employerData.companyName
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
  ): Promise<{ success: boolean; inviteCode?: string; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      const inviteCode = generateInviteCode();

      // ✅ Add to Firestore collection "employers"
      await setDoc(doc(db, "employers", user.uid), {
        uid: user.uid,
        email,
        role: "employer",
        inviteCode,
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

      return { success: true, inviteCode };
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
      const inviteValidation = await validateInviteCode(additionalData.inviteCode);
      if (!inviteValidation.valid) {
        return { success: false, error: inviteValidation.error };
      }

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
        companyId: inviteValidation.employerId, // Link to employer
        companyName: inviteValidation.companyName,
        inviteCode: additionalData.inviteCode,
        createdAt: new Date().toISOString(),
        ...additionalData,
      });

      const currentUser: User = {
        uid: user.uid,
        email: user.email!,
        role: "representative",
        companyName: inviteValidation.companyName,
        companyId: inviteValidation.employerId,
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
      
      // Fetch user data from Firestore to verify they are actually a student
      const userDoc = await getDoc(doc(db, "students", user.uid));
      
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

  loginEmployer: async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch user data from Firestore to verify they are actually an employer
      const userDoc = await getDoc(doc(db, "employers", user.uid));
      
      if (!userDoc.exists()) {
        // User is not registered as an employer, sign them out
        await auth.signOut();
        return { success: false, error: "No employer account found with this email." };
      }
      
      const userData = userDoc.data();
      
      // Verify the role matches
      if (userData.role !== "employer") {
        await auth.signOut();
        return { success: false, error: "Invalid account type. Please use the correct login portal." };
      }
      
      const currentUser: User = { 
        uid: user.uid, 
        email: user.email!, 
        role: "employer",
        ...userData
      };
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
      
      // Fetch user data from Firestore to verify they are actually a representative
      const userDoc = await getDoc(doc(db, "representatives", user.uid));
      
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
  // Role validation helpers
  // ------------------------------
  validateUserRole: async (uid: string, expectedRole: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      // Check all collections to find the user
      const collections = ["students", "employers", "representatives"];
      let userFound = false;
      let actualRole = "";
      
      for (const collection of collections) {
        const userDoc = await getDoc(doc(db, collection, uid));
        if (userDoc.exists()) {
          userFound = true;
          const userData = userDoc.data();
          actualRole = userData.role;
          break;
        }
      }
      
      if (!userFound) {
        return { valid: false, error: "User not found in any role collection." };
      }
      
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