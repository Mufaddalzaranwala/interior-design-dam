import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { users } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { User } from '../../database/schema';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
);
const JWT_EXPIRES_IN = '7d';
const COOKIE_NAME = 'dam-auth-token';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'employee';
  isActive: boolean;
}

export interface JWTPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'employee';
  iat: number;
  exp: number;
}

// Password utilities
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// JWT utilities
export const createToken = async (user: AuthUser): Promise<string> => {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
};

export const verifyToken = async (token: string): Promise<JWTPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as JWTPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
};

// Authentication functions
export const login = async (email: string, password: string): Promise<{ user: AuthUser; token: string } | null> => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.isActive) {
      return null;
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return null;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'admin' | 'employee',
      isActive: user.isActive,
    };

    const token = await createToken(authUser);

    return { user: authUser, token };
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
};

export const createUser = async (
  email: string,
  password: string,
  name: string,
  role: 'admin' | 'employee' = 'employee'
): Promise<AuthUser | null> => {
  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    const hashedPassword = await hashPassword(password);
    const userId = nanoid();
    const now = new Date();

    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      name,
      passwordHash: hashedPassword,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(users).values(newUser);

    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      isActive: newUser.isActive,
    };
  } catch (error) {
    console.error('Create user error:', error);
    return null;
  }
};

export const updateUserPassword = async (userId: string, newPassword: string): Promise<boolean> => {
  try {
    const hashedPassword = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ 
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    return true;
  } catch (error) {
    console.error('Update password error:', error);
    return false;
  }
};

export const deactivateUser = async (userId: string): Promise<boolean> => {
  try {
    await db
      .update(users)
      .set({ 
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    return true;
  } catch (error) {
    console.error('Deactivate user error:', error);
    return false;
  }
};

// Session management
export const setAuthCookie = async (token: string) => {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    path: '/',
  });
};

export const getAuthCookie = (): string | null => {
  try {
    const cookieStore = cookies();
    return cookieStore.get(COOKIE_NAME)?.value || null;
  } catch (error) {
    // Cookies might not be available in all contexts
    return null;
  }
};

export const clearAuthCookie = () => {
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    const token = getAuthCookie();
    if (!token) {
      return null;
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return null;
    }

    // Verify user still exists and is active
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);

    if (!user || !user.isActive) {
      return null;
    }

    return user as AuthUser;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

export const requireAuth = async (): Promise<AuthUser> => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
};

export const requireAdmin = async (): Promise<AuthUser> => {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return user;
};

// Middleware helpers
export const isAuthenticated = async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user !== null;
};

export const isAdmin = async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user?.role === 'admin';
};

// Logout
export const logout = () => {
  clearAuthCookie();
};

// Token validation for API routes
export const validateAuthHeader = async (authHeader: string | null): Promise<AuthUser | null> => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token);
  
  if (!payload) {
    return null;
  }

  // Verify user still exists and is active
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, payload.id))
    .limit(1);

  if (!user || !user.isActive) {
    return null;
  }

  return user as AuthUser;
};