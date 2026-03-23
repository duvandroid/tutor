import { useState } from 'react';
import { GraduationCap, Mail, Lock, Loader2, ArrowRight, KeyRound, ArrowLeft } from 'lucide-react';
import { signIn, signUp, resetPassword } from './lib/firebase';

type View = 'login' | 'register' | 'forgot';

export default function Login() {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Correo o contraseña incorrectos.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Correo electrónico no válido.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Intenta más tarde.');
      } else {
        setError('Error al iniciar sesión. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !confirmPassword) return;
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signUp(email.trim(), password);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Ya existe una cuenta con este correo.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Correo electrónico no válido.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña es muy débil. Usa al menos 6 caracteres.');
      } else {
        setError('Error al crear la cuenta. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err: any) {
      if (err.code === 'auth/invalid-email') {
        setError('Correo electrónico no válido.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No existe una cuenta con este correo.');
      } else {
        setError('Error al enviar el correo. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchView = (v: View) => {
    setView(v);
    setError('');
    setResetSent(false);
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

        {/* === LOGIN === */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Correo electrónico
            </label>
            <div className="relative mb-3">
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

            <label className="block text-sm font-medium text-stone-700 mb-2">
              Contraseña
            </label>
            <div className="relative mb-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
              />
            </div>

            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => switchView('forgot')}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium"
              >
                Olvidé mi contraseña
              </button>
            </div>

            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-stone-400 text-center mt-4">
              ¿No tienes cuenta?{' '}
              <button type="button" onClick={() => switchView('register')} className="text-rose-500 hover:text-rose-600 font-semibold">
                Regístrate
              </button>
            </p>
          </form>
        )}

        {/* === REGISTER === */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Correo electrónico
            </label>
            <div className="relative mb-3">
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

            <label className="block text-sm font-medium text-stone-700 mb-2">
              Contraseña
            </label>
            <div className="relative mb-3">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
              />
            </div>

            <label className="block text-sm font-medium text-stone-700 mb-2">
              Confirmar contraseña
            </label>
            <div className="relative mb-4">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
              />
            </div>

            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Crear cuenta
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-stone-400 text-center mt-4">
              ¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => switchView('login')} className="text-rose-500 hover:text-rose-600 font-semibold">
                Inicia sesión
              </button>
            </p>
          </form>
        )}

        {/* === FORGOT PASSWORD === */}
        {view === 'forgot' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
            {!resetSent ? (
              <form onSubmit={handleForgotPassword}>
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 mb-4"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Volver al inicio de sesión
                </button>

                <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6 text-rose-500" />
                </div>
                <h2 className="text-lg font-bold text-stone-900 text-center mb-1">Recuperar contraseña</h2>
                <p className="text-xs text-stone-500 text-center mb-4">
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </p>

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

                {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Enviar enlace'
                  )}
                </button>
              </form>
            ) : (
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-emerald-500" />
                </div>
                <h2 className="text-lg font-bold text-stone-900 mb-2">Correo enviado</h2>
                <p className="text-sm text-stone-500 mb-1">
                  Enviamos un enlace de recuperación a:
                </p>
                <p className="text-sm font-medium text-stone-800 mb-4">{email}</p>
                <p className="text-xs text-stone-400 mb-4">
                  Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.
                </p>
                <button
                  onClick={() => switchView('login')}
                  className="text-rose-600 hover:text-rose-700 text-sm font-medium"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
