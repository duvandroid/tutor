import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  increment,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// === TYPES ===

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  totalSessions: number;
  totalMessages: number;
  totalQuizzes: number;
  totalAudioCalls: number;
};

export type Conversation = {
  id: string;
  userId: string;
  title: string;
  topic: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messageCount: number;
};

export type StoredMessage = {
  id?: string;
  role: 'user' | 'model';
  text: string;
  files?: { name: string; type: string }[];
  quiz?: any;
  createdAt: Timestamp;
};

// === ADMIN EMAILS ===
const ADMIN_EMAILS = ['duvandroid@gmail.com'];

// === USER PROFILE ===

export async function ensureUserProfile(uid: string, email: string, displayName: string | null): Promise<UserProfile> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Update last login
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
    return { ...snap.data(), uid } as UserProfile;
  }

  const profile: Omit<UserProfile, 'uid'> = {
    email,
    displayName,
    isAdmin: ADMIN_EMAILS.includes(email.toLowerCase()),
    createdAt: Timestamp.now(),
    lastLoginAt: Timestamp.now(),
    totalSessions: 0,
    totalMessages: 0,
    totalQuizzes: 0,
    totalAudioCalls: 0,
  };

  await setDoc(ref, profile);
  return { ...profile, uid };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { ...snap.data(), uid } as UserProfile;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('lastLoginAt', 'desc')));
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id } as UserProfile));
}

// === CONVERSATIONS ===

export async function createConversation(userId: string, topic: string): Promise<string> {
  const ref = await addDoc(collection(db, 'conversations'), {
    userId,
    title: 'Nueva conversación',
    topic: topic || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    messageCount: 0,
  });

  // Increment user session count
  await updateDoc(doc(db, 'users', userId), {
    totalSessions: increment(1),
  });

  return ref.id;
}

export async function getUserConversations(userId: string): Promise<Conversation[]> {
  const q = query(
    collection(db, 'conversations'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Conversation));
}

export async function updateConversationTitle(convId: string, title: string) {
  await updateDoc(doc(db, 'conversations', convId), { title, updatedAt: serverTimestamp() });
}

export async function updateConversationTopic(convId: string, topic: string) {
  await updateDoc(doc(db, 'conversations', convId), { topic, updatedAt: serverTimestamp() });
}

export async function deleteConversation(convId: string) {
  // Delete all messages in the conversation
  const msgSnap = await getDocs(collection(db, 'conversations', convId, 'messages'));
  const deletes = msgSnap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletes);
  // Delete the conversation
  await deleteDoc(doc(db, 'conversations', convId));
}

// === MESSAGES ===

export async function addMessage(
  convId: string,
  userId: string,
  message: Omit<StoredMessage, 'createdAt'>,
) {
  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    ...message,
    createdAt: serverTimestamp(),
  });

  // Update conversation metadata
  await updateDoc(doc(db, 'conversations', convId), {
    messageCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  // Update user stats
  const updates: Record<string, any> = { totalMessages: increment(1) };
  if (message.quiz) {
    updates.totalQuizzes = increment(1);
  }
  await updateDoc(doc(db, 'users', userId), updates);
}

export async function getConversationMessages(convId: string): Promise<StoredMessage[]> {
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as StoredMessage));
}

// Auto-generate title from first user message
export async function autoTitleConversation(convId: string, firstMessage: string) {
  const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : '');
  await updateConversationTitle(convId, title);
}

// === USAGE TRACKING ===

export async function trackAudioCall(userId: string) {
  await updateDoc(doc(db, 'users', userId), {
    totalAudioCalls: increment(1),
  });
}

// === ADMIN: Get all conversations for a specific user ===

export async function getConversationsForUser(userId: string): Promise<Conversation[]> {
  const q = query(
    collection(db, 'conversations'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Conversation));
}
