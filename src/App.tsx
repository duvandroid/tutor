import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Content, Part } from '@google/genai';
import {
  Mic, MicOff, Loader2, BookOpen, Send, Paperclip, X, FileText,
  Image as ImageIcon, GraduationCap, Brain, ClipboardList, Sparkles,
} from 'lucide-react';
import { AudioRecorder, AudioPlayer } from './lib/audio';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CLAUDIA_SYSTEM = `Tu nombre es Claudia y eres una tutora experta en histología. Eres amable, paciente y muy didáctica.

TU PERSONALIDAD:
- Eres cálida y motivadora, celebras los aciertos del estudiante
- Cuando el estudiante se equivoca, corriges con amabilidad y explicas por qué la respuesta correcta es diferente
- Usas analogías cotidianas y ejemplos super prácticos para ayudar a memorizar conceptos
- Das tips y trucos mnemotécnicos cuando sea posible

TU ROL:
- Analizas imágenes histológicas y PDFs de estudio que el estudiante te comparta
- Identificas estructuras, tejidos, células y características en las imágenes
- Haces preguntas para evaluar el conocimiento del estudiante
- Recomiendas enfocarse en temas que el estudiante aún no domina
- Creas preguntas tipo examen (opción múltiple, verdadero/falso, identificación) cuando te lo pidan
- Evalúas las respuestas del estudiante de forma constructiva

FORMATO DE RESPUESTA:
- Usa español siempre
- Sé concisa pero completa
- Usa emojis con moderación para hacer la conversación más amigable
- Cuando analices una imagen, describe lo que ves y pregunta al estudiante qué puede identificar
- Cuando crees preguntas de examen, presenta las opciones claramente numeradas

TEMAS QUE DOMINAS:
- Tejido epitelial (tipos, clasificación, características)
- Tejido conectivo (componentes, tipos, funciones)
- Tejido muscular (liso, estriado, cardíaco)
- Tejido nervioso (neuronas, glía, sinapsis)
- Glándulas (exocrinas, endocrinas, mixtas)
- Técnicas histológicas (tinciones, fijación, cortes)
- Cualquier otro tema de histología`;

type Message = {
  role: 'user' | 'model';
  text: string;
  files?: { name: string; type: string; preview?: string }[];
};

type Mode = 'study' | 'exam' | 'review';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('study');
  const [isDragging, setIsDragging] = useState(false);

  // Audio state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const sessionRef = useRef<any>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<Content[]>([]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => disconnect();
  }, []);

  const getModePrompt = (m: Mode) => {
    switch (m) {
      case 'exam':
        return '\n\n[MODO EXAMEN ACTIVO] El estudiante quiere practicar con preguntas tipo examen. Genera preguntas de opción múltiple, verdadero/falso o identificación. Evalúa sus respuestas y dale retroalimentación detallada. Lleva un conteo mental de aciertos y errores.';
      case 'review':
        return '\n\n[MODO REPASO ACTIVO] El estudiante quiere repasar. Haz un resumen de los temas tratados, identifica los puntos débiles basándote en la conversación, y recomienda en qué enfocarse. Da tips de memorización.';
      default:
        return '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (validFiles.length === 0) {
      setError('Solo se aceptan imágenes (PNG, JPG, etc.) y archivos PDF.');
      return;
    }
    setAttachedFiles((prev) => [...prev, ...validFiles]);
    validFiles.forEach((f) => {
      if (f.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => setFilePreviews((prev) => [...prev, reader.result as string]);
        reader.readAsDataURL(f);
      } else {
        setFilePreviews((prev) => [...prev, '']);
      }
    });
  }, []);

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && attachedFiles.length === 0) return;

    setError(null);
    const userMsg: Message = {
      role: 'user',
      text: text || (attachedFiles.length > 0 ? 'Analiza este archivo' : ''),
      files: attachedFiles.map((f, i) => ({
        name: f.name,
        type: f.type,
        preview: filePreviews[i] || undefined,
      })),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const parts: Part[] = [];

      for (const file of attachedFiles) {
        const base64 = await fileToBase64(file);
        parts.push({
          inlineData: { mimeType: file.type, data: base64 },
        });
      }

      if (text) {
        parts.push({ text });
      } else if (attachedFiles.length > 0) {
        parts.push({ text: 'Analiza este archivo y ayúdame a estudiar su contenido.' });
      }

      historyRef.current.push({ role: 'user', parts });

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: historyRef.current,
        config: {
          systemInstruction: CLAUDIA_SYSTEM + getModePrompt(mode),
        },
      });

      const responseText = result.text ?? 'No pude generar una respuesta.';

      historyRef.current.push({
        role: 'model',
        parts: [{ text: responseText }],
      });

      setMessages((prev) => [...prev, { role: 'model', text: responseText }]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar tu mensaje.');
    } finally {
      setIsLoading(false);
      setAttachedFiles([]);
      setFilePreviews([]);
    }
  };

  // Audio functions
  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      playerRef.current = new AudioPlayer();
      playerRef.current.init();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            recorderRef.current = new AudioRecorder((base64Data) => {
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
                });
              });
            });
            recorderRef.current.start();
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && playerRef.current) {
              playerRef.current.play(base64Audio);
            }
            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.clearQueue();
            }
          },
          onclose: () => disconnect(),
          onerror: (err) => {
            console.error('Live API Error:', err);
            setError('Error de conexión de audio.');
            disconnect();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          },
          systemInstruction: CLAUDIA_SYSTEM + getModePrompt(mode),
        },
      });
      sessionRef.current = sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo conectar el audio.');
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => s.close());
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (msg: Message, i: number) => {
    const isUser = msg.role === 'user';
    return (
      <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-rose-600 text-white rounded-br-md'
              : 'bg-white border border-stone-200 text-stone-800 rounded-bl-md shadow-sm'
          }`}
        >
          {!isUser && (
            <p className="text-xs font-semibold text-rose-500 mb-1">Claudia</p>
          )}
          {msg.files && msg.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {msg.files.map((f, fi) => (
                <div key={fi} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${isUser ? 'bg-rose-500/40' : 'bg-stone-100'}`}>
                  {f.type.startsWith('image/') ? (
                    f.preview ? (
                      <img src={f.preview} alt={f.name} className="w-16 h-16 object-cover rounded" />
                    ) : (
                      <ImageIcon className="w-3 h-3" />
                    )
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  <span className="truncate max-w-[120px]">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</div>
        </div>
      </div>
    );
  };

  const modeConfig = {
    study: { icon: BookOpen, label: 'Estudiar', active: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300' },
    exam: { icon: ClipboardList, label: 'Examen', active: 'bg-violet-100 text-violet-700 ring-1 ring-violet-300' },
    review: { icon: Brain, label: 'Repasar', active: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' },
  };

  return (
    <div
      className="h-dvh bg-stone-100 flex flex-col font-sans text-stone-900"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">Claudia</h1>
          <p className="text-xs text-stone-400 truncate">Tu tutora de histología</p>
        </div>
        {/* Audio button */}
        <button
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            isConnected
              ? 'bg-rose-600 shadow-[0_0_16px_rgba(225,29,72,0.4)]'
              : isConnecting
                ? 'bg-stone-300'
                : 'bg-stone-800 hover:bg-stone-700'
          }`}
          title={isConnected ? 'Detener audio' : 'Hablar con Claudia'}
        >
          {isConnecting ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : isConnected ? (
            <Mic className="w-5 h-5 text-white animate-pulse" />
          ) : (
            <MicOff className="w-5 h-5 text-white" />
          )}
        </button>
      </header>

      {/* Mode tabs */}
      <div className="bg-white border-b border-stone-200 px-4 py-2 flex gap-2 shrink-0">
        {(Object.keys(modeConfig) as Mode[]).map((m) => {
          const cfg = modeConfig[m];
          const Icon = cfg.icon;
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                active ? cfg.active : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-rose-600/10 border-4 border-dashed border-rose-400 z-50 flex items-center justify-center rounded-2xl">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-xl text-center">
            <Paperclip className="w-10 h-10 text-rose-500 mx-auto mb-2" />
            <p className="text-lg font-semibold text-stone-800">Suelta tus archivos aquí</p>
            <p className="text-sm text-stone-400">PDF o imágenes</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-rose-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">¡Hola! Soy Claudia 👋</h2>
            <p className="text-stone-500 text-sm max-w-sm mb-6">
              Tu tutora personal de histología. Puedes enviarme imágenes histológicas o PDFs
              de tus apuntes y te ayudaré a estudiar, repasar o practicar para tu examen.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
              {[
                '📷 Sube una imagen histológica para identificar tejidos',
                '📄 Comparte tu PDF de apuntes para repasar',
                '📝 Pídeme preguntas tipo examen',
                '🎤 Habla conmigo en tiempo real',
              ].map((tip, i) => (
                <div key={i} className="bg-white rounded-xl p-3 text-xs text-stone-600 border border-stone-200 text-left">
                  {tip}
                </div>
              ))}
            </div>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold text-rose-500 mb-1">Claudia</p>
              <div className="flex items-center gap-2 text-sm text-stone-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analizando...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Audio status bar */}
      {isConnected && (
        <div className="mx-4 mb-2 bg-rose-50 text-rose-600 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <Mic className="w-4 h-4 animate-pulse" />
          <span className="font-medium">Audio activo — Claudia te está escuchando...</span>
          <button onClick={disconnect} className="ml-auto text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-2">
          {attachedFiles.map((f, i) => (
            <div key={i} className="relative group bg-white border border-stone-200 rounded-xl p-2 flex items-center gap-2">
              {f.type.startsWith('image/') && filePreviews[i] ? (
                <img src={filePreviews[i]} alt={f.name} className="w-12 h-12 object-cover rounded-lg" />
              ) : (
                <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-stone-400" />
                </div>
              )}
              <span className="text-xs text-stone-600 max-w-[100px] truncate">{f.name}</span>
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-stone-800 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-stone-200 px-4 py-3 shrink-0">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center shrink-0 transition-colors"
            title="Adjuntar archivo"
          >
            <Paperclip className="w-5 h-5 text-stone-500" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'exam'
                ? 'Pide preguntas o responde aquí...'
                : mode === 'review'
                  ? 'Pide un repaso o haz preguntas...'
                  : 'Escribe tu pregunta o sube un archivo...'
            }
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent max-h-32"
            style={{ minHeight: '42px' }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 flex items-center justify-center shrink-0 transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
