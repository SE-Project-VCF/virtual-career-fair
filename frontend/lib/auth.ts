// Client-side authentication utilities using localStorage

export interface User {
    id: string
    email: string
    createdAt: string
  }
  
  export interface StoredUser extends User {
    password: string
  }
  
  const USERS_KEY = "career_fair_users"
  const CURRENT_USER_KEY = "career_fair_current_user"
  
  // Get all registered users from localStorage
  export function getStoredUsers(): StoredUser[] {
    if (typeof window === "undefined") return []
    const users = localStorage.getItem(USERS_KEY)
    return users ? JSON.parse(users) : []
  }
  
  // Save users to localStorage
  function saveUsers(users: StoredUser[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  }
  
  // Register a new user
  export function registerUser(email: string, password: string): { success: boolean; error?: string } {
    const users = getStoredUsers()
  
    // Check if email already exists
    if (users.some((user) => user.email === email)) {
      return { success: false, error: "Email already in use." }
    }
  
    // Create new user
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      email,
      password, // In production, this should be hashed
      createdAt: new Date().toISOString(),
    }
  
    users.push(newUser)
    saveUsers(users)
  
    // Set as current user
    setCurrentUser({ id: newUser.id, email: newUser.email, createdAt: newUser.createdAt })
  
    return { success: true }
  }
  
  // Login user
  export function loginUser(email: string, password: string): { success: boolean; error?: string } {
    const users = getStoredUsers()
    const user = users.find((u) => u.email === email && u.password === password)
  
    if (!user) {
      return { success: false, error: "Invalid email or password." }
    }
  
    setCurrentUser({ id: user.id, email: user.email, createdAt: user.createdAt })
    return { success: true }
  }
  
  // Get current logged-in user
  export function getCurrentUser(): User | null {
    if (typeof window === "undefined") return null
    const user = localStorage.getItem(CURRENT_USER_KEY)
    return user ? JSON.parse(user) : null
  }
  
  // Set current user
  function setCurrentUser(user: User): void {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  }
  
  // Logout user
  export function logoutUser(): void {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
  
  // Check if user is authenticated
  export function isAuthenticated(): boolean {
    return getCurrentUser() !== null
  }
  