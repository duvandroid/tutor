import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageSquare, Plus, Trash2, BarChart3, Shield, X, Menu,
  GraduationCap, LogOut,
} from 'lucide-react';
import type { Conversation } from '../lib/firestore';

type SidebarProps = {
  conversations: Conversation[];
  activeConvId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  isAdmin: boolean;
  userEmail: string;
  onLogout: () => void;
};

export default function Sidebar({
  conversations,
  activeConvId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  isAdmin,
  userEmail,
  onLogout,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const formatDate = (ts: any) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
      return d.toLocaleDateString('es', { weekday: 'short' });
    }
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-stone-900 text-white w-72">
      {/* Header */}
      <div className="p-4 border-b border-stone-700 flex items-center gap-3">
        <div className="w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center">
          <GraduationCap className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-sm">Claudia</span>
        <button onClick={() => setOpen(false)} className="ml-auto lg:hidden">
          <X className="w-5 h-5 text-stone-400" />
        </button>
      </div>

      {/* New chat button */}
      <div className="p-3">
        <button
          onClick={() => { onNewChat(); setOpen(false); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva conversación
        </button>
      </div>

      {/* Nav links */}
      <div className="px-3 space-y-1">
        <button
          onClick={() => handleNav('/dashboard')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            location.pathname === '/dashboard'
              ? 'bg-stone-700 text-white'
              : 'text-stone-400 hover:bg-stone-800 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Mi panel
        </button>
        {isAdmin && (
          <button
            onClick={() => handleNav('/admin')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              location.pathname === '/admin'
                ? 'bg-stone-700 text-white'
                : 'text-stone-400 hover:bg-stone-800 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            Admin
          </button>
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold px-2 mb-2">
          Historial
        </p>
        {conversations.length === 0 ? (
          <p className="text-xs text-stone-500 px-2">Sin conversaciones aún</p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeConvId === conv.id
                    ? 'bg-stone-700'
                    : 'hover:bg-stone-800'
                }`}
                onClick={() => { onSelectConversation(conv.id); setOpen(false); }}
              >
                <MessageSquare className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{conv.title}</p>
                  <p className="text-[10px] text-stone-500">
                    {conv.topic && <span>{conv.topic} · </span>}
                    {formatDate(conv.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-600 rounded transition-all"
                >
                  <Trash2 className="w-3 h-3 text-stone-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User footer */}
      <div className="p-3 border-t border-stone-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-stone-700 rounded-full flex items-center justify-center text-xs font-bold">
            {userEmail?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{userEmail}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 hover:bg-stone-700 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 text-stone-400" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 w-10 h-10 bg-white border border-stone-200 rounded-full flex items-center justify-center shadow-sm"
      >
        <Menu className="w-5 h-5 text-stone-600" />
      </button>

      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        {sidebar}
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="shrink-0">{sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
