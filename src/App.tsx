import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Content, Part, Type } from '@google/genai';
import {
  Phone, PhoneOff, Loader2, Send, Paperclip, X, FileText,
  Image as ImageIcon, GraduationCap, ClipboardList, Sparkles,
  Settings, Check, CircleCheck, CircleX, Circle, Trophy, Target,
  ChevronDown, ChevronUp, LogOut,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { AudioRecorder, AudioPlayer } from './lib/audio';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// === LIMITS ===
const MAX_INPUT_CHARS = 2000;         // Max characters per text message
const MAX_FILES_PER_MESSAGE = 3;      // Max files attached at once
const MAX_FILE_SIZE_MB = 10;          // Max size per file in MB
const MAX_HISTORY_TURNS = 20;         // Max conversation turns sent to Gemini (keeps last N)
const LIVE_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // Auto-disconnect live after 5 min
const MAX_MESSAGES_PER_SESSION = 30;  // Max text messages per session (user messages only)

const SUPPORTED_TYPES = [
  'image/*',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/json',
  'application/xml',
  'audio/*',
  'video/*',
].join(',');

const isFileSupported = (file: File) => {
  const t = file.type;
  return (
    t.startsWith('image/') ||
    t.startsWith('audio/') ||
    t.startsWith('video/') ||
    t === 'application/pdf' ||
    t === 'text/plain' ||
    t === 'text/csv' ||
    t === 'text/html' ||
    t === 'text/markdown' ||
    t.includes('wordprocessingml') ||
    t.includes('spreadsheetml') ||
    t.includes('presentationml') ||
    t === 'application/msword' ||
    t === 'application/vnd.ms-excel' ||
    t === 'application/vnd.ms-powerpoint' ||
    t === 'application/json' ||
    t === 'application/xml'
  );
};

const buildSystemPrompt = (topic: string) => `Tu nombre es Claudia y eres una tutora experta. Eres amable, paciente y muy didáctica.

MATERIA ACTUAL DEL ESTUDIANTE: ${topic || 'No definida aún — pregunta al estudiante qué materia está estudiando y en qué semestre está para adaptar el nivel de las explicaciones y preguntas.'}

TU PERSONALIDAD:
- Eres cálida y motivadora, celebras los aciertos del estudiante
- Cuando el estudiante se equivoca, corriges con amabilidad y explicas por qué la respuesta correcta es diferente
- Usas analogías cotidianas y ejemplos super prácticos para ayudar a memorizar conceptos
- Das tips y trucos mnemotécnicos cuando sea posible

TU ROL:
- Analizas cualquier documento que el estudiante te comparta (imágenes, PDFs, Word, Excel, PowerPoint, texto, audio, video, etc.)
- Extraes el contenido relevante de los documentos y lo usas para enseñar
- Haces preguntas para evaluar el conocimiento del estudiante
- Recomiendas enfocarse en temas que el estudiante aún no domina
- Evalúas las respuestas del estudiante de forma constructiva
- Te adaptas al nivel y ritmo del estudiante

FORMATO DE RESPUESTA:
- Usa español siempre
- Sé concisa pero completa
- Usa emojis con moderación para hacer la conversación más amigable
- Responde en formato Markdown
- Cuando analices un documento, resume su contenido y pregunta al estudiante qué quiere estudiar de ahí
- Si el estudiante habla de un tema fuera de "${topic}", igual ayúdale — eres flexible
- Si aún no sabes el semestre del estudiante, pregúntale en qué semestre está para adaptar la dificultad de tus explicaciones y preguntas
- Adapta el nivel de complejidad según el semestre: primeros semestres = conceptos fundamentales, semestres avanzados = detalles clínicos y aplicaciones`;

const QUIZ_SYSTEM_PROMPT = (topic: string) => `Eres Claudia, una tutora experta en ${topic}. El estudiante te ha pedido un quiz/test/examen. Genera un quiz interactivo basándote en el contexto de la conversación y los materiales compartidos.

REGLAS:
- Genera entre 5 y 10 preguntas variadas con diferentes niveles de dificultad
- Cada pregunta debe tener exactamente 4 opciones
- "correct" es el índice (0-3) de la respuesta correcta
- "explanations" debe tener una explicación para CADA opción explicando por qué es correcta o incorrecta
- El título debe reflejar el tema del quiz
- Las preguntas deben ser en español`;

const QUIZ_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Título del quiz' },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: 'La pregunta' },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '4 opciones de respuesta',
          },
          correct: { type: Type.NUMBER, description: 'Índice (0-3) de la respuesta correcta' },
          explanations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Explicación para cada opción de por qué es correcta o incorrecta',
          },
        },
        required: ['question', 'options', 'correct', 'explanations'],
      },
    },
  },
  required: ['title', 'questions'],
};

const QUIZ_KEYWORDS = /\b(quiz|test|examen|evalua|evalúa|pregunt|cuestion|prueba|genera.*(pregunt|test|quiz|examen))\b/i;

const SUGGESTED_TOPICS = [
  'Histología', 'Anatomía', 'Fisiología', 'Bioquímica', 'Farmacología',
  'Patología', 'Microbiología', 'Inmunología', 'Embriología', 'Genética',
  'Biología celular', 'Matemáticas', 'Física', 'Química', 'Derecho',
  'Economía', 'Psicología', 'Filosofía', 'Historia', 'Programación',
];

type QuizQuestion = {
  question: string;
  options: string[];
  correct: number;
  explanations: string[];
};

type Quiz = {
  title: string;
  questions: QuizQuestion[];
};

type Message = {
  role: 'user' | 'model';
  text: string;
  files?: { name: string; type: string; preview?: string }[];
  quiz?: Quiz;
};

type AppProps = {
  user: { email: string | null; displayName: string | null };
  onLogout: () => void;
};

export default function App({ user, onLogout }: AppProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [topic, setTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [showTopicPicker, setShowTopicPicker] = useState(false);

  // Audio state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveSecondsLeft, setLiveSecondsLeft] = useState(0);
  const liveCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [messagesSent, setMessagesSent] = useState(0);
  const sessionRef = useRef<any>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const liveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<Content[]>([]);

  const [quizAnswers, setQuizAnswers] = useState<Record<string, Record<number, number>>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => disconnect();
  }, []);

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
    const arr = Array.from(files);
    const valid = arr.filter(isFileSupported);
    const rejected = arr.length - valid.length;
    if (rejected > 0 && valid.length === 0) {
      setError('Formato de archivo no soportado. Intenta con imágenes, PDF, Word, Excel, PowerPoint, texto, audio o video.');
      return;
    }
    if (rejected > 0) {
      setError(`${rejected} archivo(s) no soportado(s) fueron ignorados.`);
    }
    // Check file size limit
    const tooBig = valid.filter((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (tooBig.length > 0) {
      setError(`Archivo(s) demasiado grande(s) (máx ${MAX_FILE_SIZE_MB}MB): ${tooBig.map((f) => f.name).join(', ')}`);
      const withinSize = valid.filter((f) => f.size <= MAX_FILE_SIZE_MB * 1024 * 1024);
      if (withinSize.length === 0) return;
    }
    const withinSize = valid.filter((f) => f.size <= MAX_FILE_SIZE_MB * 1024 * 1024);
    // Check max files limit
    setAttachedFiles((prev) => {
      const space = MAX_FILES_PER_MESSAGE - prev.length;
      if (space <= 0) {
        setError(`Máximo ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`);
        return prev;
      }
      const toAdd = withinSize.slice(0, space);
      if (toAdd.length < withinSize.length) {
        setError(`Solo se pueden adjuntar ${MAX_FILES_PER_MESSAGE} archivos. Se ignoraron los extras.`);
      }
      toAdd.forEach((f) => {
        if (f.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => setFilePreviews((prev) => [...prev, reader.result as string]);
          reader.readAsDataURL(f);
        } else {
          setFilePreviews((prev) => [...prev, '']);
        }
      });
      return [...prev, ...toAdd];
    });
  }, []);

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-3 h-3" />;
    return <FileText className="w-3 h-3" />;
  };

  const getFileIconLarge = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-6 h-6 text-stone-400" />;
    return <FileText className="w-6 h-6 text-stone-400" />;
  };

  const sendMessage = async () => {
    const text = input.trim().slice(0, MAX_INPUT_CHARS);
    if (!text && attachedFiles.length === 0) return;
    if (messagesSent >= MAX_MESSAGES_PER_SESSION) {
      setError(`Límite de ${MAX_MESSAGES_PER_SESSION} mensajes alcanzado. Recarga la página para iniciar una nueva sesión.`);
      return;
    }

    setError(null);
    setMessagesSent((prev) => prev + 1);
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

    const wantsQuiz = QUIZ_KEYWORDS.test(text);

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

      // Trim history to last N turns to control token usage
      if (historyRef.current.length > MAX_HISTORY_TURNS) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY_TURNS);
      }

      if (wantsQuiz) {
        // Use structured output for guaranteed valid quiz JSON
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: historyRef.current,
          config: {
            systemInstruction: QUIZ_SYSTEM_PROMPT(topic),
            responseMimeType: 'application/json',
            responseSchema: QUIZ_SCHEMA,
          },
        });

        const responseText = result.text ?? '{}';
        historyRef.current.push({ role: 'model', parts: [{ text: responseText }] });

        try {
          const quiz = JSON.parse(responseText) as Quiz;
          setMessages((prev) => [...prev, { role: 'model', text: '', quiz }]);
        } catch {
          setMessages((prev) => [...prev, { role: 'model', text: 'No pude generar el quiz. Inténtalo de nuevo.' }]);
        }
      } else {
        // Normal text response
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: historyRef.current,
          config: {
            systemInstruction: buildSystemPrompt(topic),
          },
        });

        const responseText = result.text ?? 'No pude generar una respuesta.';
        historyRef.current.push({ role: 'model', parts: [{ text: responseText }] });
        setMessages((prev) => [...prev, { role: 'model', text: responseText }]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar tu mensaje.');
    } finally {
      setIsLoading(false);
      setAttachedFiles([]);
      setFilePreviews([]);
    }
  };

  // Build conversation context summary for the Live API
  const buildConversationContext = () => {
    if (messages.length === 0) return '';

    const lines: string[] = ['\n\nCONTEXTO DE LA CONVERSACIÓN PREVIA (usa esto como referencia):'];

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'Estudiante' : 'Claudia';

      if (msg.files && msg.files.length > 0) {
        const fileNames = msg.files.map((f) => f.name).join(', ');
        lines.push(`[${role} compartió archivos: ${fileNames}]`);
      }

      if (msg.quiz) {
        const key = `q${messages.indexOf(msg)}`;
        const answers = quizAnswers[key] || {};
        const submitted = quizSubmitted[key] || false;
        lines.push(`[${role} generó quiz: "${msg.quiz.title}" — ${msg.quiz.questions.length} preguntas]`);

        if (submitted) {
          const total = msg.quiz.questions.length;
          const correct = msg.quiz.questions.filter((q, i) => answers[i] === q.correct).length;
          lines.push(`[Resultado del quiz: ${correct}/${total}]`);
          msg.quiz.questions.forEach((q, i) => {
            const picked = answers[i];
            const ok = picked === q.correct;
            if (!ok) {
              lines.push(`  - FALLÓ: "${q.question}" — respondió "${q.options[picked]}", la correcta era "${q.options[q.correct]}"`);
            }
          });
        }
      } else if (msg.text) {
        const truncated = msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text;
        lines.push(`${role}: ${truncated}`);
      }
    }

    // Add document summaries from history (text parts only)
    const docParts: string[] = [];
    for (const entry of historyRef.current) {
      for (const part of entry.parts ?? []) {
        if ('text' in part && part.text && part.text.length > 500) {
          docParts.push(part.text.slice(0, 800) + '...');
        }
      }
    }
    if (docParts.length > 0) {
      lines.push('\nRESUMEN DE DOCUMENTOS COMPARTIDOS:');
      docParts.forEach((d, i) => lines.push(`Documento ${i + 1}: ${d}`));
    }

    lines.push('\nIMPORTANTE: Usa este contexto para continuar la conversación. Si el estudiante falló preguntas, enfócate en esos temas. Si compartió documentos, haz referencia a su contenido.');

    return lines.join('\n');
  };

  // Audio — single-session guard
  const liveStateRef = useRef<'idle' | 'connecting' | 'connected' | 'disconnecting'>('idle');

  const cleanupLive = () => {
    if (liveTimeoutRef.current) { clearTimeout(liveTimeoutRef.current); liveTimeoutRef.current = null; }
    if (liveCountdownRef.current) { clearInterval(liveCountdownRef.current); liveCountdownRef.current = null; }
    setLiveSecondsLeft(0);
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
  };

  const disconnect = useCallback(() => {
    if (liveStateRef.current === 'idle' || liveStateRef.current === 'disconnecting') return;
    liveStateRef.current = 'disconnecting';

    cleanupLive();

    const pending = sessionRef.current;
    sessionRef.current = null;
    if (pending) {
      pending.then((s: any) => { try { s.close(); } catch {} }).catch(() => {});
    }

    liveStateRef.current = 'idle';
  }, []);

  const connect = async () => {
    // Only allow connect from idle state
    if (liveStateRef.current !== 'idle') return;
    liveStateRef.current = 'connecting';

    setIsConnecting(true);
    setError(null);
    try {
      const player = new AudioPlayer();
      player.init();
      playerRef.current = player;

      const contextSummary = buildConversationContext();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            // Guard: if we disconnected while connecting, abort
            if (liveStateRef.current !== 'connecting') return;
            liveStateRef.current = 'connected';

            setIsConnected(true);
            setIsConnecting(false);

            // Auto-disconnect countdown
            setLiveSecondsLeft(Math.floor(LIVE_SESSION_TIMEOUT_MS / 1000));
            liveCountdownRef.current = setInterval(() => {
              setLiveSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
            }, 1000);
            liveTimeoutRef.current = setTimeout(() => disconnect(), LIVE_SESSION_TIMEOUT_MS);

            recorderRef.current = new AudioRecorder((base64Data) => {
              if (liveStateRef.current !== 'connected') return;
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
                });
              });
            });
            recorderRef.current.start();
          },
          onmessage: (message: LiveServerMessage) => {
            if (liveStateRef.current !== 'connected') return;
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && playerRef.current) playerRef.current.play(audio);
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
          systemInstruction: buildSystemPrompt(topic) + contextSummary,
        },
      });
      sessionRef.current = sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo conectar el audio.');
      cleanupLive();
      liveStateRef.current = 'idle';
    }
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

  const selectTopic = (t: string) => {
    setTopic(t);
    setShowTopicPicker(false);
    setCustomTopic('');
  };

  const handleCustomTopic = () => {
    const t = customTopic.trim();
    if (t) {
      setTopic(t);
      setShowTopicPicker(false);
      setCustomTopic('');
    }
  };

  const renderMessage = (msg: Message, i: number) => {
    const isUser = msg.role === 'user';
    return (
      <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            msg.quiz ? 'max-w-[95%] sm:max-w-[90%]' : 'max-w-[85%]'
          } ${
            isUser
              ? 'bg-white border border-stone-200 text-stone-800 rounded-br-md shadow-sm'
              : 'bg-white border border-stone-200 text-stone-800 rounded-bl-md shadow-sm'
          }`}
        >
          {!isUser && (
            <p className="text-xs font-semibold text-rose-500 mb-1">Claudia</p>
          )}
          {msg.files && msg.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {msg.files.map((f, fi) => (
                <div key={fi} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-stone-100">
                  {f.type.startsWith('image/') && f.preview ? (
                    <img src={f.preview} alt={f.name} className="w-16 h-16 object-cover rounded" />
                  ) : (
                    getFileIcon(f.type)
                  )}
                  <span className="truncate max-w-[120px]">{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {msg.quiz ? renderQuiz(msg.quiz, i) : (
            <div className="text-sm leading-relaxed prose prose-sm prose-stone max-w-none prose-p:my-1 prose-li:my-0.5 prose-headings:mb-1 prose-headings:mt-3 prose-hr:my-2 prose-ul:my-1 prose-ol:my-1">
              <Markdown>{msg.text}</Markdown>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Quiz logic
  const quizKey = (msgIdx: number) => `q${msgIdx}`;

  const handleQuizAnswer = (msgIdx: number, qIdx: number, optIdx: number) => {
    const key = quizKey(msgIdx);
    if (quizSubmitted[key]) return;
    setQuizAnswers((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [qIdx]: optIdx },
    }));
  };

  const submitQuiz = async (msgIdx: number, quiz: Quiz) => {
    const key = quizKey(msgIdx);
    setQuizSubmitted((prev) => ({ ...prev, [key]: true }));
    const answers = quizAnswers[key] || {};
    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q, i) => answers[i] === q.correct).length;

    // Build detailed results for Claudia
    const details = quiz.questions.map((q, i) => {
      const picked = answers[i];
      const ok = picked === q.correct;
      return `${i + 1}. ${ok ? '✓' : '✗'} "${q.question}" — respondí "${q.options[picked]}" ${ok ? '(correcto)' : `(incorrecto, la correcta era "${q.options[q.correct]}")`}`;
    }).join('\n');

    const summary = `Resultado: ${correct}/${total} en "${quiz.title}".\n\n${details}\n\nAnaliza mis resultados, felicítame por las correctas, explica las que fallé y recomiéndame en qué enfocarme.`;

    // Auto-send
    setMessages((prev) => [...prev, { role: 'user', text: `Obtuve ${correct}/${total} en el quiz.` }]);
    setIsLoading(true);
    setError(null);

    try {
      historyRef.current.push({ role: 'user', parts: [{ text: summary }] });

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: historyRef.current,
        config: { systemInstruction: buildSystemPrompt(topic) },
      });

      const responseText = result.text ?? 'No pude analizar tus resultados.';
      historyRef.current.push({ role: 'model', parts: [{ text: responseText }] });
      setMessages((prev) => [...prev, { role: 'model', text: responseText }]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al analizar resultados.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExplanation = (key: string, qi: number) => {
    const id = `${key}-${qi}`;
    setExpandedExplanations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderQuiz = (quiz: Quiz, msgIdx: number) => {
    const key = quizKey(msgIdx);
    const answers = quizAnswers[key] || {};
    const submitted = quizSubmitted[key] || false;
    const total = quiz.questions.length;
    const answered = Object.keys(answers).length;
    const correct = submitted
      ? quiz.questions.filter((q, i) => answers[i] === q.correct).length
      : 0;
    const pct = submitted ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="w-full -mx-1">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">{quiz.title}</p>
            <p className="text-[10px] text-stone-400">{total} preguntas</p>
          </div>
        </div>

        {!submitted && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
              <span>Progreso</span>
              <span className="font-semibold text-stone-600">{answered}/{total}</span>
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(answered / total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {submitted && (
          <div className={`mb-4 rounded-2xl p-4 ${
            pct >= 70 ? 'bg-emerald-50 border border-emerald-200' : pct >= 40 ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                pct >= 70 ? 'bg-emerald-100' : pct >= 40 ? 'bg-amber-100' : 'bg-red-100'
              }`}>
                {pct >= 70 ? (
                  <Trophy className="w-6 h-6 text-emerald-600" />
                ) : (
                  <Target className={`w-6 h-6 ${pct >= 40 ? 'text-amber-600' : 'text-red-600'}`} />
                )}
              </div>
              <div>
                <p className={`text-2xl font-black ${
                  pct >= 70 ? 'text-emerald-700' : pct >= 40 ? 'text-amber-700' : 'text-red-700'
                }`}>{pct}%</p>
                <p className={`text-xs font-medium ${
                  pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {correct} de {total} correctas
                  {pct >= 90 ? ' — Excelente!' : pct >= 70 ? ' — Muy bien!' : pct >= 40 ? ' — Puedes mejorar' : ' — Necesitas repasar'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {quiz.questions.map((q, qi) => {
            const userAnswer = answers[qi];
            const isAnswered = userAnswer !== undefined;
            const isCorrect = submitted && userAnswer === q.correct;
            const isWrong = submitted && isAnswered && userAnswer !== q.correct;
            const explanationExpanded = expandedExplanations[`${key}-${qi}`] || false;

            return (
              <div
                key={qi}
                className={`rounded-2xl overflow-hidden transition-all duration-300 ${
                  submitted
                    ? isCorrect
                      ? 'bg-emerald-50/50 ring-1 ring-emerald-200'
                      : isWrong
                        ? 'bg-red-50/50 ring-1 ring-red-200'
                        : 'bg-stone-50 ring-1 ring-stone-200'
                    : isAnswered
                      ? 'bg-violet-50/30 ring-1 ring-violet-200'
                      : 'bg-stone-50 ring-1 ring-stone-200'
                }`}
              >
                <div className="px-4 pt-3 pb-2 flex items-start gap-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5 ${
                    submitted
                      ? isCorrect
                        ? 'bg-emerald-500 text-white'
                        : isWrong
                          ? 'bg-red-500 text-white'
                          : 'bg-stone-300 text-white'
                      : isAnswered
                        ? 'bg-violet-500 text-white'
                        : 'bg-stone-200 text-stone-500'
                  }`}>
                    {submitted ? (isCorrect ? '✓' : isWrong ? '✗' : qi + 1) : qi + 1}
                  </span>
                  <p className="text-sm font-semibold leading-snug">{q.question}</p>
                </div>

                <div className="px-3 pb-3 space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const isSelected = userAnswer === oi;
                    const isCorrectOpt = oi === q.correct;

                    let containerClass = '';
                    let indicatorContent: React.ReactNode;

                    if (submitted) {
                      if (isCorrectOpt) {
                        containerClass = 'bg-emerald-100/80 border-emerald-300';
                        indicatorContent = <CircleCheck className="w-5 h-5 text-emerald-600" />;
                      } else if (isSelected && !isCorrectOpt) {
                        containerClass = 'bg-red-100/80 border-red-300';
                        indicatorContent = <CircleX className="w-5 h-5 text-red-500" />;
                      } else {
                        containerClass = 'bg-white/60 border-stone-200 opacity-50';
                        indicatorContent = <Circle className="w-5 h-5 text-stone-300" />;
                      }
                    } else if (isSelected) {
                      containerClass = 'bg-violet-100 border-violet-400 shadow-sm shadow-violet-100';
                      indicatorContent = (
                        <span className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                          <span className="w-2 h-2 rounded-full bg-white" />
                        </span>
                      );
                    } else {
                      containerClass = 'bg-white border-stone-200 hover:border-violet-300 hover:bg-violet-50/30 cursor-pointer active:scale-[0.98]';
                      indicatorContent = <span className="w-5 h-5 rounded-full border-2 border-stone-300" />;
                    }

                    return (
                      <button
                        key={oi}
                        onClick={() => handleQuizAnswer(msgIdx, qi, oi)}
                        disabled={submitted}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 ${containerClass}`}
                      >
                        <span className="shrink-0">{indicatorContent}</span>
                        <span className="text-xs leading-snug flex-1">{opt}</span>
                        <span className={`text-[10px] font-bold shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${
                          isSelected && !submitted ? 'bg-violet-200 text-violet-700' : 'bg-stone-100 text-stone-400'
                        }`}>
                          {String.fromCharCode(65 + oi)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {submitted && q.explanations && (
                  <div className="border-t border-stone-200/60">
                    <button
                      onClick={() => toggleExplanation(key, qi)}
                      className="w-full flex items-center justify-center gap-1 py-2 text-[10px] font-semibold text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      {explanationExpanded ? (
                        <>Ocultar explicaciones <ChevronUp className="w-3 h-3" /></>
                      ) : (
                        <>Ver explicaciones <ChevronDown className="w-3 h-3" /></>
                      )}
                    </button>
                    {explanationExpanded && (
                      <div className="px-4 pb-3 space-y-2">
                        {q.explanations.map((exp, ei) => (
                          <div key={ei} className={`flex items-start gap-2 text-[11px] leading-snug ${
                            ei === q.correct ? 'text-emerald-700' : 'text-stone-500'
                          }`}>
                            <span className="font-bold shrink-0">{String.fromCharCode(65 + ei)}.</span>
                            <span>{exp}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!submitted && (
          <button
            onClick={() => submitQuiz(msgIdx, quiz)}
            disabled={answered < total}
            className={`mt-4 w-full py-3 rounded-2xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
              answered >= total
                ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 active:scale-[0.98]'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}
          >
            {answered < total ? (
              <>
                <Target className="w-4 h-4" />
                Faltan {total - answered} pregunta{total - answered > 1 ? 's' : ''} por responder
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Enviar respuestas
              </>
            )}
          </button>
        )}
      </div>
    );
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
          <button
            onClick={() => setShowTopicPicker(!showTopicPicker)}
            className="text-xs text-stone-400 hover:text-rose-500 transition-colors flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
            {topic || 'Elige una materia'}
          </button>
        </div>
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
          title={isConnected ? 'Colgar llamada' : 'Llamar a Claudia'}
        >
          {isConnecting ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : isConnected ? (
            <Phone className="w-5 h-5 text-white animate-pulse" />
          ) : (
            <PhoneOff className="w-5 h-5 text-white" />
          )}
        </button>
        <button
          onClick={onLogout}
          className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4 text-stone-500" />
        </button>
      </header>

      {/* Topic picker */}
      {showTopicPicker && (
        <div className="bg-white border-b border-stone-200 px-4 py-3 shrink-0">
          <p className="text-xs font-semibold text-stone-500 mb-2">Elige la materia:</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {SUGGESTED_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => selectTopic(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  topic === t
                    ? 'bg-rose-600 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomTopic()}
              placeholder="Otra materia..."
              className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            <button
              onClick={handleCustomTopic}
              disabled={!customTopic.trim()}
              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-sm font-medium disabled:bg-stone-300 hover:bg-rose-700 transition-colors flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-rose-600/10 border-4 border-dashed border-rose-400 z-50 flex items-center justify-center rounded-2xl">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-xl text-center">
            <Paperclip className="w-10 h-10 text-rose-500 mx-auto mb-2" />
            <p className="text-lg font-semibold text-stone-800">Suelta tus archivos aquí</p>
            <p className="text-sm text-stone-400">Imágenes, PDF, Word, Excel, PowerPoint, texto...</p>
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
            <h2 className="text-xl font-bold mb-2">Hola! Soy Claudia</h2>
            {!topic ? (
              <>
                <p className="text-stone-500 text-sm max-w-sm mb-4">
                  Tu tutora personal para prepararte para tus exámenes. Para empezar, dime qué materia estás estudiando:
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 mb-4 max-w-md">
                  {SUGGESTED_TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-stone-200 text-stone-600 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition-all"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 w-full max-w-xs">
                  <input
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomTopic()}
                    placeholder="Otra materia..."
                    className="flex-1 text-sm border border-stone-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  />
                  <button
                    onClick={handleCustomTopic}
                    disabled={!customTopic.trim()}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium disabled:bg-stone-300 hover:bg-rose-700 transition-colors"
                  >
                    Ir
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-stone-500 text-sm max-w-sm mb-6">
                  Estoy lista para ayudarte con <strong>{topic}</strong>.
                  Sube tus apuntes, diapositivas o imágenes y te ayudaré a prepararte para tu examen.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
                  {[
                    '📎 Sube cualquier documento (PDF, Word, Excel, PPT...)',
                    '📷 Comparte imágenes para analizar',
                    '📝 Pídeme "genera un test" para practicar',
                    '📞 Llámame para hablar en tiempo real',
                  ].map((tip, i) => (
                    <div key={i} className="bg-white rounded-xl p-3 text-xs text-stone-600 border border-stone-200 text-left">
                      {tip}
                    </div>
                  ))}
                </div>
              </>
            )}
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
          <Phone className="w-4 h-4 animate-pulse" />
          <span className="font-medium">En llamada con Claudia</span>
          <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${liveSecondsLeft <= 30 ? 'bg-red-100 text-red-600' : 'bg-rose-100 text-rose-500'}`}>
            {Math.floor(liveSecondsLeft / 60)}:{(liveSecondsLeft % 60).toString().padStart(2, '0')}
          </span>
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
                  {getFileIconLarge(f.type)}
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
            accept={SUPPORTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => {
                if (e.target.value.length <= MAX_INPUT_CHARS) setInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta o pide un test..."
              rows={1}
              maxLength={MAX_INPUT_CHARS}
              className="w-full resize-none rounded-2xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent max-h-32"
              style={{ minHeight: '42px' }}
            />
            {input.length > MAX_INPUT_CHARS * 0.8 && (
              <span className={`absolute right-3 bottom-1 text-[10px] ${input.length >= MAX_INPUT_CHARS ? 'text-red-500' : 'text-stone-400'}`}>
                {input.length}/{MAX_INPUT_CHARS}
              </span>
            )}
          </div>
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && attachedFiles.length === 0) || messagesSent >= MAX_MESSAGES_PER_SESSION}
            className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 flex items-center justify-center shrink-0 transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
        <div className="flex justify-center mt-1">
          <span className={`text-[10px] ${(MAX_MESSAGES_PER_SESSION - messagesSent) <= 5 ? 'text-red-400' : 'text-stone-400'}`}>
            {MAX_MESSAGES_PER_SESSION - messagesSent} mensajes restantes
          </span>
        </div>
      </div>
    </div>
  );
}
