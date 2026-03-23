import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import App from './App';
import {
  ensureUserProfile,
  getUserConversations,
  createConversation,
  deleteConversation as deleteConv,
  type UserProfile,
  type Conversation,
} from './lib/firestore';

type LayoutProps = {
  user: { uid: string; email: string | null; displayName: string | null };
  onLogout: () => void;
};

function ChatWrapper({
  user,
  profile,
  conversations,
  refreshConversations,
}: {
  user: LayoutProps['user'];
  profile: UserProfile;
  conversations: Conversation[];
  refreshConversations: () => Promise<void>;
}) {
  const { convId } = useParams<{ convId: string }>();
  const navigate = useNavigate();

  const handleConversationCreated = useCallback((id: string) => {
    navigate(`/chat/${id}`, { replace: true });
    refreshConversations();
  }, [navigate, refreshConversations]);

  return (
    <App
      user={user}
      onLogout={() => {}}
      conversationId={convId || null}
      onConversationCreated={handleConversationCreated}
      onMessagesChanged={refreshConversations}
    />
  );
}

export default function Layout({ user, onLogout }: LayoutProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const p = await ensureUserProfile(user.uid, user.email || '', user.displayName);
      setProfile(p);
      const convs = await getUserConversations(user.uid);
      setConversations(convs);
      setLoading(false);
    };
    init();
  }, [user.uid]);

  const refreshConversations = useCallback(async () => {
    const convs = await getUserConversations(user.uid);
    setConversations(convs);
  }, [user.uid]);

  const handleNewChat = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSelectConversation = useCallback((id: string) => {
    navigate(`/chat/${id}`);
  }, [navigate]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConv(id);
    await refreshConversations();
    navigate('/');
  }, [navigate, refreshConversations]);

  if (loading || !profile) {
    return (
      <div className="h-dvh bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex">
      <Sidebar
        conversations={conversations}
        activeConvId={window.location.pathname.split('/chat/')[1] || null}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        isAdmin={profile.isAdmin}
        userEmail={user.email || ''}
        onLogout={onLogout}
      />

      <Routes>
        <Route
          path="/"
          element={
            <ChatWrapper
              user={user}
              profile={profile}
              conversations={conversations}
              refreshConversations={refreshConversations}
            />
          }
        />
        <Route
          path="/chat/:convId"
          element={
            <ChatWrapper
              user={user}
              profile={profile}
              conversations={conversations}
              refreshConversations={refreshConversations}
            />
          }
        />
        <Route
          path="/dashboard"
          element={<Dashboard profile={profile} />}
        />
        {profile.isAdmin && (
          <Route path="/admin" element={<AdminDashboard />} />
        )}
      </Routes>
    </div>
  );
}
