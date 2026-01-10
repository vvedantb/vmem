// Mock user store for authentication
// In a real app, this would be a database

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string; // In a real app, this would be hashed
  createdAt: string;
}

// In-memory store with a test user
const users: Map<string, StoredUser> = new Map([
  [
    "test@example.com",
    {
      id: "user_1",
      email: "test@example.com",
      name: "Test User",
      password: "password123", // In production, use hashed passwords
      createdAt: new Date().toISOString(),
    },
  ],
]);

export function findUserByEmail(email: string): StoredUser | undefined {
  return users.get(email.toLowerCase());
}

export function createUser(name: string, email: string, password: string): StoredUser {
  const normalizedEmail = email.toLowerCase();

  if (users.has(normalizedEmail)) {
    throw new Error("User with this email already exists");
  }

  const user: StoredUser = {
    id: `user_${Date.now()}`,
    email: normalizedEmail,
    name,
    password, // In production, hash the password
    createdAt: new Date().toISOString(),
  };

  users.set(normalizedEmail, user);
  return user;
}

export function validatePassword(user: StoredUser, password: string): boolean {
  // In production, use bcrypt.compare or similar
  return user.password === password;
}

// Generate a mock JWT token
export function generateToken(userId: string): string {
  // In production, use proper JWT signing
  return `vmem_token_${userId}_${Date.now()}`;
}

// Convert stored user to public user (without password)
export function toPublicUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}
