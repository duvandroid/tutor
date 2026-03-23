import { initializeApp } from 'firebase/app';
import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAh6cDzd2atM_VjPO5qd6F8KspUQKUmmVM',
  authDomain: 'claudia-tutor.firebaseapp.com',
  projectId: 'claudia-tutor',
  storageBucket: 'claudia-tutor.firebasestorage.app',
  messagingSenderId: '102003479248',
  appId: '1:102003479248:web:9f91c277fbd9d7877384d5',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const SESSION_KEY = 'claudia_session_ts';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

export const isSessionValid = (): boolean => {
  const ts = localStorage.getItem(SESSION_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < SESSION_DURATION_MS;
};

export const startSession = () => {
  localStorage.setItem(SESSION_KEY, Date.now().toString());
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('emailForSignIn');
};

export const sendVerificationLink = async (email: string) => {
  const actionCodeSettings = {
    url: window.location.origin,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  localStorage.setItem('emailForSignIn', email);
};

export const completeSignIn = async (): Promise<User | null> => {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;

  let email = localStorage.getItem('emailForSignIn');
  if (!email) {
    email = window.prompt('Por favor confirma tu correo electrónico:');
  }
  if (!email) return null;

  const result = await signInWithEmailLink(auth, email, window.location.href);
  localStorage.removeItem('emailForSignIn');
  startSession();

  // Clean up URL
  window.history.replaceState(null, '', window.location.origin);

  return result.user;
};

export const logout = async () => {
  clearSession();
  await signOut(auth);
};

export { onAuthStateChanged, type User };
