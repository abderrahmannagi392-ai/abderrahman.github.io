import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { KeyRound, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  appleProvider,
  auth,
  googleProvider,
  translateFirebaseAuthError,
} from '../../lib/firebase';
import { ensureUserDocuments, setPendingSignupOverrides } from '../../lib/firestoreService';
import type { Language, LevelSlug } from '../../types';
import { apiRequest } from '../../utils/api';
import { ALL_USER_LEVEL_OPTIONS } from '../../utils/levelLabels';
import { tr } from '../../utils/locale';
import { MobileBackground } from './MobileBackground';
import { MobileDarkSheet } from './MobilePrimitives';

type AuthViewMode = 'login' | 'signup' | 'forgot';
type ForgotPanel = 'pn0' | 'pn1' | 'po1' | 'pn2' | 'pd';

function computePasswordStrength(pw: string): number {
  if (!pw) return 0;
  let n = 0;
  if (pw.length >= 8) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^\w\s]/.test(pw) || pw.length >= 12) n++;
  return Math.max(1, n);
}

function maskEmailAddress(raw: string): string {
  const parts = raw.trim().split('@');
  if (parts.length !== 2) return raw;
  return `${parts[0].charAt(0)}•••@${parts[1]}`;
}

const EyeOpenSvg: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeClosedSvg: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 3l18 18M10.6 6.1A10 10 0 0112 6c7 0 11 6 11 6a17 17 0 01-3.2 3.9M6.6 6.6A17 17 0 001 12s4 7 11 7a10 10 0 004.2-.9" />
  </svg>
);

const HandUnderlineSvg: React.FC = () => (
  <svg viewBox="0 0 200 12" preserveAspectRatio="none">
    <path d="M3 8 C50 2 110 2 197 7" />
  </svg>
);

export const MobileAuthGate: React.FC = () => {
  const {
    lang,
    setLang,
    user,
    firebaseUser,
    refreshUser,
    refreshCatalog,
    refreshActiveExam,
    resendVerificationEmail,
    reloadVerificationStatus,
    setSelectedTrack,
    logout,
  } = useApp();

  const [view, setView] = useState<AuthViewMode>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [loginAlert, setLoginAlert] = useState<string | null>(null);
  const [loginAlertKey, setLoginAlertKey] = useState(0);
  const [loginBusy, setLoginBusy] = useState(false);

  // Signup state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPw, setSignupPw] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [signupTrack, setSignupTrack] = useState<'bilingual' | 'arabic' | 'french'>('bilingual');
  const [signupLevel, setSignupLevel] = useState<LevelSlug>('foundation');
  const [signupLang, setSignupLang] = useState<Language>(lang);
  const [signupAlert, setSignupAlert] = useState<string | null>(null);
  const [signupAlertKey, setSignupAlertKey] = useState(0);
  const [signupBusy, setSignupBusy] = useState(false);

  // Forgot password state (matches 3-step HTML flow)
  const [fgPanel, setFgPanel] = useState<ForgotPanel>('pn0');
  const [fgMethod, setFgMethod] = useState<'link' | 'otp'>('link');
  const [fgEmail, setFgEmail] = useState('');
  const [fgEmailErr, setFgEmailErr] = useState('');
  const [fgBusy, setFgBusy] = useState(false);
  const [fgTimer, setFgTimer] = useState(0);
  const [fgOtp, setFgOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [fgOtpErr, setFgOtpErr] = useState('');
  const [fgOtpShake, setFgOtpShake] = useState(false);
  const [fgResetToken, setFgResetToken] = useState('');
  const [fgNewPw, setFgNewPw] = useState('');
  const [fgNewConfirm, setFgNewConfirm] = useState('');
  const [showFgPw, setShowFgPw] = useState(false);
  const [showFgConfirm, setShowFgConfirm] = useState(false);
  const [fgNewErr, setFgNewErr] = useState('');
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Admin setup info sheet (for "إعداد المدير الأول للمنصة" link)
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);
  const [adminStatusInfo, setAdminStatusInfo] = useState<{ adminClaimed?: boolean } | null>(null);

  // Post-signup verification & OAuth completion
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyOtpSent, setVerifyOtpSent] = useState(false);
  const [verifyOtpVal, setVerifyOtpVal] = useState('');
  const [verifyMsg, setVerifyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [completeName, setCompleteName] = useState(user?.name || '');
  const [completeTrack, setCompleteTrack] = useState<'bilingual' | 'arabic' | 'french'>(
    user?.track || 'bilingual'
  );
  const [completeLevel, setCompleteLevel] = useState<LevelSlug>(user?.level || 'foundation');
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeErr, setCompleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setCompleteName(user.name);
  }, [user?.name]);

  useEffect(() => {
    if (fgTimer <= 0) return;
    const iv = window.setInterval(() => setFgTimer((p) => (p <= 1 ? 0 : p - 1)), 1000);
    return () => window.clearInterval(iv);
  }, [fgTimer]);

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const iv = window.setInterval(() => setVerifyCooldown((p) => (p <= 1 ? 0 : p - 1)), 1000);
    return () => window.clearInterval(iv);
  }, [verifyCooldown]);

  const switchView = (next: AuthViewMode) => {
    setView(next);
    setLoginAlert(null);
    setSignupAlert(null);
    if (next === 'forgot') {
      setFgPanel('pn0');
      setFgEmail('');
      setFgEmailErr('');
      setFgOtp(['', '', '', '', '', '']);
      setFgOtpErr('');
      setFgOtpShake(false);
      setFgResetToken('');
      setFgNewPw('');
      setFgNewConfirm('');
      setFgNewErr('');
      setFgTimer(0);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPw) {
      setLoginAlert(
        tr(lang, 'أدخل بريدك الإلكتروني وكلمة المرور.', 'Saisissez votre e-mail et mot de passe.', 'Enter your email and password.')
      );
      setLoginAlertKey((k) => k + 1);
      return;
    }
    setLoginBusy(true);
    setLoginAlert(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPw);
      const profile = await ensureUserDocuments(cred.user);
      if (profile.disabled) {
        await auth.signOut();
        setLoginAlert(tr(lang, 'تم إيقاف هذا الحساب مؤقتاً.', 'Ce compte est désactivé.', 'Account disabled.'));
        setLoginAlertKey((k) => k + 1);
        return;
      }
      await refreshUser();
      await Promise.all([refreshCatalog(), refreshActiveExam()]);
    } catch (err) {
      setLoginAlert(translateFirebaseAuthError(err, lang));
      setLoginAlertKey((k) => k + 1);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setLoginBusy(true);
    setLoginAlert(null);
    try {
      const cred = await signInWithPopup(auth, provider === 'google' ? googleProvider : appleProvider);
      const profile = await ensureUserDocuments(cred.user, {
        authProvider: provider === 'google' ? 'google.com' : 'apple.com',
      });
      if (profile.disabled) {
        await auth.signOut();
        setLoginAlert(tr(lang, 'تم إيقاف هذا الحساب مؤقتاً.', 'Ce compte est désactivé.', 'Account disabled.'));
        setLoginAlertKey((k) => k + 1);
        return;
      }
      await refreshUser();
      await Promise.all([refreshCatalog(), refreshActiveExam()]);
    } catch (err) {
      setLoginAlert(translateFirebaseAuthError(err, lang));
      setLoginAlertKey((k) => k + 1);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fail = (msg: string) => {
      setSignupAlert(msg);
      setSignupAlertKey((k) => k + 1);
    };

    if (signupName.trim().length < 2) {
      fail(tr(lang, 'يرجى إدخال الاسم الكامل.', 'Veuillez saisir votre nom complet.', 'Enter full name.'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim())) {
      fail(tr(lang, 'أدخل بريداً إلكترونياً صحيحاً.', 'Format d’e-mail invalide.', 'Invalid email.'));
      return;
    }
    if (signupPw.length < 6) {
      fail(tr(lang, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'Mot de passe de 6 caractères minimum.', 'Password min 6 characters.'));
      return;
    }
    if (signupPw !== signupConfirm) {
      fail(tr(lang, 'كلمتا المرور غير متطابقتين.', 'Les mots de passe ne correspondent pas.', 'Passwords do not match.'));
      return;
    }

    setSignupBusy(true);
    setSignupAlert(null);
    try {
      const nowIso = new Date().toISOString();
      const signupOverrides = {
        name: signupName.trim(),
        track: signupTrack,
        preferredLang: signupLang,
        level: signupLevel,
        profileCompleted: true,
        authProvider: 'password',
        acceptedTermsAt: nowIso,
        acceptedPrivacyAt: nowIso,
      };
      setPendingSignupOverrides(signupEmail.trim().toLowerCase(), signupOverrides);
      const cred = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPw);
      await updateProfile(cred.user, { displayName: signupName.trim() });
      await ensureUserDocuments(cred.user, signupOverrides);

      auth.languageCode = signupLang;
      await sendEmailVerification(cred.user).catch(() => {});
      await apiRequest('/api/auth/action-tokens/issue', {
        method: 'POST',
        json: { purpose: 'email_verify', email: signupEmail.trim() },
      }).catch(() => {});

      setSelectedTrack(signupTrack);
      setLang(signupLang);
      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        json: { name: signupName.trim(), track: signupTrack, preferred_lang: signupLang, level: signupLevel },
      }).catch(() => {});
      await refreshUser();
      setVerifyCooldown(45);
      setVerifyPending(true);
    } catch (err) {
      fail(translateFirebaseAuthError(err, lang));
    } finally {
      setSignupBusy(false);
    }
  };

  // Forgot Password handlers
  const handleForgotContinue = async () => {
    const clean = fgEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setFgEmailErr(tr(lang, 'أدخل بريداً إلكترونياً صحيحاً.', 'E-mail invalide.', 'Invalid email.'));
      return;
    }
    setFgEmailErr('');
    setFgBusy(true);
    try {
      if (fgMethod === 'link') {
        auth.languageCode = lang === 'fr' ? 'fr' : 'ar';
        await sendPasswordResetEmail(auth, clean);
        setFgPanel('pn1');
        setFgTimer(30);
      } else {
        await apiRequest('/api/auth/forgot-password', {
          method: 'POST',
          json: { email: clean, method: 'otp', lang },
        });
        setFgOtp(['', '', '', '', '', '']);
        setFgOtpErr('');
        setFgPanel('po1');
        setFgTimer(30);
        window.setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch (err: any) {
      setFgEmailErr(err?.message || translateFirebaseAuthError(err, lang));
    } finally {
      setFgBusy(false);
    }
  };

  const handleForgotVerifyOtp = async () => {
    const code = fgOtp.join('');
    if (code.length < 6) {
      setFgOtpErr(tr(lang, 'أدخل الرمز المكوّن من 6 أرقام.', 'Saisissez les 6 chiffres.', 'Enter 6-digit code.'));
      return;
    }
    setFgBusy(true);
    setFgOtpErr('');
    try {
      const res = await apiRequest<{ reset_token: string }>('/api/auth/verify-otp', {
        method: 'POST',
        json: { email: fgEmail.trim(), otp: code },
      });
      setFgResetToken(res.reset_token);
      setFgTimer(0);
      setFgPanel('pn2');
    } catch (err: any) {
      setFgOtpErr(err?.message || tr(lang, 'الرمز غير صحيح. تحقق منه وأعد المحاولة.', 'Code invalide.', 'Invalid code.'));
      setFgOtpShake(false);
      window.setTimeout(() => setFgOtpShake(true), 10);
    } finally {
      setFgBusy(false);
    }
  };

  const handleForgotSavePassword = async () => {
    if (fgNewPw.length < 8) {
      setFgNewErr(tr(lang, 'كلمة المرور يجب ألا تقل عن 8 أحرف.', '8 caractères minimum.', 'Min 8 characters.'));
      return;
    }
    if (fgNewPw !== fgNewConfirm) {
      setFgNewErr(tr(lang, 'كلمتا المرور غير متطابقتين.', 'Les mots de passe diffèrent.', 'Passwords do not match.'));
      return;
    }
    setFgNewErr('');
    setFgBusy(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        json: { token: fgResetToken, newPassword: fgNewPw },
      });
      setFgPanel('pd');
    } catch (err: any) {
      setFgNewErr(err?.message || tr(lang, 'تعذر حفظ كلمة المرور.', 'Erreur lors de la sauvegarde.', 'Failed to update.'));
    } finally {
      setFgBusy(false);
    }
  };

  const forgotStepNumber =
    fgPanel === 'pn0' ? 1 : fgPanel === 'pn1' || fgPanel === 'po1' ? 2 : fgPanel === 'pn2' ? 3 : 4;

  // Profile completion for OAuth accounts missing profileCompleted
  if (user && firebaseUser && user.profileCompleted === false && !user.isAdmin) {
    return (
      <div className="tdr-m-scroll-pane relative z-10">
        <MobileBackground />
        <main className="tdr-m-auth-wrap">
          <h1 className="tdr-m-auth-title tdr-m-auth-in" style={{ fontSize: '1.65rem' }}>
            {tr(lang, 'إكمال الملف الشخصي', 'Compléter le profil', 'Complete Profile')}
            <HandUnderlineSvg />
          </h1>
          <div className="tdr-m-auth-tag tdr-m-auth-in" style={{ '--i': 1 } as React.CSSProperties}>
            {tr(lang, 'خطوة أخيرة لتخصيص مسارك الدراسي.', 'Dernière étape vers votre parcours.', 'One step to personalize your path.')}
          </div>

          <form
            className="tdr-m-auth-box tdr-m-auth-in"
            style={{ '--i': 2 } as React.CSSProperties}
            onSubmit={async (e) => {
              e.preventDefault();
              if (completeName.trim().length < 2) {
                setCompleteErr(tr(lang, 'أدخل الاسم الكامل.', 'Nom requis.', 'Name required.'));
                return;
              }
              setCompleteBusy(true);
              setCompleteErr(null);
              try {
                await apiRequest('/api/auth/profile', {
                  method: 'PATCH',
                  json: {
                    name: completeName.trim(),
                    track: completeTrack,
                    level: completeLevel,
                    preferred_lang: lang,
                    profile_completed: true,
                  },
                });
                await refreshUser();
                await refreshCatalog();
              } catch (err: any) {
                setCompleteErr(err?.message || 'Error');
              } finally {
                setCompleteBusy(false);
              }
            }}
          >
            {completeErr && (
              <div className="tdr-m-alert show">
                <div>
                  <p>{completeErr}</p>
                </div>
              </div>
            )}
            <div className="tdr-m-auth-field">
              <label className="tdr-m-auth-label">{tr(lang, 'الاسم الكامل:', 'Nom complet :', 'Full Name:')}</label>
              <input type="text" value={completeName} onChange={(e) => setCompleteName(e.target.value)} />
            </div>
            <div className="tdr-m-auth-selects" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label>{tr(lang, 'المسار:', 'Filière :', 'Track:')}</label>
                <select
                  className="tdr-m-auth-select"
                  value={completeTrack}
                  onChange={(e) => setCompleteTrack(e.target.value as any)}
                >
                  <option value="bilingual">{tr(lang, 'معلم مزدوج', 'Bilingue', 'Bilingual')}</option>
                  <option value="arabic">{tr(lang, 'معلم عربي', 'Arabe', 'Arabic')}</option>
                  <option value="french">{tr(lang, 'معلم فرنسي', 'Français', 'French')}</option>
                </select>
              </div>
              <div>
                <label>{tr(lang, 'المستوى:', 'Niveau :', 'Level:')}</label>
                <select
                  className="tdr-m-auth-select"
                  value={completeLevel}
                  onChange={(e) => setCompleteLevel(e.target.value as LevelSlug)}
                >
                  {ALL_USER_LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'fr' ? opt.fr : lang === 'en' ? opt.en : opt.ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="tdr-m-auth-actions justify-between">
              <button type="submit" disabled={completeBusy} className="tdr-m-auth-btn">
                {completeBusy ? <span className="tdr-m-spinner" /> : <span>{tr(lang, 'حفظ والمتابعة', 'Continuer', 'Continue')}</span>}
              </button>
              <button type="button" onClick={() => void logout()} className="tdr-m-lnk">
                {tr(lang, 'تسجيل الخروج', 'Déconnexion', 'Sign Out')}
              </button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  // Post-signup verification step
  if (verifyPending && user && firebaseUser && !(firebaseUser.emailVerified || user.email_verified)) {
    return (
      <div className="tdr-m-scroll-pane relative z-10">
        <MobileBackground />
        <main className="tdr-m-auth-wrap">
          <h1 className="tdr-m-auth-title tdr-m-auth-in" style={{ fontSize: '1.65rem' }}>
            {tr(lang, 'تأكيد البريد الإلكتروني', 'Vérifier l’e-mail', 'Verify Email')}
            <HandUnderlineSvg />
          </h1>
          <div className="tdr-m-auth-tag tdr-m-auth-in" style={{ '--i': 1 } as React.CSSProperties}>
            <span className="tdr-m-mail-chip">{user.email}</span>
          </div>

          <div className="tdr-m-auth-box tdr-m-auth-in space-y-3" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }}>
                <MailCheck className="w-6 h-6" />
              </div>
            </div>
            {verifyMsg && (
              <div
                className="p-2.5 rounded text-xs font-bold text-center"
                style={{
                  background: verifyMsg.ok ? 'var(--m-brand-tint)' : 'var(--m-errbg)',
                  color: verifyMsg.ok ? 'var(--m-brand-deep)' : 'var(--m-err)',
                }}
              >
                {verifyMsg.text}
              </div>
            )}

            <button
              type="button"
              disabled={verifyBusy}
              onClick={async () => {
                setVerifyBusy(true);
                const r = await reloadVerificationStatus();
                setVerifyBusy(false);
                if (r.verified) {
                  setVerifyPending(false);
                } else {
                  setVerifyMsg({
                    text: tr(lang, 'لم يتم تأكيد الرابط بعد. يمكنك التفعيل عبر رمز OTP.', 'Lien non confirmé.', 'Not verified yet.'),
                    ok: false,
                  });
                }
              }}
              className="tdr-m-auth-btn full gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${verifyBusy ? 'animate-spin' : ''}`} />
              <span>{tr(lang, 'تحقق من التفعيل الآن', 'J’ai vérifié', 'Check Status')}</span>
            </button>

            {verifyOtpSent ? (
              <div className="space-y-2.5 pt-2">
                <input
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="w-full h-11 text-center font-bold tracking-widest border rounded"
                  style={{ borderColor: 'var(--m-line)', background: 'var(--m-field)', color: 'var(--m-ink)' }}
                  value={verifyOtpVal}
                  onChange={(e) => setVerifyOtpVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button
                  type="button"
                  disabled={verifyBusy || verifyOtpVal.length < 6}
                  onClick={async () => {
                    setVerifyBusy(true);
                    try {
                      await apiRequest('/api/auth/email-otp/verify', {
                        method: 'POST',
                        json: { otp: verifyOtpVal },
                      });
                      await refreshUser();
                      await reloadVerificationStatus();
                      setVerifyPending(false);
                    } catch (err: any) {
                      setVerifyMsg({ text: err?.message || 'Error', ok: false });
                    } finally {
                      setVerifyBusy(false);
                    }
                  }}
                  className="tdr-m-auth-btn full"
                >
                  {tr(lang, 'تأكيد الرمز', 'Valider le code', 'Verify OTP')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={verifyBusy || verifyCooldown > 0}
                onClick={async () => {
                  setVerifyBusy(true);
                  try {
                    await apiRequest('/api/auth/email-otp/send', { method: 'POST', json: { lang } });
                    setVerifyOtpSent(true);
                    setVerifyCooldown(45);
                    setVerifyMsg({ text: tr(lang, 'تم إرسال الرمز إلى بريدك.', 'Code envoyé.', 'Code sent.'), ok: true });
                  } catch (err: any) {
                    setVerifyMsg({ text: err?.message || 'Error', ok: false });
                  } finally {
                    setVerifyBusy(false);
                  }
                }}
                className="tdr-m-lnk w-full justify-center text-xs font-bold"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{tr(lang, 'إرسال رمز تحقق 6 أرقام', 'Envoyer un code OTP', 'Send 6-digit OTP')}</span>
              </button>
            )}

            <div className="flex items-center justify-between text-xs pt-2 border-t" style={{ borderColor: 'var(--m-line)' }}>
              <button
                type="button"
                disabled={verifyCooldown > 0}
                onClick={async () => {
                  const res = await resendVerificationEmail();
                  if (res.ok) {
                    setVerifyCooldown(45);
                    setVerifyMsg({ text: tr(lang, 'تمت إعادة إرسال الرابط.', 'Lien renvoyé.', 'Link resent.'), ok: true });
                  }
                }}
                className="tdr-m-lnk"
              >
                {verifyCooldown > 0 ? `(${verifyCooldown}s)` : tr(lang, 'إعادة إرسال الرابط', 'Renvoyer le lien', 'Resend link')}
              </button>
              <button type="button" onClick={() => setVerifyPending(false)} className="tdr-m-lnk font-bold">
                {tr(lang, 'متابعة إلى التطبيق ←', 'Continuer ←', 'Continue →')}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const signupStrength = computePasswordStrength(signupPw);
  const fgStrength = computePasswordStrength(fgNewPw);

  return (
    <div className="tdr-m-scroll-pane relative z-10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <MobileBackground />

      <main className="tdr-m-auth-wrap">
        {/* ================= 1. LOGIN VIEW (1:1 HTML Layout) ================= */}
        {view === 'login' && (
          <section aria-label="تسجيل الدخول">
            <h1 className="tdr-m-auth-title tdr-m-auth-in">
              {tr(lang, 'أهلاً وسهلاً', 'Bienvenue', 'Welcome')}
              <HandUnderlineSvg />
            </h1>
            <div className="tdr-m-auth-tag tdr-m-auth-in" style={{ '--i': 1 } as React.CSSProperties}>
              {tr(lang, 'تعلّم بحرّية، وطوّر مسارك.', 'Apprenez librement, tracez votre parcours.', 'Learn freely, build your path.')}
            </div>

            <div className="tdr-m-auth-box row tdr-m-auth-in" style={{ '--i': 2 } as React.CSSProperties}>
              <span>{tr(lang, 'ليس لديك حساب؟', 'Pas encore de compte ?', 'No account yet?')}</span>
              <button type="button" className="tdr-m-auth-btn sm" onClick={() => switchView('signup')}>
                {tr(lang, 'إنشاء حساب', 'Créer un compte', 'Sign Up')}
              </button>
            </div>

            <form
              className="tdr-m-auth-box tdr-m-auth-in"
              style={{ '--i': 3 } as React.CSSProperties}
              noValidate
              onSubmit={handleLoginSubmit}
            >
              <div key={loginAlertKey} className={`tdr-m-alert ${loginAlert ? 'show' : ''}`}>
                <div>
                  <p>{loginAlert || ''}</p>
                </div>
              </div>

              <div className="tdr-m-auth-field">
                <label className="tdr-m-auth-label" htmlFor="m-le">
                  {tr(lang, 'بريدك الإلكتروني:', 'Votre e-mail :', 'Your email:')}
                </label>
                <input
                  id="m-le"
                  type="email"
                  dir="ltr"
                  placeholder="exemple@formation-libre.mr"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>

              <div className="tdr-m-auth-field pw">
                <label className="tdr-m-auth-label" htmlFor="m-lp">
                  {tr(lang, 'كلمة المرور:', 'Mot de passe :', 'Password:')}
                </label>
                <input
                  id="m-lp"
                  type={showLoginPw ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="current-password"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                />
                <button
                  type="button"
                  className="tdr-m-eye"
                  aria-label="إظهار كلمة المرور"
                  onClick={() => setShowLoginPw((p) => !p)}
                >
                  {showLoginPw ? <EyeClosedSvg /> : <EyeOpenSvg />}
                </button>
              </div>

              <div className="tdr-m-auth-actions">
                <button className="tdr-m-auth-btn" type="submit" disabled={loginBusy}>
                  {loginBusy ? (
                    <span className="tdr-m-spinner" />
                  ) : (
                    <span>{tr(lang, 'تسجيل دخول', 'Se connecter', 'Sign In')}</span>
                  )}
                </button>
                <button type="button" className="tdr-m-lnk" onClick={() => switchView('forgot')}>
                  {tr(lang, 'نسيت كلمة مرورك؟', 'Mot de passe oublié ?', 'Forgot password?')}
                </button>
              </div>

              {/* Compact Google / Apple OAuth options inside official container */}
              <div
                className="mt-4 pt-3.5 border-t grid grid-cols-2 gap-2"
                style={{ borderColor: 'var(--m-line)' }}
              >
                <button
                  type="button"
                  disabled={loginBusy}
                  onClick={() => void handleOAuth('google')}
                  className="h-9 rounded-[3px] border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)', color: 'var(--m-ink)' }}
                >
                  <span>Google</span>
                </button>
                <button
                  type="button"
                  disabled={loginBusy}
                  onClick={() => void handleOAuth('apple')}
                  className="h-9 rounded-[3px] border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)', color: 'var(--m-ink)' }}
                >
                  <span>Apple</span>
                </button>
              </div>
            </form>

            <p className="tdr-m-fr tdr-m-auth-in" style={{ '--i': 4 } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')}
                className="bg-transparent border-0 font-inherit cursor-pointer p-0 text-inherit"
              >
                <b>{lang === 'fr' ? 'اضغط هنا' : 'Cliquez ici'}</b>{' '}
                {lang === 'fr' ? 'للعربية' : 'Pour le français'}
              </button>
            </p>

            <button
              type="button"
              className="tdr-m-admin-lnk tdr-m-auth-in"
              style={{ '--i': 5 } as React.CSSProperties}
              onClick={async () => {
                setAdminSheetOpen(true);
                const info = await apiRequest<{ adminClaimed?: boolean }>('/api/auth/admin-status').catch(() => null);
                setAdminStatusInfo(info);
              }}
            >
              {tr(lang, 'إعداد المدير الأول للمنصة', 'Configuration administrateur', 'Admin setup')}
            </button>
          </section>
        )}

        {/* ================= 2. SIGNUP VIEW (1:1 HTML Layout) ================= */}
        {view === 'signup' && (
          <section aria-label="إنشاء حساب جديد">
            <p className="tdr-m-fr tdr-m-auth-in" style={{ '--i': 0 } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => {
                  const next = lang === 'fr' ? 'ar' : 'fr';
                  setLang(next);
                  setSignupLang(next);
                }}
                className="bg-transparent border-0 font-inherit cursor-pointer p-0 text-inherit"
              >
                <b>{lang === 'fr' ? 'اضغط هنا' : 'Cliquez ici'}</b>{' '}
                {lang === 'fr' ? 'للتسجيل بالعربية *' : 'To sign up in French *'}
              </button>
            </p>

            <h1 className="tdr-m-auth-title tdr-m-auth-in" style={{ '--i': 1, fontSize: '1.7rem' } as React.CSSProperties}>
              {tr(lang, 'إنشاء حساب جديد', 'Créer un compte', 'Create Account')}
              <HandUnderlineSvg />
            </h1>
            <div className="tdr-m-auth-tag tdr-m-auth-in" style={{ '--i': 2 } as React.CSSProperties}>
              {tr(lang, 'خطوة واحدة نحو مسارك.', 'Un pas vers votre parcours.', 'One step towards your path.')}
            </div>

            <div key={signupAlertKey} className={`tdr-m-alert tdr-m-auth-in ${signupAlert ? 'show' : ''}`} style={{ '--i': 2 } as React.CSSProperties}>
              <div>
                <p dir={signupAlert && /^[A-Za-z]/.test(signupAlert) ? 'ltr' : 'rtl'}>
                  {signupAlert || ''}
                </p>
              </div>
            </div>

            <form
              className="tdr-m-auth-box tdr-m-auth-in"
              style={{ '--i': 3 } as React.CSSProperties}
              noValidate
              onSubmit={handleSignupSubmit}
            >
              <div className="tdr-m-auth-field">
                <label className="tdr-m-auth-label" htmlFor="m-sn">
                  {tr(lang, 'الاسم الكامل:', 'Nom complet :', 'Full Name:')}
                </label>
                <input
                  id="m-sn"
                  type="text"
                  placeholder="محمد أحمد سالم"
                  autoComplete="name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                />
              </div>

              <div className="tdr-m-auth-field">
                <label className="tdr-m-auth-label" htmlFor="m-se">
                  {tr(lang, 'بريدك الإلكتروني:', 'Votre e-mail :', 'Your email:')}
                </label>
                <input
                  id="m-se"
                  type="email"
                  dir="ltr"
                  placeholder="exemple@formation-libre.mr"
                  autoComplete="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
              </div>

              <div className="tdr-m-auth-field pw">
                <label className="tdr-m-auth-label" htmlFor="m-sp">
                  {tr(lang, 'كلمة المرور:', 'Mot de passe :', 'Password:')}
                </label>
                <input
                  id="m-sp"
                  type={showSignupPw ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="new-password"
                  value={signupPw}
                  onChange={(e) => setSignupPw(e.target.value)}
                />
                <button
                  type="button"
                  className="tdr-m-eye"
                  aria-label="إظهار كلمة المرور"
                  onClick={() => setShowSignupPw((p) => !p)}
                >
                  {showSignupPw ? <EyeClosedSvg /> : <EyeOpenSvg />}
                </button>
              </div>

              <div className="tdr-m-meter" data-l={signupStrength}>
                <i />
                <i />
                <i />
                <i />
              </div>

              <div className="tdr-m-auth-field pw">
                <label className="tdr-m-auth-label" htmlFor="m-sc">
                  {tr(lang, 'تأكيد كلمة المرور:', 'Confirmer :', 'Confirm Password:')}
                </label>
                <input
                  id="m-sc"
                  type={showSignupConfirm ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="new-password"
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                />
                <button
                  type="button"
                  className="tdr-m-eye"
                  aria-label="إظهار كلمة المرور"
                  onClick={() => setShowSignupConfirm((p) => !p)}
                >
                  {showSignupConfirm ? <EyeClosedSvg /> : <EyeOpenSvg />}
                </button>
              </div>

              <div className="tdr-m-auth-selects">
                <div>
                  <label htmlFor="m-s1">{tr(lang, 'المسارات والتخصصات:', 'Filières :', 'Tracks:')}</label>
                  <select
                    id="m-s1"
                    className="tdr-m-auth-select"
                    value={signupTrack}
                    onChange={(e) => setSignupTrack(e.target.value as any)}
                  >
                    <option value="bilingual">{tr(lang, 'معلم مزدوج', 'Instituteur Bilingue', 'Bilingual')}</option>
                    <option value="arabic">{tr(lang, 'معلم عربي', 'Instituteur Arabe', 'Arabic')}</option>
                    <option value="french">{tr(lang, 'معلم فرنسي', 'Instituteur Français', 'French')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="m-s2">{tr(lang, 'المستويات:', 'Niveaux :', 'Levels:')}</label>
                  <select
                    id="m-s2"
                    className="tdr-m-auth-select"
                    value={signupLevel}
                    onChange={(e) => setSignupLevel(e.target.value as LevelSlug)}
                  >
                    {ALL_USER_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {lang === 'fr' ? opt.fr : lang === 'en' ? opt.en : opt.ar}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="m-s3">{tr(lang, 'اللغة:', 'Langue :', 'Language:')}</label>
                  <select
                    id="m-s3"
                    className="tdr-m-auth-select"
                    value={signupLang}
                    onChange={(e) => setSignupLang(e.target.value as Language)}
                  >
                    <option value="ar">العربية</option>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div className="tdr-m-auth-actions">
                <button className="tdr-m-auth-btn" type="submit" disabled={signupBusy}>
                  {signupBusy ? (
                    <span className="tdr-m-spinner" />
                  ) : (
                    <span>{tr(lang, 'إنشاء حساب', 'Créer le compte', 'Create Account')}</span>
                  )}
                </button>
                <span>
                  {tr(lang, 'لديك حساب؟', 'Déjà inscrit ?', 'Have an account?')}{' '}
                  <button type="button" className="tdr-m-lnk" onClick={() => switchView('login')}>
                    {tr(lang, 'تسجيل دخول', 'Connexion', 'Login')}
                  </button>
                </span>
              </div>
            </form>
          </section>
        )}

        {/* ================= 3. FORGOT PASSWORD 3-STEP FLOW (1:1 HTML Layout) ================= */}
        {view === 'forgot' && (
          <section aria-label="استعادة كلمة المرور">
            <h1 className="tdr-m-auth-title tdr-m-auth-in">
              {tr(lang, 'استعادة كلمة المرور', 'Mot de passe oublié', 'Recover Password')}
              <HandUnderlineSvg />
            </h1>
            <div className="tdr-m-auth-tag tdr-m-auth-in" style={{ '--i': 1 } as React.CSSProperties}>
              {tr(lang, 'نعيدك إلى حسابك في خطوات بسيطة.', 'Récupérez votre compte facilement.', 'Back to your account in simple steps.')}
            </div>

            <div className="tdr-m-auth-box tdr-m-auth-in" style={{ '--i': 2 } as React.CSSProperties}>
              <div className="tdr-m-steps" aria-hidden="true">
                {[
                  { idx: 1, label: tr(lang, 'الطريقة', 'Méthode', 'Method') },
                  { idx: 2, label: tr(lang, 'التحقق', 'Vérification', 'Verify') },
                  { idx: 3, label: tr(lang, 'كلمة المرور', 'Mot de passe', 'Password') },
                ].map((s) => {
                  const done = s.idx < forgotStepNumber;
                  const cur = s.idx === forgotStepNumber;
                  return (
                    <div key={s.idx} className={`tdr-m-st ${done ? 'done' : ''} ${cur ? 'cur' : ''}`}>
                      <i>{done ? '✓' : s.idx}</i>
                      <span>{s.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Panel 0: Select method + email */}
              {fgPanel === 'pn0' && (
                <div>
                  <h2 className="tdr-m-kufi text-lg font-bold mb-1.5" style={{ color: 'var(--m-ink)' }}>
                    {tr(lang, 'كيف تريد استعادة حسابك؟', 'Comment récupérer votre compte ?', 'How to recover your account?')}
                  </h2>
                  <p className="text-[13px] mb-4" style={{ color: 'var(--m-muted)' }}>
                    {tr(lang, 'اختر الطريقة الأنسب لك، ثم أدخل بريدك الإلكتروني.', 'Choisissez la méthode puis saisissez votre e-mail.', 'Choose a method and enter your email.')}
                  </p>

                  <div className="tdr-m-opts" role="radiogroup">
                    <label className={`tdr-m-opt ${fgMethod === 'link' ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="m-fg-method"
                        checked={fgMethod === 'link'}
                        onChange={() => setFgMethod('link')}
                      />
                      <span className="ic">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M3 7l9 6 9-6" />
                        </svg>
                      </span>
                      <span>
                        <b>{tr(lang, 'رابط عبر البريد الإلكتروني', 'Lien par e-mail', 'Email Reset Link')}</b>
                        <small>{tr(lang, 'نرسل إليك رابطاً آمناً لإعادة تعيين كلمة المرور.', 'Nous envoyons un lien sécurisé par e-mail.', 'We send a secure reset link.')}</small>
                      </span>
                      <span className="ck" />
                    </label>

                    <label className={`tdr-m-opt ${fgMethod === 'otp' ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="m-fg-method"
                        checked={fgMethod === 'otp'}
                        onChange={() => setFgMethod('otp')}
                      />
                      <span className="ic">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                      </span>
                      <span>
                        <b>{tr(lang, 'رمز تحقق (OTP)', 'Code OTP (6 chiffres)', 'OTP Code')}</b>
                        <small>{tr(lang, 'نرسل رمزاً من 6 أرقام إلى بريدك لإدخاله هنا.', 'Code à 6 chiffres envoyé à votre e-mail.', '6-digit code sent to your email.')}</small>
                      </span>
                      <span className="ck" />
                    </label>
                  </div>

                  <div className="tdr-m-auth-field" style={{ marginBottom: 18 }}>
                    <label className="tdr-m-auth-label" htmlFor="m-fe">
                      {tr(lang, 'بريدك الإلكتروني:', 'Votre e-mail :', 'Your email:')}
                    </label>
                    <input
                      id="m-fe"
                      type="email"
                      dir="ltr"
                      placeholder="exemple@formation-libre.mr"
                      autoComplete="email"
                      value={fgEmail}
                      onChange={(e) => {
                        setFgEmail(e.target.value);
                        setFgEmailErr('');
                      }}
                    />
                    {fgEmailErr && <div className="tdr-m-ferr">{fgEmailErr}</div>}
                  </div>

                  <button
                    type="button"
                    disabled={fgBusy}
                    onClick={() => void handleForgotContinue()}
                    className="tdr-m-auth-btn full"
                  >
                    {fgBusy ? <span className="tdr-m-spinner" /> : <span>{tr(lang, 'متابعة', 'Continuer', 'Continue')}</span>}
                  </button>
                </div>
              )}

              {/* Panel 1a: Link Sent */}
              {fgPanel === 'pn1' && (
                <div className="text-center">
                  <svg className="tdr-m-okc" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" />
                    <path d="M20 33l9 9 16-18" />
                  </svg>
                  <h2 className="tdr-m-kufi text-lg font-bold mb-1.5">
                    {tr(lang, 'تحقق من بريدك الإلكتروني', 'Vérifiez votre e-mail', 'Check Your Email')}
                  </h2>
                  <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--m-muted)' }}>
                    {tr(lang, 'أرسلنا رابط إعادة التعيين إلى', 'Lien envoyé à', 'We sent a reset link to')}
                    <br />
                    <span className="tdr-m-mail-chip">{maskEmailAddress(fgEmail)}</span>
                    <br />
                    {tr(lang, 'إن لم تجده فتفقّد مجلد الرسائل غير المرغوب فيها.', 'Vérifiez aussi les spams.', 'Check spam folder if needed.')}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <button type="button" className="tdr-m-lnk" onClick={() => setFgPanel('pn0')}>
                      {tr(lang, 'تغيير البريد أو الطريقة', 'Changer de méthode', 'Change method')}
                    </button>
                    <button
                      type="button"
                      disabled={fgTimer > 0}
                      onClick={() => {
                        void sendPasswordResetEmail(auth, fgEmail.trim()).catch(() => {});
                        setFgTimer(30);
                      }}
                      className="tdr-m-lnk"
                    >
                      {fgTimer > 0
                        ? `${tr(lang, 'إعادة الإرسال بعد', 'Renvoyer dans', 'Resend in')} 0:${String(fgTimer).padStart(2, '0')}`
                        : tr(lang, 'إعادة الإرسال', 'Renvoyer', 'Resend')}
                    </button>
                  </div>
                </div>
              )}

              {/* Panel 1b: 6-box OTP Entry */}
              {fgPanel === 'po1' && (
                <div className="text-center">
                  <h2 className="tdr-m-kufi text-lg font-bold mb-1.5">
                    {tr(lang, 'أدخل رمز التحقق', 'Code de vérification', 'Enter Verification Code')}
                  </h2>
                  <p className="text-[13px] mb-3" style={{ color: 'var(--m-muted)' }}>
                    {tr(lang, 'أرسلنا رمزاً من 6 أرقام إلى', 'Code envoyé à', 'Sent 6-digit code to')}
                    <br />
                    <span className="tdr-m-mail-chip">{maskEmailAddress(fgEmail)}</span>
                  </p>

                  <div className={`tdr-m-otp ${fgOtpShake ? 'bad' : ''}`}>
                    {fgOtp.map((val, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpRefs.current[idx] = el;
                        }}
                        inputMode="numeric"
                        maxLength={1}
                        aria-label={`الرقم ${idx + 1}`}
                        value={val}
                        onChange={(e) => {
                          const digit = e.target.value.replace(/\D/g, '').slice(-1);
                          setFgOtpErr('');
                          setFgOtpShake(false);
                          const next = [...fgOtp];
                          next[idx] = digit;
                          setFgOtp(next);
                          if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !fgOtp[idx] && idx > 0) {
                            otpRefs.current[idx - 1]?.focus();
                          }
                          if (e.key === 'Enter') void handleForgotVerifyOtp();
                        }}
                        onPaste={(e) => {
                          const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                          if (!pasted) return;
                          e.preventDefault();
                          const next = ['', '', '', '', '', ''];
                          pasted.split('').forEach((c, k) => {
                            next[k] = c;
                          });
                          setFgOtp(next);
                          otpRefs.current[Math.min(pasted.length, 5)]?.focus();
                        }}
                      />
                    ))}
                  </div>

                  {fgOtpErr && <div className="tdr-m-ferr">{fgOtpErr}</div>}

                  <button
                    type="button"
                    disabled={fgBusy}
                    onClick={() => void handleForgotVerifyOtp()}
                    className="tdr-m-auth-btn full mt-4"
                  >
                    {fgBusy ? <span className="tdr-m-spinner" /> : <span>{tr(lang, 'تأكيد الرمز', 'Valider le code', 'Verify Code')}</span>}
                  </button>

                  <div className="flex items-center justify-between gap-2 text-xs mt-3.5">
                    <button type="button" className="tdr-m-lnk" onClick={() => setFgPanel('pn0')}>
                      {tr(lang, 'تغيير البريد أو الطريقة', 'Changer', 'Change')}
                    </button>
                    <button
                      type="button"
                      disabled={fgTimer > 0}
                      onClick={() => {
                        void handleForgotContinue();
                      }}
                      className="tdr-m-lnk"
                    >
                      {fgTimer > 0
                        ? `${tr(lang, 'إعادة الإرسال بعد', 'Renvoyer dans', 'Resend in')} 0:${String(fgTimer).padStart(2, '0')}`
                        : tr(lang, 'إعادة الإرسال', 'Renvoyer', 'Resend')}
                    </button>
                  </div>
                </div>
              )}

              {/* Panel 2: New Password */}
              {fgPanel === 'pn2' && (
                <div>
                  <h2 className="tdr-m-kufi text-lg font-bold mb-1">
                    {tr(lang, 'كلمة المرور الجديدة', 'Nouveau mot de passe', 'New Password')}
                  </h2>
                  <p className="text-[13px] mb-4" style={{ color: 'var(--m-muted)' }}>
                    {tr(lang, 'اختر كلمة مرور قوية لا تقل عن 8 أحرف.', 'Choisissez au moins 8 caractères.', 'Choose at least 8 characters.')}
                  </p>

                  <div className="tdr-m-auth-field pw">
                    <label className="tdr-m-auth-label" htmlFor="m-np">
                      {tr(lang, 'كلمة المرور الجديدة:', 'Nouveau mot de passe :', 'New password:')}
                    </label>
                    <input
                      id="m-np"
                      type={showFgPw ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="new-password"
                      value={fgNewPw}
                      onChange={(e) => setFgNewPw(e.target.value)}
                    />
                    <button
                      type="button"
                      className="tdr-m-eye"
                      onClick={() => setShowFgPw((p) => !p)}
                    >
                      {showFgPw ? <EyeClosedSvg /> : <EyeOpenSvg />}
                    </button>
                  </div>

                  <div className="tdr-m-meter" data-l={fgStrength}>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>

                  <div className="tdr-m-auth-field pw">
                    <label className="tdr-m-auth-label" htmlFor="m-nc">
                      {tr(lang, 'تأكيد كلمة المرور:', 'Confirmer :', 'Confirm:')}
                    </label>
                    <input
                      id="m-nc"
                      type={showFgConfirm ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="new-password"
                      value={fgNewConfirm}
                      onChange={(e) => setFgNewConfirm(e.target.value)}
                    />
                    <button
                      type="button"
                      className="tdr-m-eye"
                      onClick={() => setShowFgConfirm((p) => !p)}
                    >
                      {showFgConfirm ? <EyeClosedSvg /> : <EyeOpenSvg />}
                    </button>
                    {fgNewErr && <div className="tdr-m-ferr">{fgNewErr}</div>}
                  </div>

                  <button
                    type="button"
                    disabled={fgBusy}
                    onClick={() => void handleForgotSavePassword()}
                    className="tdr-m-auth-btn full"
                  >
                    {fgBusy ? <span className="tdr-m-spinner" /> : <span>{tr(lang, 'حفظ كلمة المرور', 'Enregistrer', 'Save Password')}</span>}
                  </button>
                </div>
              )}

              {/* Panel 3: Done */}
              {fgPanel === 'pd' && (
                <div className="text-center">
                  <svg className="tdr-m-okc" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" />
                    <path d="M20 33l9 9 16-18" />
                  </svg>
                  <h2 className="tdr-m-kufi text-lg font-bold mb-1.5">
                    {tr(lang, 'تم تغيير كلمة المرور', 'Mot de passe modifié', 'Password Updated')}
                  </h2>
                  <p className="text-[13px] mb-4" style={{ color: 'var(--m-muted)' }}>
                    {tr(lang, 'يمكنك الآن تسجيل الدخول بكلمة مرورك الجديدة.', 'Connectez-vous avec votre nouveau mot de passe.', 'You can now sign in with your new password.')}
                  </p>
                  <button type="button" onClick={() => switchView('login')} className="tdr-m-auth-btn full">
                    {tr(lang, 'العودة لتسجيل الدخول', 'Retour à la connexion', 'Back to Login')}
                  </button>
                </div>
              )}
            </div>

            <div className="tdr-m-auth-in" style={{ '--i': 3 } as React.CSSProperties}>
              <button type="button" className="tdr-m-lnk" onClick={() => switchView('login')}>
                {tr(lang, '← العودة لتسجيل الدخول', '← Retour à la connexion', '← Back to Login')}
              </button>
            </div>
          </section>
        )}
      </main>

      {/* First Admin Info Bottom Sheet */}
      <MobileDarkSheet
        open={adminSheetOpen}
        onClose={() => setAdminSheetOpen(false)}
        icon={<ShieldCheck className="w-6 h-6" />}
        title={tr(lang, 'إعداد المدير الأول للمنصة', 'Administration initiale', 'First Admin Setup')}
        description={
          adminStatusInfo?.adminClaimed
            ? tr(
                lang,
                'تم تأمين حساب المدير الأول للمنصة. سجّل الدخول بحساب المدير الرسمي للوصول إلى لوحة الإدارة.',
                'Le compte administrateur principal est déjà configuré. Connectez-vous avec le compte officiel.',
                'Primary administrator account is already claimed. Sign in with the official admin email.'
              )
            : tr(
                lang,
                'جاري التحقق من حالة المدير للمنصة...',
                'Vérification du statut administrateur...',
                'Checking admin setup status...'
              )
        }
      >
        <button
          type="button"
          onClick={() => setAdminSheetOpen(false)}
          className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
        >
          {tr(lang, 'حسناً', 'Compris', 'OK')}
        </button>
      </MobileDarkSheet>
    </div>
  );
};
