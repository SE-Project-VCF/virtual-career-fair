const API_BASE_URL = 'http://localhost:5000'; // Adjust if your backend runs on different port

export interface User {
  id: string;
  email: string;
  role: "student" | "employer";
  registeredAt: string;
  // Add other fields based on your Firestore schema
  [key: string]: any;
}

export const authUtils = {
  // Register a new student
  registerStudent: async (email: string, password: string, additionalData?: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/add-student`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          ...additionalData
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Auto-login after successful registration
        return await authUtils.loginStudent(email, password);
      } else {
        return { success: false, error: result.error || 'Registration failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  // Register a new employer
  registerEmployer: async (email: string, password: string, additionalData?: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/add-employer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          ...additionalData
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Auto-login after successful registration
        return await authUtils.loginEmployer(email, password);
      } else {
        return { success: false, error: result.error || 'Registration failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  // Login student
  loginStudent: async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/login-student`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();
      
      if (result.success) {
        localStorage.setItem("currentUser", JSON.stringify(result.user));
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Login failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  // Login employer
  loginEmployer: async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/login-employer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();
      
      if (result.success) {
        localStorage.setItem("currentUser", JSON.stringify(result.user));
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Login failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  },

  // Keep existing utility methods
  logout: () => {
    localStorage.removeItem("currentUser");
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem("currentUser");
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated: (): boolean => {
    return authUtils.getCurrentUser() !== null;
  },
};