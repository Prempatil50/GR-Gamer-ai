import { useState, type FormEvent } from 'react';
import {
  Compass,
  Download,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Mic,
  Palette,
  ShieldCheck,
  User,
} from 'lucide-react';

export type AuthMode = 'login' | 'signup';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (username: string, email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  authError: string | null;
  onClearError: () => void;
}

export function LoginScreen({
  onGoogleLogin,
  onEmailSignIn,
  onEmailSignUp,
  onPasswordReset,
  authError,
  onClearError,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
    setInfoMessage(null);
    onClearError();
  };

  const handleGoogleClick = async () => {
    setLocalError(null);
    setInfoMessage(null);
    onClearError();
    setSigningInGoogle(true);
    try {
      await onGoogleLogin();
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoMessage(null);
    onClearError();

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();

    if (mode === 'signup') {
      if (trimmedUsername.length < 2) {
        setLocalError('Please enter a username (at least 2 characters).');
        return;
      }
      if (trimmedUsername.length > 40) {
        setLocalError('Username must be 40 characters or fewer.');
        return;
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    setSubmittingForm(true);
    try {
      if (mode === 'signup') {
        await onEmailSignUp(trimmedUsername, trimmedEmail, password);
      } else {
        await onEmailSignIn(trimmedEmail, password);
      }
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleForgotPassword = async () => {
    setLocalError(null);
    setInfoMessage(null);
    onClearError();

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError('Enter your email address above first to receive a password reset link.');
      return;
    }

    setResettingPassword(true);
    try {
      await onPasswordReset(trimmedEmail);
      setInfoMessage(`Password reset link sent to ${trimmedEmail}. Check your inbox.`);
    } catch {
      // Error surfaced via authError
    } finally {
      setResettingPassword(false);
    }
  };

  const displayedError = localError || authError;
  const isBusy = signingInGoogle || submittingForm || resettingPassword;

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-between px-5 py-6 md:px-12 md:py-8 pb-safe"
      style={{
        backgroundColor: 'var(--canvas-bg)',
        color: 'var(--text-primary)',
      }}
    >
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <span className="text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Aurora AI Studio
        </span>
        <div className="flex items-center gap-2.5">
          <a
            href="/api/download-apk"
            download="Aurora-AI-Studio.apk"
            className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-opacity hover:opacity-85 cursor-pointer whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--surface-border)',
              color: 'var(--text-primary)',
            }}
          >
            <Download className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
            <span>Download APK</span>
          </a>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto my-auto py-8 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-4">
            <p
              className="text-xs sm:text-sm font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Conversational Workspace · Powered by Gemini & Firebase
            </p>
            <h1
              className="text-3xl sm:text-4xl md:text-[2.75rem] font-semibold tracking-tight leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Your personal AI workspace for ideas, voice dialogue, and new opportunities.
            </h1>
            <p
              className="text-sm sm:text-base leading-relaxed max-w-xl"
              style={{ color: 'var(--text-secondary)' }}
            >
              Ask anything in English, Hindi, or Hinglish. Speak naturally with instant voice replies, analyze videos up to 100MB, and organize dedicated opportunity pages—synced privately to your verified account.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="flex items-start gap-3">
              <Mic className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <h2 className="text-sm font-semibold">Voice & Multilingual AI</h2>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Speak prompts hands-free with natural spoken AI replies.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Compass className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <h2 className="text-sm font-semibold">Opportunity Pages</h2>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Focused spaces for coding, career growth, study, and creators.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Palette className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <h2 className="text-sm font-semibold">Adaptive Themes</h2>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Switch curated palettes or pick any custom canvas color.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <h2 className="text-sm font-semibold">Verified Cloud Sync</h2>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Protected with verification code & private Firestore rules.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div
            className="rounded-2xl p-6 sm:p-8 border space-y-5 shadow-sm max-w-md mx-auto lg:ml-auto lg:mr-0 w-full"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--surface-border)',
            }}
          >
            {/* Mode Switcher */}
            <div
              className="grid grid-cols-2 p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--surface-bg)',
                borderColor: 'var(--surface-border)',
              }}
            >
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                style={{
                  backgroundColor: mode === 'login' ? 'var(--accent-primary)' : 'transparent',
                  color: mode === 'login' ? 'var(--accent-fg)' : 'var(--text-secondary)',
                }}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                style={{
                  backgroundColor: mode === 'signup' ? 'var(--accent-primary)' : 'transparent',
                  color: mode === 'signup' ? 'var(--accent-fg)' : 'var(--text-secondary)',
                }}
              >
                Sign Up
              </button>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">
                {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                {mode === 'signup'
                  ? 'Enter your username, email, and password to continue to verification.'
                  : 'Sign in with your verified email and password.'}
              </p>
            </div>

            <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label htmlFor="auth-username" className="block text-xs font-medium">
                    Username
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <input
                      id="auth-username"
                      type="text"
                      autoComplete="username"
                      required
                      maxLength={40}
                      placeholder="e.g. Prem Patil"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setLocalError(null);
                      }}
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                      style={{
                        backgroundColor: 'var(--surface-bg)',
                        borderColor: 'var(--surface-border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="auth-email" className="block text-xs font-medium">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setLocalError(null);
                    }}
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-bg)',
                      borderColor: 'var(--surface-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="auth-password" className="block text-xs font-medium">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={isBusy}
                      className="text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-50"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {resettingPassword ? 'Sending...' : 'Forgot password?'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    placeholder={mode === 'signup' ? 'Minimum 6 characters' : 'Enter your password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setLocalError(null);
                    }}
                    className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-bg)',
                      borderColor: 'var(--surface-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer opacity-70 hover:opacity-100"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {infoMessage && (
                <div
                  className="p-3 rounded-xl text-xs sm:text-sm border"
                  style={{
                    backgroundColor: 'var(--surface-bg)',
                    borderColor: 'var(--accent-primary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {infoMessage}
                </div>
              )}

              {displayedError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl text-xs sm:text-sm border"
                  style={{
                    backgroundColor: 'var(--surface-bg)',
                    borderColor: '#dc2626',
                    color: '#ef4444',
                  }}
                >
                  {displayedError}
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--accent-fg)',
                }}
              >
                <span>
                  {submittingForm
                    ? mode === 'signup'
                      ? 'Creating Account...'
                      : 'Signing In...'
                    : mode === 'signup'
                      ? 'Create Account & Get Code'
                      : 'Sign In'}
                </span>
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div
                className="flex-grow border-t"
                style={{ borderColor: 'var(--surface-border)' }}
              />
              <span
                className="px-3 text-xs uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                or
              </span>
              <div
                className="flex-grow border-t"
                style={{ borderColor: 'var(--surface-border)' }}
              />
            </div>

            <button
              type="button"
              onClick={() => void handleGoogleClick()}
              disabled={isBusy}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-85 disabled:opacity-60 cursor-pointer"
              style={{
                backgroundColor: 'var(--surface-bg)',
                borderColor: 'var(--surface-border)',
                color: 'var(--text-primary)',
              }}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>{signingInGoogle ? 'Connecting Google...' : 'Continue with Google'}</span>
            </button>
          </div>
        </div>
      </main>

      <footer
        className="max-w-6xl w-full mx-auto pt-6 border-t flex items-center justify-between text-xs"
        style={{
          borderColor: 'var(--surface-border)',
          color: 'var(--text-muted)',
        }}
      >
        <span>Aurora AI Studio</span>
        <span>Private Firebase Workspace</span>
      </footer>
    </div>
  );
}
