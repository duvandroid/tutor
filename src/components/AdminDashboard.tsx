import { useState, useEffect } from 'react';
import {
  Users, MessageSquare, Brain, Phone, ClipboardList,
  Shield, Loader2, ChevronDown, ChevronUp, Search,
  Eye, X, ArrowLeft, FileText, Image as ImageIcon,
} from 'lucide-react';
import Markdown from 'react-markdown';
import {
  getAllUsers, getConversationsForUser, getConversationMessages,
  type UserProfile, type Conversation, type StoredMessage,
} from '../lib/firestore';

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userConvs, setUserConvs] = useState<Record<string, Conversation[]>>({});
  const [search, setSearch] = useState('');

  // Message viewer state
  const [viewingConv, setViewingConv] = useState<{ conv: Conversation; userEmail: string } | null>(null);
  const [viewingMessages, setViewingMessages] = useState<StoredMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    getAllUsers().then((u) => {
      setUsers(u);
      setLoading(false);
    });
  }, []);

  const toggleUser = async (uid: string) => {
    if (expandedUser === uid) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(uid);
    if (!userConvs[uid]) {
      const convs = await getConversationsForUser(uid);
      setUserConvs((prev) => ({ ...prev, [uid]: convs }));
    }
  };

  const openConversation = async (conv: Conversation, userEmail: string) => {
    setViewingConv({ conv, userEmail });
    setLoadingMessages(true);
    const msgs = await getConversationMessages(conv.id);
    setViewingMessages(msgs);
    setLoadingMessages(false);
  };

  const closeConversation = () => {
    setViewingConv(null);
    setViewingMessages([]);
  };

  const formatDate = (ts: any) => {
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()),
  );

  // Aggregated stats
  const totalMessages = users.reduce((s, u) => s + (u.totalMessages || 0), 0);
  const totalSessions = users.reduce((s, u) => s + (u.totalSessions || 0), 0);
  const totalQuizzes = users.reduce((s, u) => s + (u.totalQuizzes || 0), 0);
  const totalAudioCalls = users.reduce((s, u) => s + (u.totalAudioCalls || 0), 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  // === MESSAGE VIEWER ===
  if (viewingConv) {
    return (
      <div className="flex-1 overflow-y-auto bg-stone-100">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Back header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={closeConversation}
              className="w-10 h-10 bg-white border border-stone-200 rounded-xl flex items-center justify-center hover:bg-stone-50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-stone-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-stone-900 truncate">{viewingConv.conv.title}</h2>
              <p className="text-xs text-stone-500">
                {viewingConv.userEmail}
                {viewingConv.conv.topic && <span> · {viewingConv.conv.topic}</span>}
                {' · '}{viewingConv.conv.messageCount} mensajes
                {' · '}{formatDate(viewingConv.conv.createdAt)}
              </p>
            </div>
          </div>

          {/* Messages */}
          {loadingMessages ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
            </div>
          ) : viewingMessages.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-16">Sin mensajes en esta conversación</p>
          ) : (
            <div className="space-y-3">
              {viewingMessages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id || i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                        isUser
                          ? 'bg-white border border-stone-200 text-stone-800 rounded-br-md shadow-sm'
                          : 'bg-white border border-stone-200 text-stone-800 rounded-bl-md shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`text-[10px] font-semibold ${isUser ? 'text-blue-500' : 'text-rose-500'}`}>
                          {isUser ? 'Estudiante' : 'Claudia'}
                        </p>
                        <p className="text-[10px] text-stone-300">{formatDate(msg.createdAt)}</p>
                      </div>

                      {/* File attachments */}
                      {msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.files.map((f, fi) => (
                            <div key={fi} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-stone-100">
                              {f.type.startsWith('image/') ? (
                                <ImageIcon className="w-3 h-3 text-stone-400" />
                              ) : (
                                <FileText className="w-3 h-3 text-stone-400" />
                              )}
                              <span className="truncate max-w-[100px]">{f.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quiz */}
                      {msg.quiz && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mb-2">
                          <p className="text-xs font-bold text-violet-700 mb-1">
                            Quiz: {msg.quiz.title}
                          </p>
                          <p className="text-[10px] text-violet-500">
                            {msg.quiz.questions?.length || 0} preguntas
                          </p>
                          <div className="mt-2 space-y-2">
                            {msg.quiz.questions?.map((q: any, qi: number) => (
                              <div key={qi} className="text-[11px]">
                                <p className="font-medium text-stone-700">{qi + 1}. {q.question}</p>
                                <div className="ml-3 mt-0.5 space-y-0.5">
                                  {q.options?.map((opt: string, oi: number) => (
                                    <p key={oi} className={oi === q.correct ? 'text-emerald-600 font-semibold' : 'text-stone-400'}>
                                      {String.fromCharCode(65 + oi)}. {opt} {oi === q.correct ? ' ✓' : ''}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Text */}
                      {msg.text && (
                        <div className="text-sm leading-relaxed prose prose-sm prose-stone max-w-none prose-p:my-1 prose-li:my-0.5">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === MAIN ADMIN VIEW ===
  return (
    <div className="flex-1 overflow-y-auto bg-stone-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Panel de Administración</h1>
            <p className="text-sm text-stone-500">Consumo de todos los usuarios</p>
          </div>
        </div>

        {/* Global stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <Users className="w-5 h-5 text-blue-500 mb-2" />
            <p className="text-2xl font-black">{users.length}</p>
            <p className="text-xs text-stone-500">Usuarios</p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <MessageSquare className="w-5 h-5 text-emerald-500 mb-2" />
            <p className="text-2xl font-black">{totalSessions}</p>
            <p className="text-xs text-stone-500">Sesiones</p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <Brain className="w-5 h-5 text-violet-500 mb-2" />
            <p className="text-2xl font-black">{totalMessages}</p>
            <p className="text-xs text-stone-500">Mensajes</p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <ClipboardList className="w-5 h-5 text-amber-500 mb-2" />
            <p className="text-2xl font-black">{totalQuizzes}</p>
            <p className="text-xs text-stone-500">Quizzes</p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <Phone className="w-5 h-5 text-rose-500 mb-2" />
            <p className="text-2xl font-black">{totalAudioCalls}</p>
            <p className="text-xs text-stone-500">Llamadas</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuario por email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="hidden lg:grid grid-cols-7 gap-2 px-4 py-3 bg-stone-50 border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
            <div className="col-span-2">Usuario</div>
            <div>Sesiones</div>
            <div>Mensajes</div>
            <div>Quizzes</div>
            <div>Llamadas</div>
            <div>Último acceso</div>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No se encontraron usuarios</p>
          ) : (
            filteredUsers.map((u) => (
              <div key={u.uid}>
                <button
                  onClick={() => toggleUser(u.uid)}
                  className="w-full grid grid-cols-2 lg:grid-cols-7 gap-2 px-4 py-3 text-left hover:bg-stone-50 transition-colors border-b border-stone-100 items-center"
                >
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center text-xs font-bold text-stone-600 shrink-0">
                      {u.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.email}</p>
                      <p className="text-[10px] text-stone-400 lg:hidden">
                        {u.totalSessions} ses · {u.totalMessages} msg · {u.totalQuizzes} quiz
                      </p>
                    </div>
                    {expandedUser === u.uid
                      ? <ChevronUp className="w-4 h-4 text-stone-400 ml-auto lg:hidden" />
                      : <ChevronDown className="w-4 h-4 text-stone-400 ml-auto lg:hidden" />}
                  </div>
                  <div className="hidden lg:block text-sm">{u.totalSessions}</div>
                  <div className="hidden lg:block text-sm">{u.totalMessages}</div>
                  <div className="hidden lg:block text-sm">{u.totalQuizzes}</div>
                  <div className="hidden lg:block text-sm">{u.totalAudioCalls}</div>
                  <div className="hidden lg:block text-xs text-stone-500">{formatDate(u.lastLoginAt)}</div>
                </button>

                {/* Expanded: user conversations */}
                {expandedUser === u.uid && (
                  <div className="bg-stone-50 px-4 py-3 border-b border-stone-200">
                    <p className="text-xs font-semibold text-stone-500 mb-2">
                      Sesiones de {u.email}
                    </p>
                    {!userConvs[u.uid] ? (
                      <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                    ) : userConvs[u.uid].length === 0 ? (
                      <p className="text-xs text-stone-400">Sin sesiones</p>
                    ) : (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {userConvs[u.uid].map((conv) => (
                          <div
                            key={conv.id}
                            className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-lg hover:bg-rose-50 transition-colors cursor-pointer group"
                            onClick={() => openConversation(conv, u.email)}
                          >
                            <MessageSquare className="w-3 h-3 text-stone-400 shrink-0" />
                            <span className="text-xs flex-1 truncate">{conv.title}</span>
                            {conv.topic && (
                              <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">{conv.topic}</span>
                            )}
                            <span className="text-[10px] text-stone-400">{conv.messageCount} msg</span>
                            <span className="text-[10px] text-stone-400">{formatDate(conv.updatedAt)}</span>
                            <Eye className="w-3.5 h-3.5 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
