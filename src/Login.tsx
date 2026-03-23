import { useState } from 'react';
import { GraduationCap, Mail, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { sendVerificationLink } from './lib/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    try {
      await sendVerificationLink(trimmed);
      setSent(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-email') {
        setError('Correo electrónico no válido.');
      } else {
        setError('Error al enviar el enlace. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh bg-stone-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-10 h-10 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Claudia</h1>
          <p className="text-stone-500 text-sm mt-1">Tu tutora personal de estudio</p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Correo electrónico
            </label>
            <div className="relative mb-4">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-red-500 text-xs mb-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-stone-400 text-center mt-4">
              Te enviaremos un enlace de verificación a tu correo. No necesitas contraseña.
            </p>
          </form>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center">
            <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-stone-900 mb-2">Revisa tu correo</h2>
            <p className="text-sm text-stone-500 mb-1">
              Enviamos un enlace de verificación a:
            </p>
            <p className="text-sm font-medium text-stone-800 mb-4">{email}</p>
            <p className="text-xs text-stone-400 mb-4">
              Haz clic en el enlace del correo para iniciar sesión. Tu sesión durará 24 horas.
            </p>
            <button
              onClick={() => { setSent(false); setError(''); }}
              className="text-rose-600 hover:text-rose-700 text-sm font-medium"
            >
              Usar otro correo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
