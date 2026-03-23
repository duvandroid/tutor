import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Loader2, BookOpen } from 'lucide-react';
import { AudioRecorder, AudioPlayer } from './lib/audio';

// Initialize the Gemini AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<any>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const connect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      playerRef.current = new AudioPlayer();
      playerRef.current.init();

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            
            recorderRef.current = new AudioRecorder((base64Data) => {
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            });
            recorderRef.current.start();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && playerRef.current) {
              playerRef.current.play(base64Audio);
            }
            
            // Handle interruption (e.g., when the user interrupts the model)
            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.clearQueue();
            }
          },
          onclose: () => {
            disconnect();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Ocurrió un error de conexión.");
            disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction: "Eres un experto en histología. Tu objetivo es ayudar al usuario a aprender sobre tejido epitelial, tejido conectivo y glándulas. Explica los conceptos de forma clara, didáctica y en español. Puedes hacer preguntas para evaluar su conocimiento. Sé conversacional y amable.",
        },
      });

      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo conectar");
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session.close());
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 font-sans text-stone-900">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-rose-600" />
          </div>
          
          <h1 className="text-2xl font-bold mb-2">Tutor de Histología</h1>
          <p className="text-stone-500 mb-8">
            Aprende sobre tejido epitelial, conectivo y glándulas conversando en tiempo real.
          </p>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`
              relative w-32 h-32 rounded-full flex items-center justify-center mx-auto transition-all duration-300
              ${isConnected 
                ? 'bg-rose-600 hover:bg-rose-700 shadow-[0_0_40px_rgba(225,29,72,0.4)]' 
                : 'bg-stone-900 hover:bg-stone-800 shadow-lg'}
              ${isConnecting ? 'opacity-80 cursor-not-allowed' : ''}
            `}
          >
            {isConnecting ? (
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            ) : isConnected ? (
              <div className="flex flex-col items-center">
                <Mic className="w-12 h-12 text-white mb-1 animate-pulse" />
                <span className="text-white/80 text-xs font-medium uppercase tracking-wider">Detener</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <MicOff className="w-12 h-12 text-white mb-1" />
                <span className="text-white/80 text-xs font-medium uppercase tracking-wider">Hablar</span>
              </div>
            )}
          </button>
          
          <div className="mt-8 text-sm text-stone-400 font-medium h-6">
            {isConnected ? 'Escuchando y hablando...' : 'Toca para empezar'}
          </div>
        </div>
      </div>
    </div>
  );
}
