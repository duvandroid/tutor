import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);

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
};

export const signUp = async (email: string, password: string): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  startSession();
  return result.user;
};

export const signIn = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  startSession();
  return result.user;
};

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};

export const logout = async () => {
  clearSession();
  await signOut(auth);
};

export { onAuthStateChanged, type User };
