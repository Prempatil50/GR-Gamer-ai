import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

export interface VerificationChallenge {
  challengeToken: string;
  previewCode?: string;
  expiresAt: number;
}

interface VerificationScreenProps {
  uid: string;
  username: string;
  email: string;
  challenge: VerificationChallenge | null;
  onRequestNewCode: () => Promise<VerificationChallenge | null>;
  onResendFirebaseEmail: () => Promise<void>;
  onCheckEmailVerified: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
}

export function VerificationScreen({
  uid,
  username,
  email,
  challenge,
  onRequestNewCode,
  onResendFirebaseEmail,
  onCheckEmailVerified,
  onSignOut,
}: VerificationScreenProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [activeChallenge, setActiveChallenge] = useState<VerificationChallenge | null>(
    challenge
  );
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const requestedInitialRef = useRef(false);

  useEffect(() => {
    setActiveChallenge(challenge);
  }, [challenge]);

  useEffect(() => {
    if (!activeChallenge && !requestedInitialRef.current) {
      requestedInitialRef.current = true;
      void onRequestNewCode().then((next) => {
        if (next) setActiveChallenge(next);
      });
    }
  }, [activeChallenge, onRequestNewCode]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSec]);

  // Once the 6-digit code is verified, poll Firebase verification status gently every 4s
  useEffect(() => {
    if (!codeVerified) return;
    const interval = window.setInterval(() => {
      void onCheckEmailVerified();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [codeVerified, onCheckEmailVerified]);

  const codeValue = digits.join('');

  const handleDigitChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    if (cleaned.length > 1) {
      const nextDigits = [...digits];
      for (let i = 0; i < 6; i++) {
        if (index + i < 6 && cleaned[i]) {
          nextDigits[index + i] = cleaned[i];
        }
      }
      setDigits(nextDigits);
      const focusIdx = Math.min(5, index + cleaned.length);
      inputRefs.current[focusIdx]?.focus();
      setErrorMsg(null);
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
    setErrorMsg(null);
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && codeValue.length === 6) {
      void handleVerifySubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIdx = Math.min(5, pasted.length);
    inputRefs.current[focusIdx]?.focus();
    setErrorMsg(null);
  };

  const handleVerifySubmit = useCallback(async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    if (codeValue.length !== 6) {
      setErrorMsg('Please enter all 6 digits of your verification code.');
      return;
    }
    if (!activeChallenge?.challengeToken) {
      setErrorMsg('Verification session expired. Request a new code below.');
      return;
    }

    setVerifyingCode(true);
    try {
      const resp = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          email,
          code: codeValue,
          challengeToken: activeChallenge.challengeToken,
        }),
      });
      const data = (await resp.json()) as { verified?: boolean; error?: string };
      if (!resp.ok || !data.verified) {
        setErrorMsg(data.error || 'Invalid verification code. Please check and try again.');
        return;
      }

      setCodeVerified(true);
      const emailDone = await onCheckEmailVerified();
      if (!emailDone) {
        setInfoMsg(
          `6-digit code verified! Please also click the confirmation link sent to ${email} to unlock your private Firebase workspace.`
        );
      }
    } catch {
      setErrorMsg('Could not verify the code right now. Please try again.');
    } finally {
      setVerifyingCode(false);
    }
  }, [activeChallenge, codeValue, email, onCheckEmailVerified, uid]);

  const handleResendCode = async () => {
    if (cooldownSec > 0 || resendingCode) return;
    setResendingCode(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const next = await onRequestNewCode();
      if (next) {
        setActiveChallenge(next);
        setDigits(['', '', '', '', '', '']);
        setCooldownSec(30);
        setInfoMsg('A new 6-digit verification code has been generated.');
        inputRefs.current[0]?.focus();
      } else {
        setErrorMsg('Failed to generate a new verification code. Please try again.');
      }
    } finally {
      setResendingCode(false);
    }
  };

  const handleResendFirebaseEmail = async () => {
    if (resendingEmail) return;
    setResendingEmail(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await onResendFirebaseEmail();
      setInfoMsg(`Verification email re-sent to ${email}. Check your inbox or spam folder.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not resend verification email. Please wait a moment.'
      );
    } finally {
      setResendingEmail(false);
    }
  };

  const handleManualCheckEmail = async () => {
    setCheckingStatus(true);
    setErrorMsg(null);
    try {
      const verified = await onCheckEmailVerified();
      if (!verified) {
        setInfoMsg(
          `Email is not confirmed yet. Open the verification email in ${email} and click the link, then tap Continue.`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to refresh verification status.'
      );
    } finally {
      setCheckingStatus(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-between px-5 py-6 md:px-12 md:py-8 pb-safe"
      style={{
        backgroundColor: 'var(--canvas-bg)',
        color: 'var(--text-primary)',
      }}
    >
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <span className="text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Aurora AI Studio
        </span>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80 cursor-pointer"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            borderColor: 'var(--surface-border)',
            color: 'var(--text-primary)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Login</span>
        </button>
      </header>

      <main className="max-w-lg w-full mx-auto my-auto py-8">
        <div
          className="rounded-2xl p-6 sm:p-8 border space-y-6 shadow-sm"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            borderColor: 'var(--surface-border)',
          }}
        >
          <div className="space-y-2 text-center">
            <div
              className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center border"
              style={{
                backgroundColor: 'var(--surface-bg)',
                borderColor: 'var(--surface-border)',
                color: 'var(--accent-primary)',
              }}
            >
              {codeVerified ? (
                <MailCheck className="w-6 h-6" />
              ) : (
                <KeyRound className="w-6 h-6" />
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {codeVerified ? 'Confirm Your Email Link' : 'Enter Verification Code'}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {codeVerified ? (
                <>
                  Code verified for <strong style={{ color: 'var(--text-primary)' }}>{username}</strong>.
                  Click the link sent to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> to
                  enter your workspace.
                </>
              ) : (
                <>
                  Welcome, <strong style={{ color: 'var(--text-primary)' }}>{username}</strong>. Enter the
                  6-digit verification code for{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
                </>
              )}
            </p>
          </div>

          {!codeVerified ? (
            <div className="space-y-5">
              {activeChallenge?.previewCode && (
                <div
                  className="rounded-xl p-3.5 border text-center space-y-1"
                  style={{
                    backgroundColor: 'var(--surface-bg)',
                    borderColor: 'var(--surface-border)',
                  }}
                >
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Your 6-Digit Verification Code
                  </p>
                  <p
                    className="text-2xl font-mono font-bold tracking-[0.35em]"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {activeChallenge.previewCode}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    aria-label={`Verification digit ${idx + 1}`}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-xl border outline-none transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-bg)',
                      borderColor: digit ? 'var(--accent-primary)' : 'var(--surface-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleVerifySubmit()}
                disabled={verifyingCode || codeValue.length !== 6}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-55 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--accent-fg)',
                }}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{verifyingCode ? 'Verifying Code...' : 'Verify Code & Continue'}</span>
              </button>

              <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => void handleResendCode()}
                  disabled={cooldownSec > 0 || resendingCode}
                  className="inline-flex items-center gap-1.5 font-medium transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resendingCode ? 'animate-spin' : ''}`} />
                  <span>
                    {cooldownSec > 0
                      ? `Resend code in ${cooldownSec}s`
                      : resendingCode
                        ? 'Sending...'
                        : 'Resend 6-digit code'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleResendFirebaseEmail()}
                  disabled={resendingEmail}
                  className="font-medium transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {resendingEmail ? 'Sending email...' : 'Resend email link'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="p-4 rounded-xl border flex items-start gap-3 text-sm"
                style={{
                  backgroundColor: 'var(--surface-bg)',
                  borderColor: 'var(--surface-border)',
                }}
              >
                <CheckCircle2
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: 'var(--accent-primary)' }}
                />
                <div className="space-y-1">
                  <p className="font-medium">6-Digit Code Verified</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Firebase sent an activation link to <strong>{email}</strong>. Click that link in
                    your inbox (or spam folder), then press Continue below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleManualCheckEmail()}
                disabled={checkingStatus}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--accent-fg)',
                }}
              >
                <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
                <span>
                  {checkingStatus ? 'Checking Verification...' : "I've Verified My Email — Continue"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleResendFirebaseEmail()}
                disabled={resendingEmail}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-opacity hover:opacity-85 disabled:opacity-55 cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface-bg)',
                  borderColor: 'var(--surface-border)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{resendingEmail ? 'Sending Link...' : 'Resend Activation Email'}</span>
              </button>
            </div>
          )}

          {infoMsg && (
            <div
              className="p-3.5 rounded-xl text-xs sm:text-sm border"
              style={{
                backgroundColor: 'var(--surface-bg)',
                borderColor: 'var(--accent-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {infoMsg}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl text-xs sm:text-sm border"
              style={{
                backgroundColor: 'var(--surface-bg)',
                borderColor: '#dc2626',
                color: '#ef4444',
              }}
            >
              {errorMsg}
            </div>
          )}
        </div>
      </main>

      <footer
        className="max-w-5xl w-full mx-auto pt-6 border-t flex items-center justify-between text-xs"
        style={{
          borderColor: 'var(--surface-border)',
          color: 'var(--text-muted)',
        }}
      >
        <span>Aurora AI Studio</span>
        <span>Account Verification</span>
      </footer>
    </div>
  );
}
