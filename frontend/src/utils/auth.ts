export interface User {
    email: string
    password: string
    registeredAt: string
  }
  
  export const authUtils = {
    // Register a new user
    register: (email: string, password: string): { success: boolean; error?: string } => {
      const users = authUtils.getUsers()
  
      // Check if email already exists
      if (users.some((user) => user.email === email)) {
        return { success: false, error: "Email already in use." }
      }
  
      // Create new user
      const newUser: User = {
        email,
        password, // In production, this should be hashed on the backend
        registeredAt: new Date().toISOString(),
      }
  
      users.push(newUser)
      localStorage.setItem("users", JSON.stringify(users))
  
      // Auto-login after registration
      authUtils.login(email, password)
  
      return { success: true }
    },
  
    // Login user
    login: (email: string, password: string): { success: boolean; error?: string } => {
      const users = authUtils.getUsers()
      const user = users.find((u) => u.email === email && u.password === password)
  
      if (!user) {
        return { success: false, error: "Invalid email or password." }
      }
  
      localStorage.setItem("currentUser", JSON.stringify(user))
      return { success: true }
    },
  
    // Logout user
    logout: () => {
      localStorage.removeItem("currentUser")
    },
  
    // Get current logged-in user
    getCurrentUser: (): User | null => {
      const userStr = localStorage.getItem("currentUser")
      return userStr ? JSON.parse(userStr) : null
    },
  
    // Get all users
    getUsers: (): User[] => {
      const usersStr = localStorage.getItem("users")
      return usersStr ? JSON.parse(usersStr) : []
    },
  
    // Check if user is authenticated
    isAuthenticated: (): boolean => {
      return authUtils.getCurrentUser() !== null
    },
  }
  