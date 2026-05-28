import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

export type Role = 'admin' | 'user';

export interface Session {
  user: User;
  role: Role | null;  // null = signed in but not allowlisted
}

export function signIn(): Promise<User> {
  return signInWithPopup(auth, googleProvider).then((cred) => cred.user);
}

export function signOutNow(): Promise<void> {
  return signOut(auth);
}

export async function resolveRole(user: User): Promise<Role | null> {
  if (!user.email) return null;
  const snap = await getDoc(doc(db, 'studioConsoleAllowlist', user.email.toLowerCase()));
  if (!snap.exists()) return null;
  const data = snap.data() as { role?: Role };
  return data.role === 'admin' ? 'admin' : data.role === 'user' ? 'user' : null;
}

export function onSession(cb: (session: Session | null) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { cb(null); return; }
    try {
      const role = await resolveRole(user);
      cb({ user, role });
    } catch (e) {
      console.error('[auth] resolveRole failed', e);
      cb({ user, role: null });
    }
  });
}
