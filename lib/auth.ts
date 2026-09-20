// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey = process.env.JWT_SECRET;
const key = new TextEncoder().encode(secretKey);

// Create a 72-hour token
export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('72h')
    .sign(key);
}

// Read the token
export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
    return payload;
  } catch (error) {
    return null;
  }
}

// Helper to get the current user ID inside Server Actions
export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get('gof_session')?.value;
  if (!session) return null;
  return await decrypt(session);
}

// Log out
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set('gof_session', '', { expires: new Date(0) });
}
