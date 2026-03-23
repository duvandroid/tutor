import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Layout from './Layout';
import Login from './Login';
import {
  auth,
  onAuthStateChanged,
  isSessionValid,
  startSession,
  logout,
  type User,
} from './lib/firebase';

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && isSessionValid()) {
        setUser(u);
      } else if (u && !isSessionValid()) {
        // Firebase still has a session but our 24h window expired
        // Re-start the session since user is already authenticated
        startSession();
        setUser(u);
      } else {
        setUser(null);
      }
      setChecking(false);
    });

    return () => unsub();
  }, []);

  if (checking) {
    return (
      <div className="h-dvh bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  return <Layout user={user} onLogout={logout} />;
}
