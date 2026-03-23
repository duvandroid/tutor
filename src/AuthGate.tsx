import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import App from './App';
import Login from './Login';
import {
  auth,
  onAuthStateChanged,
  isSessionValid,
  completeSignIn,
  startSession,
  logout,
  type User,
} from './lib/firebase';
import { isSignInWithEmailLink } from 'firebase/auth';

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Step 1: If returning from email link, complete sign-in FIRST
      if (isSignInWithEmailLink(auth, window.location.href)) {
        try {
          const u = await completeSignIn();
          if (!cancelled && u) {
            setUser(u);
            setChecking(false);
            return; // done — skip onAuthStateChanged initial check
          }
        } catch (err) {
          console.error('Sign-in link error:', err);
        }
      }

      // Step 2: Listen for auth state (normal flow / already signed in)
      const unsub = onAuthStateChanged(auth, (u) => {
        if (cancelled) return;
        if (u && isSessionValid()) {
          setUser(u);
        } else if (u) {
          // Signed in but session expired
          logout();
          setUser(null);
        } else {
          setUser(null);
        }
        setChecking(false);
      });

      return unsub;
    };

    let unsub: (() => void) | undefined;
    init().then((u) => { unsub = u; });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  if (checking) {
    return (
      <div className="h-dvh bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  return <App user={user} onLogout={logout} />;
}
