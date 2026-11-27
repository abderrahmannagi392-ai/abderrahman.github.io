import React, { useEffect, useState } from 'react';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { CheckCircle2, KeyRound, MailCheck } from 'lucide-react';
import {
  AuthButton,
  AuthOkCheckmark,
  AuthPasswordField,
  AuthShell,
  AuthTitle,
} from '../components/AuthShell';
import { OtpSixDigitInput } from '../components/OtpSixDigitInput';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import {
  appleProvider,
  auth,
  googleProvider,
  translateFirebaseAuthError,
} from '../lib/firebase';
import { ensureUserDocuments } from '../lib/firestoreService';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';

interface LoginPageProps {
  initialMode?: 'login' | 'forgot';
}

type ForgotPanel = 'enter-email' | 'sent' | 'otp-verify' | 'otp-reset' | 'otp-done';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  return `${parts[0].charAt(0)}•••@${parts[1]}`;
}

const GoogleMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.02v3.14C3.03 21.17 7.19 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.03 14.04A7.19 7.19 0 0 1 4.65 12c0-.71.13-1.4.38-2.04V6.82H1.02A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.02 5.18l4.01-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.19 15.3 0 12 0 7.19 0 3.03 2.83 1.02 6.82l4.01 3.14C6.01 6.94 8.76 4.75 12 4.75Z"
    />
  </svg>
);

const AppleMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43Zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45Z" />
  </svg>
);

export const LoginPage: React.FC<LoginPageProps> = ({ initialMode = 'login' }) => {
  const {
    lang,
    setLang,
    user,
    refreshUser,
    refreshCatalog,
    refreshActiveExam,
    viewParams,
    navigate,
  } = useApp();
  const t = getT(lang);

  const [mode, setMode] = useState<'login' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertKey, setAlertKey] = useState(0);

  // Forgot-password Auth state (Link OR 6-digit OTP)
  const [panel, setPanel] = useState<ForgotPanel>('enter-email');
  const [forgotMethod, setForgotMethod] = useState<'link' | 'otp'>('link');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailErr, setForgotEmailErr] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [verifiedResetToken, setVerifiedResetToken] = useState('');
  const [newResetPw, setNewResetPw] = useState('');
  const [confirmResetPw, setConfirmResetPw] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [stepBusy, setStepBusy] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const showAlertError = (msg: string) => {
    setError(null);
    window.requestAnimationFrame(() => {
      setAlertKey((k) => k + 1);
      setError(msg);
    });
  };

  const resetForgotFlow = () => {
    setPanel('enter-email');
    setForgotMethod('link');
    setForgotEmail('');
    setForgotEmailErr(null);
    setOtpValue('');
    setVerifiedResetToken('');
    setNewResetPw('');
    setConfirmResetPw('');
    setResendSeconds(0);
    setError(null);
  };

  const switchToMode = (nextMode: 'login' | 'forgot') => {
    if (nextMode === 'forgot') {
      resetForgotFlow();
    }
    setError(null);
    setMode(nextMode);
    window.scrollTo(0, 0);
  };

  if (user) {
    return (
      <AuthShell>
        <AuthTitle>{lang === 'ar' ? 'أهلاً وسهلاً' : 'Bienvenue'}</AuthTitle>
        <div className="tag in" style={{ '--i': 1 } as React.CSSProperties}>
          {lang === 'ar' ? 'تعلّم بحرّية، وطوّر مسارك.' : 'Apprenez librement, tracez votre parcours.'}
        </div>
        <div className="box in text-center space-y-4" style={{ '--i': 2 } as React.CSSProperties}>
          {user.emailVerified ? (
            <CheckCircle2 className="w-11 h-11 text-[#7c9e1c] mx-auto" />
          ) : (
            <MailCheck className="w-11 h-11 text-[#b8860b] mx-auto" />
          )}
          <div className="font-bold text-base">{user.name}</div>
          <p className="text-xs opacity-75">
            {user.emailVerified
              ? lang === 'ar'
                ? 'أنت مسجل الدخول حالياً.'
                : 'Vous êtes déjà connecté.'
              : lang === 'ar'
                ? 'تم تسجيل الدخول. يرجى تفعيل بريدك الإلكتروني من الشريط العلوي لفتح جميع المزايا.'
                : 'Connecté. Veuillez vérifier votre e-mail via le bandeau ci-dessus.'}
          </p>
          <div className="flex justify-center gap-3">
            <AuthButton type="button" onClick={() => navigate('dashboard')}>
              {t.navDashboard}
            </AuthButton>
            <AuthButton type="button" small onClick={() => navigate('home')}>
              {t.navHome}
            </AuthButton>
          </div>
        </div>
      </AuthShell>
    );
  }

  const navigateAfterAuth = (isAdmin?: boolean) => {
    if (viewParams.redirectView === 'verify-receipt' && viewParams.receiptId && viewParams.receiptSig) {
      navigate('verify-receipt', {
        receiptId: viewParams.receiptId,
        receiptSig: viewParams.receiptSig,
      });
      return;
    }
    if (viewParams.planId) {
      navigate('checkout', { planId: viewParams.planId });
      return;
    }
    navigate(isAdmin ? 'admin' : 'dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showAlertError(
        lang === 'ar' ? 'أدخل بريدك الإلكتروني وكلمة المرور.' : 'Veuillez saisir votre e-mail et mot de passe.'
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await ensureUserDocuments(cred.user);
      if (profile.disabled) {
        await auth.signOut();
        showAlertError(
          lang === 'ar'
            ? 'تم إيقاف هذا الحساب مؤقتاً من قبل الإدارة.'
            : 'Ce compte a été désactivé par l’administration.'
        );
        return;
      }
      await refreshUser();
      await Promise.all([refreshCatalog(), refreshActiveExam()]);
      navigateAfterAuth(profile.isAdmin);
    } catch (err) {
      showAlertError(translateFirebaseAuthError(err, lang));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await ensureUserDocuments(cred.user, { authProvider: 'google.com' });
      if (profile.disabled) {
        await auth.signOut();
        showAlertError(
          lang === 'ar'
            ? 'تم إيقاف هذا الحساب مؤقتاً من قبل الإدارة.'
            : 'Ce compte a été désactivé par l’administration.'
        );
        return;
      }
      await refreshUser();
      await Promise.all([refreshCatalog(), refreshActiveExam()]);
      if (profile.profileCompleted === false && !profile.isAdmin) {
        navigate('account-complete');
        return;
      }
      navigateAfterAuth(profile.isAdmin);
    } catch (err) {
      showAlertError(translateFirebaseAuthError(err, lang));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, appleProvider);
      const profile = await ensureUserDocuments(cred.user, { authProvider: 'apple.com' });
      if (profile.disabled) {
        await auth.signOut();
        showAlertError(
          lang === 'ar'
            ? 'تم إيقاف هذا الحساب مؤقتاً من قبل الإدارة.'
            : 'Ce compte a été désactivé par l’administration.'
        );
        return;
      }
      await refreshUser();
      await Promise.all([refreshCatalog(), refreshActiveExam()]);
      if (profile.profileCompleted === false && !profile.isAdmin) {
        navigate('account-complete');
        return;
      }
      navigateAfterAuth(profile.isAdmin);
    } catch (err) {
      showAlertError(translateFirebaseAuthError(err, lang));
    } finally {
      setAppleBusy(false);
    }
  };

  const sendFirebaseReset = async (targetEmail: string, isResend = false) => {
    setStepBusy(true);
    setForgotEmailErr(null);
    try {
      auth.languageCode = lang === 'fr' ? 'fr' : 'ar';
      const issued = await apiRequest<{ actionToken?: string }>('/api/auth/action-tokens/issue', {
        method: 'POST',
        json: { purpose: 'password_reset', email: targetEmail },
      }).catch(() => ({ actionToken: undefined }));
      const continueUrl = issued?.actionToken
        ? `https://tadribi.chtbqi.com/reset-password?at=${encodeURIComponent(issued.actionToken)}`
        : 'https://tadribi.chtbqi.com/reset-password';
      try {
        await sendPasswordResetEmail(auth, targetEmail, {
          url: continueUrl,
          handleCodeInApp: true,
        });
      } catch (cfgErr: any) {
        const code = String(cfgErr?.code || '');
        if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
          await sendPasswordResetEmail(auth, targetEmail);
        } else {
          throw cfgErr;
        }
      }
      setResendSeconds(45);
      if (!isResend) {
        setPanel('sent');
      }
    } catch (err) {
      setForgotEmailErr(translateFirebaseAuthError(err, lang));
    } finally {
      setStepBusy(false);
    }
  };

  const sendOtpReset = async (targetEmail: string, isResend = false) => {
    setStepBusy(true);
    setForgotEmailErr(null);
    try {
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        json: { email: targetEmail, method: 'otp', lang },
      });
      setResendSeconds(45);
      if (!isResend) {
        setOtpValue('');
        setPanel('otp-verify');
      }
    } catch (err: any) {
      setForgotEmailErr(
        err?.message ||
          (lang === 'ar' ? 'تعذر إرسال رمز التحقق عبر البريد.' : 'Impossible d’envoyer le code OTP.')
      );
    } finally {
      setStepBusy(false);
    }
  };

  const handleForgotContinue = async () => {
    const cleanEmail = forgotEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setForgotEmailErr(lang === 'ar' ? 'أدخل بريداً إلكترونياً صحيحاً.' : 'Veuillez saisir un e-mail valide.');
      document.getElementById('fe')?.focus();
      return;
    }
    if (forgotMethod === 'otp') {
      await sendOtpReset(cleanEmail, false);
    } else {
      await sendFirebaseReset(cleanEmail, false);
    }
  };

  const handleVerifyResetOtp = async (overrideCode?: string) => {
    const code = (overrideCode || otpValue).trim();
    if (!/^\d{6}$/.test(code)) {
      setForgotEmailErr(lang === 'ar' ? 'أدخل رمز التحقق المكون من 6 أرقام.' : 'Saisissez le code à 6 chiffres.');
      return;
    }
    setStepBusy(true);
    setForgotEmailErr(null);
    try {
      const res = await apiRequest<{ ok: boolean; reset_token: string }>('/api/auth/verify-otp', {
        method: 'POST',
        json: { email: forgotEmail.trim(), otp: code },
      });
      setVerifiedResetToken(res.reset_token);
      setPanel('otp-reset');
    } catch (err: any) {
      setForgotEmailErr(
        err?.message || (lang === 'ar' ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Code invalide ou expiré.')
      );
    } finally {
      setStepBusy(false);
    }
  };

  const handleCompleteOtpPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotEmailErr(null);
    if (newResetPw.length < 8) {
      setForgotEmailErr(
        lang === 'ar'
          ? 'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.'
          : 'Le mot de passe doit contenir au moins 8 caractères.'
      );
      return;
    }
    if (newResetPw !== confirmResetPw) {
      setForgotEmailErr(
        lang === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Les mots de passe ne correspondent pas.'
      );
      return;
    }
    setStepBusy(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        json: { token: verifiedResetToken, newPassword: newResetPw },
      });
      setPanel('otp-done');
    } catch (err: any) {
      setForgotEmailErr(
        err?.message || (lang === 'ar' ? 'تعذر تحديث كلمة المرور.' : 'Impossible de réinitialiser.')
      );
    } finally {
      setStepBusy(false);
    }
  };

  const currentStepNumber =
    panel === 'enter-email' ? 1 : panel === 'otp-reset' || panel === 'otp-done' ? 3 : 2;
  const countdownText = (sec: number) =>
    sec > 0
      ? lang === 'ar'
        ? `إعادة الإرسال بعد 0:${String(sec).padStart(2, '0')}`
        : `Renvoyer dans 0:${String(sec).padStart(2, '0')}`
      : lang === 'ar'
        ? 'إعادة الإرسال'
        : 'Renvoyer';

  return (
    <AuthShell>
      {mode === 'login' && (
        <section>
          <AuthTitle>{tr(lang, 'أهلاً وسهلاً', 'Bienvenue', 'Welcome')}</AuthTitle>
          <div className="tag in" style={{ '--i': 1 } as React.CSSProperties}>
            {tr(
              lang,
              'تعلّم بحرّية، وطوّر مسارك.',
              'Apprenez librement, tracez votre parcours.',
              'Learn freely, shape your teaching path.'
            )}
          </div>

          <div className="box row in" style={{ '--i': 2 } as React.CSSProperties}>
            <span>
              {tr(lang, 'ليس لديك حساب؟', 'Pas encore de compte ?', "Don't have an account?")}
            </span>
            <AuthButton type="button" small onClick={() => navigate('register', viewParams)}>
              {t.register}
            </AuthButton>
          </div>

          <form className="box in" style={{ '--i': 3 } as React.CSSProperties} noValidate onSubmit={handleLogin}>
            <div key={alertKey} className={`alert ${error ? 'show' : ''}`}>
              <div>
                <p>{error || ''}</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="le">{tr(lang, 'بريدك الإلكتروني:', 'Votre e-mail :', 'Your email:')}</label>
              <input
                id="le"
                type="email"
                dir="ltr"
                placeholder="exemple@formation-libre.mr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <AuthPasswordField
              id="lp"
              label={tr(lang, 'كلمة المرور:', 'Mot de passe :', 'Password:')}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              ariaShowLabel={tr(lang, 'إظهار كلمة المرور', 'Afficher le mot de passe', 'Show password')}
              ariaHideLabel={tr(lang, 'إخفاء كلمة المرور', 'Masquer le mot de passe', 'Hide password')}
            />

            <div className="actions">
              <AuthButton type="submit" loading={busy} disabled={googleBusy}>
                {t.login}
              </AuthButton>
              <button type="button" className="lnk" onClick={() => switchToMode('forgot')}>
                {t.forgotPassword}
              </button>
            </div>

            <div className="or-sep">
              <span>{tr(lang, 'أو', 'ou', 'or')}</span>
            </div>

            <button
              type="button"
              className="btn-google"
              disabled={busy || googleBusy || appleBusy}
              onClick={() => void handleGoogleSignIn()}
            >
              <GoogleMark />
              <span>
                {googleBusy
                  ? t.loading
                  : tr(lang, 'الدخول السريع عبر Google', 'Continuer avec Google', 'Continue with Google')}
              </span>
            </button>

            <button
              type="button"
              className="btn-google mt-2.5"
              disabled={busy || googleBusy || appleBusy}
              onClick={() => void handleAppleSignIn()}
            >
              <AppleMark />
              <span>
                {appleBusy
                  ? t.loading
                  : tr(lang, 'المتابعة عبر Apple', 'Continuer avec Apple', 'Continue with Apple')}
              </span>
            </button>
          </form>

          <p className="fr in" style={{ '--i': 4 } as React.CSSProperties}>
            <button
              type="button"
              className="lnk"
              onClick={() => setLang(lang === 'ar' ? 'fr' : lang === 'fr' ? 'en' : 'ar')}
            >
              <b>{tr(lang, 'Cliquez ici', 'Click here', 'اضغط هنا')}</b>
            </button>{' '}
            {tr(lang, 'Pour le français / English', 'For English', 'للغة العربية')}
          </p>
        </section>
      )}

      {mode === 'forgot' && (
        <section>
          <AuthTitle>
            {tr(lang, 'استعادة كلمة المرور', 'Récupération du mot de passe', 'Reset Password')}
          </AuthTitle>
          <div className="tag in" style={{ '--i': 1 } as React.CSSProperties}>
            {tr(
              lang,
              'نعيدك إلى حسابك في خطوات بسيطة.',
              'Retrouvez votre compte en quelques étapes simples.',
              'Recover your account in simple steps.'
            )}
          </div>

          <div className="box in" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="steps" aria-hidden="true">
              {[
                { num: 1, label: lang === 'ar' ? 'البريد' : 'E-mail' },
                {
                  num: 2,
                  label:
                    forgotMethod === 'otp'
                      ? lang === 'ar'
                        ? 'رمز التحقق'
                        : 'Code OTP'
                      : lang === 'ar'
                        ? 'إرسال الرابط'
                        : 'Lien envoyé',
                },
                ...(forgotMethod === 'otp'
                  ? [{ num: 3, label: lang === 'ar' ? 'كلمة مرور جديدة' : 'Nouveau mot' }]
                  : []),
              ].map((st) => {
                const isDone = st.num < currentStepNumber;
                const isCur = st.num === currentStepNumber;
                return (
                  <div
                    key={st.num}
                    className={`st ${isDone ? 'done' : ''} ${isCur ? 'cur' : ''}`.trim()}
                  >
                    <i>{isDone ? '✓' : st.num}</i>
                    {st.label}
                  </div>
                );
              })}
            </div>

            {panel === 'enter-email' && (
              <div className="pn">
                <h2 className="hd">
                  {lang === 'ar' ? 'إعادة تعيين كلمة المرور عبر البريد' : 'Réinitialisation par e-mail'}
                </h2>

                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMethod('link');
                      setForgotEmailErr(null);
                    }}
                    className={`py-2 px-3 rounded-[6px] border font-bold cursor-pointer ${
                      forgotMethod === 'link'
                        ? 'bg-[#384D55] text-white border-[#384D55]'
                        : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                    }`}
                  >
                    {lang === 'ar' ? '1. رابط استعادة' : '1. Lien de réinitialisation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMethod('otp');
                      setForgotEmailErr(null);
                    }}
                    className={`py-2 px-3 rounded-[6px] border font-bold inline-flex items-center justify-center gap-1 cursor-pointer ${
                      forgotMethod === 'otp'
                        ? 'bg-[#384D55] text-white border-[#384D55]'
                        : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? '2. رمز تحقق (6 أرقام)' : '2. Code OTP'}</span>
                  </button>
                </div>

                <p className="mut">
                  {forgotMethod === 'link'
                    ? lang === 'ar'
                      ? 'أدخل بريدك الإلكتروني المسجل لنرسل لك رابطاً آمناً لتعيين كلمة مرور جديدة.'
                      : 'Saisissez votre adresse e-mail pour recevoir un lien sécurisé de réinitialisation.'
                    : lang === 'ar'
                      ? 'أدخل بريدك الإلكتروني لنرسل لك رمز تحقق مكوّناً من 6 أرقام لإعادة تعيين كلمة المرور مباشرة.'
                      : 'Recevez un code OTP à 6 chiffres par e-mail pour réinitialiser votre mot de passe.'}
                </p>

                <div className="field" style={{ marginBottom: '18px' }}>
                  <label htmlFor="fe">{lang === 'ar' ? 'بريدك الإلكتروني:' : 'Votre e-mail :'}</label>
                  <input
                    id="fe"
                    type="email"
                    dir="ltr"
                    placeholder="exemple@formation-libre.mr"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setForgotEmailErr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleForgotContinue();
                      }
                    }}
                  />
                  <div className={`ferr ${forgotEmailErr ? 'show' : ''}`} role="alert">
                    {forgotEmailErr || ''}
                  </div>
                </div>

                <AuthButton
                  type="button"
                  full
                  loading={stepBusy}
                  onClick={() => void handleForgotContinue()}
                >
                  {forgotMethod === 'otp'
                    ? lang === 'ar'
                      ? 'إرسال رمز التحقق (6 أرقام)'
                      : 'Envoyer le code OTP'
                    : lang === 'ar'
                      ? 'إرسال رابط إعادة التعيين'
                      : 'Envoyer le lien'}
                </AuthButton>
              </div>
            )}

            {panel === 'sent' && (
              <div className="pn center">
                <AuthOkCheckmark />
                <h2 className="hd">
                  {lang === 'ar' ? 'تحقق من بريدك الإلكتروني' : 'Vérifiez votre boîte e-mail'}
                </h2>
                <p className="mut">
                  {lang === 'ar' ? 'أرسلنا رابط إعادة تعيين كلمة المرور إلى' : 'Lien envoyé à'}
                  <br />
                  <span className="mail">{maskEmail(forgotEmail)}</span>
                  <br />
                  {lang === 'ar'
                    ? 'افتح الرسالة واضغط على الرابط لاختيار كلمة مرور جديدة. صلاحية الرابط 5 دقائق فقط ويُستخدم لمرة واحدة؛ إن لم تجده فتفقّد مجلد الرسائل غير المرغوب فيها.'
                    : 'Ouvrez le message et suivez le lien à usage unique (valable 5 minutes). Vérifiez également vos courriers indésirables.'}
                </p>
                {forgotEmailErr && (
                  <div className="ferr show mb-3" role="alert">
                    {forgotEmailErr}
                  </div>
                )}
                <div className="row2">
                  <button
                    type="button"
                    className="lnk"
                    onClick={() => {
                      setResendSeconds(0);
                      setForgotEmailErr(null);
                      setPanel('enter-email');
                    }}
                  >
                    {lang === 'ar' ? 'تغيير البريد الإلكتروني' : 'Changer d’e-mail'}
                  </button>
                  <button
                    type="button"
                    className="lnk"
                    disabled={resendSeconds > 0 || stepBusy}
                    onClick={() => void sendFirebaseReset(forgotEmail.trim(), true)}
                  >
                    {countdownText(resendSeconds)}
                  </button>
                </div>
              </div>
            )}

            {panel === 'otp-verify' && (
              <div className="pn center space-y-4">
                <h2 className="hd">
                  {lang === 'ar' ? 'أدخل رمز التحقق (6 أرقام)' : 'Saisissez le code à 6 chiffres'}
                </h2>
                <p className="mut">
                  {lang === 'ar' ? 'أرسلنا رمز تحقق صالحاً لمدة 5 دقائق إلى' : 'Code valable 5 minutes envoyé à'}
                  <br />
                  <span className="mail">{maskEmail(forgotEmail)}</span>
                </p>
                <OtpSixDigitInput
                  value={otpValue}
                  onChange={setOtpValue}
                  disabled={stepBusy}
                  onComplete={(c) => void handleVerifyResetOtp(c)}
                  idPrefix="forgot-pw-otp"
                />
                {forgotEmailErr && (
                  <div className="ferr show" role="alert">
                    {forgotEmailErr}
                  </div>
                )}
                <AuthButton
                  type="button"
                  full
                  loading={stepBusy}
                  disabled={otpValue.length < 6}
                  onClick={() => void handleVerifyResetOtp()}
                >
                  {lang === 'ar' ? 'تحقق من الرمز' : 'Vérifier le code'}
                </AuthButton>
                <div className="row2">
                  <button
                    type="button"
                    className="lnk"
                    onClick={() => {
                      setResendSeconds(0);
                      setForgotEmailErr(null);
                      setPanel('enter-email');
                    }}
                  >
                    {lang === 'ar' ? 'تغيير البريد الإلكتروني' : 'Changer d’e-mail'}
                  </button>
                  <button
                    type="button"
                    className="lnk"
                    disabled={resendSeconds > 0 || stepBusy}
                    onClick={() => void sendOtpReset(forgotEmail.trim(), true)}
                  >
                    {countdownText(resendSeconds)}
                  </button>
                </div>
              </div>
            )}

            {panel === 'otp-reset' && (
              <form onSubmit={handleCompleteOtpPasswordReset} className="pn space-y-4" noValidate>
                <h2 className="hd">
                  {lang === 'ar' ? 'تعيين كلمة المرور الجديدة' : 'Nouveau mot de passe'}
                </h2>
                {forgotEmailErr && (
                  <div className="ferr show" role="alert">
                    {forgotEmailErr}
                  </div>
                )}
                <AuthPasswordField
                  id="otp-new-pw"
                  label={lang === 'ar' ? 'كلمة المرور الجديدة (8 أحرف على الأقل):' : 'Nouveau mot de passe :'}
                  value={newResetPw}
                  onChange={setNewResetPw}
                  autoComplete="new-password"
                />
                <AuthPasswordField
                  id="otp-confirm-pw"
                  label={lang === 'ar' ? 'تأكيد كلمة المرور الجديدة:' : 'Confirmer le mot de passe :'}
                  value={confirmResetPw}
                  onChange={setConfirmResetPw}
                  autoComplete="new-password"
                />
                <AuthButton type="submit" full loading={stepBusy}>
                  {lang === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Enregistrer'}
                </AuthButton>
              </form>
            )}

            {panel === 'otp-done' && (
              <div className="pn center space-y-4">
                <AuthOkCheckmark />
                <h2 className="hd">
                  {lang === 'ar' ? 'تم تحديث كلمة المرور بنجاح' : 'Mot de passe mis à jour'}
                </h2>
                <p className="mut">
                  {lang === 'ar'
                    ? 'يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.'
                    : 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.'}
                </p>
                <AuthButton type="button" full onClick={() => switchToMode('login')}>
                  {lang === 'ar' ? 'تسجيل الدخول الآن' : 'Se connecter'}
                </AuthButton>
              </div>
            )}
          </div>

          <div className="in" style={{ '--i': 3 } as React.CSSProperties}>
            <button type="button" className="lnk back" onClick={() => switchToMode('login')}>
              {lang === 'ar' ? '← العودة لتسجيل الدخول' : '← Retour à la connexion'}
            </button>
          </div>
        </section>
      )}
    </AuthShell>
  );
};
