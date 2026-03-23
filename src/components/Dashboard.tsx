import { useState, useEffect } from 'react';
import {
  MessageSquare, Brain, Phone, ClipboardList,
  TrendingUp, Calendar, Loader2,
} from 'lucide-react';
import type { UserProfile, Conversation } from '../lib/firestore';
import { getUserConversations } from '../lib/firestore';

type DashboardProps = {
  profile: UserProfile;
};

export default function Dashboard({ profile }: DashboardProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserConversations(profile.uid).then((convs) => {
      setConversations(convs);
      setLoading(false);
    });
  }, [profile.uid]);

  const stats = [
    {
      label: 'Sesiones totales',
      value: profile.totalSessions,
      icon: MessageSquare,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Mensajes enviados',
      value: profile.totalMessages,
      icon: Brain,
      color: 'bg-violet-100 text-violet-600',
    },
    {
      label: 'Quizzes realizados',
      value: profile.totalQuizzes,
      icon: ClipboardList,
      color: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Llamadas de audio',
      value: profile.totalAudioCalls,
      icon: Phone,
      color: 'bg-rose-100 text-rose-600',
    },
  ];

  const formatDate = (ts: any) => {
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleDateString('es', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-stone-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900">Mi Panel</h1>
          <p className="text-sm text-stone-500 mt-1">
            {profile.email} · Miembro desde {formatDate(profile.createdAt)}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                <s.icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-stone-900">{s.value}</p>
              <p className="text-xs text-stone-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Activity summary */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-rose-500" />
            <h2 className="font-bold text-stone-900">Resumen de actividad</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-stone-500">Último acceso</p>
              <p className="text-sm font-medium">{formatDate(profile.lastLoginAt)}</p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Promedio mensajes/sesión</p>
              <p className="text-sm font-medium">
                {profile.totalSessions > 0
                  ? Math.round(profile.totalMessages / profile.totalSessions)
                  : 0}
              </p>
            </div>
          </div>
        </div>

        {/* Conversation history */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-rose-500" />
            <h2 className="font-bold text-stone-900">Historial de sesiones</h2>
            <span className="text-xs text-stone-400 ml-auto">{conversations.length} sesiones</span>
          </div>
          {conversations.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">
              No tienes sesiones registradas aún. Inicia una conversación con Claudia.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-stone-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{conv.title}</p>
                    <p className="text-[10px] text-stone-400">
                      {conv.topic && <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full mr-1">{conv.topic}</span>}
                      {conv.messageCount} mensajes · {formatDate(conv.updatedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
