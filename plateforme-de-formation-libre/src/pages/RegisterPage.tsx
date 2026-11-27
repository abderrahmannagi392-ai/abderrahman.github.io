import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { CheckCircle2, KeyRound, MailCheck, RefreshCw } from 'lucide-react';
import {
  AuthButton,
  AuthPasswordField,
  AuthShell,
  AuthTitle,
  PasswordStrengthMeter,
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
import { ensureUserDocuments, setPendingSignupOverrides } from '../lib/firestoreService';
import type { Language, LevelSlug } from '../types';
import { apiRequest } from '../utils/api';
import { ALL_USER_LEVEL_OPTIONS, TEACHER_CATEGORY_OPTIONS } from '../utils/levelLabels';
import { tr } from '../utils/locale';

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

export const RegisterPage: React.FC = () => {
  const {
    lang,
    setLang,
    user,
    firebaseUser,
    refreshUser,
    resendVerificationEmail,
    reloadVerificationStatus,
    setSelectedTrack,
    refreshCatalog,
    viewParams,
    navigate,
  } = useApp();
  const t = getT(lang);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [track, setTrack] = useState<'arabic' | 'french' | 'bilingual'>('bilingual');
  const [prefLang, setPrefLang] = useState<Language>(lang);
  const [level, setLevel] = useState<LevelSlug>('foundation');
  const [teacherCategory, setTeacherCategory] = useState<'bilingual' | 'arabic' | 'french'>('bilingual');
  const [professorSpecialty, setProfessorSpecialty] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [referralCode, setReferralCode] = useState<string>(() => {
    try {
      return localStorage.getItem('tadribi_pending_ref') || '';
    } catch {
      return '';
    }
  });
  const [referralCheck, setReferralCheck] = useState<{
    status: 'idle' | 'valid' | 'invalid';
    referrerName?: string;
  }>({ status: 'idle' });

  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertKey, setAlertKey] = useState(0);

  // Post-registration Email Verification Step
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyMethod, setVerifyMethod] = useState<'link' | 'otp'>('link');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyEmailError, setVerifyEmailError] = useState<string | null>(null);
  const [verifyFeedback, setVerifyFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const iv = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [cooldown]);

  useEffect(() => {
    const clean = referralCode.trim().toUpperCase();
    if (!clean) {
      setReferralCheck({ status: 'idle' });
      try {
        localStorage.removeItem('tadribi_pending_ref');
      } catch {
        // ignore
      }
      return;
    }
    try {
      localStorage.setItem('tadribi_pending_ref', clean);
    } catch {
      // ignore
    }
    if (clean.length < 4) {
      setReferralCheck({ status: 'idle' });
      return;
    }
    const timer = window.setTimeout(() => {
      apiRequest<{ valid: boolean; referrerName?: string }>(
        `/api/referrals/validate?code=${encodeURIComponent(clean)}`
      )
        .then((res) => {
          if (res.valid) {
            setReferralCheck({ status: 'valid', referrerName: res.referrerName });
          } else {
            setReferralCheck({ status: 'invalid' });
          }
        })
        .catch(() => setReferralCheck({ status: 'idle' }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [referralCode]);

  const showAlertError = (msg: string) => {
    setError(null);
    window.requestAnimationFrame(() => {
      setAlertKey((k) => k + 1);
      setError(msg);
    });
  };

  if (verifyPending || (user && firebaseUser && !(firebaseUser.emailVerified || user.email_verified))) {
    const targetEmail = user?.email || firebaseUser?.email || email;

    const handleResend = async () => {
      if (cooldown > 0 || busy) return;
      setBusy(true);
      setVerifyFeedback(null);
      setVerifyEmailError(null);
      const res = await resendVerificationEmail();
      setBusy(false);
      if (res.ok) {
        setCooldown(45);
        await apiRequest('/api/auth/action-tokens/issue', {
          method: 'POST',
          json: { purpose: 'email_verify', email: targetEmail },
        }).catch(() => {});
        setVerifyFeedback({
          text:
            lang === 'ar'
              ? 'تم إرسال رابط التفعيل بنجاح (صالح لمدة 5 دقائق فقط). تحقق من صندوق الوارد أو الرسائل غير المرغوب فيها.'
              : 'Lien de vérification envoyé (valable 5 minutes). Vérifiez votre boîte de réception ou spams.',
          ok: true,
        });
      } else {
        setVerifyEmailError(
          res.error ||
            (lang === 'ar' ? 'تعذر إرسال رابط التفعيل حالياً.' : 'Impossible d’envoyer le lien.')
        );
      }
    };

    const handleSendEmailOtp = async () => {
      if (cooldown > 0 || busy) return;
      setBusy(true);
      setVerifyFeedback(null);
      setVerifyEmailError(null);
      try {
        await apiRequest('/api/auth/email-otp/send', {
          method: 'POST',
          json: { lang },
        });
        setOtpSent(true);
        setCooldown(45);
        setVerifyFeedback({
          text:
            lang === 'ar'
              ? 'تم إرسال رمز تحقق من 6 أرقام إلى بريدك الإلكتروني.'
              : 'Un code à 6 chiffres a été envoyé à votre adresse e-mail.',
          ok: true,
        });
      } catch (err: any) {
        setVerifyEmailError(
          err?.message ||
            (lang === 'ar' ? 'تعذر إرسال رمز التحقق حالياً.' : 'Impossible d’envoyer le code.')
        );
      } finally {
        setBusy(false);
      }
    };

    const handleVerifyEmailOtp = async (overrideCode?: string) => {
      const code = (overrideCode || otpCode).trim();
      if (!/^\d{6}$/.test(code) || busy) return;
      setBusy(true);
      setVerifyFeedback(null);
      setVerifyEmailError(null);
      try {
        await apiRequest('/api/auth/email-otp/verify', {
          method: 'POST',
          json: { otp: code },
        });
        await refreshUser();
        await reloadVerificationStatus();
        await refreshCatalog();
        navigate(viewParams.planId ? 'checkout' : 'dashboard', viewParams.planId ? { planId: viewParams.planId } : {});
      } catch (err: any) {
        setVerifyFeedback({
          text: err?.message || (lang === 'ar' ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Code invalide ou expiré.'),
          ok: false,
        });
      } finally {
        setBusy(false);
      }
    };

    const handleVerifyCheck = async () => {
      setBusy(true);
      setVerifyFeedback(null);
      const res = await reloadVerificationStatus();
      setBusy(false);
      if (res.verified) {
        await refreshCatalog();
        navigate(viewParams.planId ? 'checkout' : 'dashboard', viewParams.planId ? { planId: viewParams.planId } : {});
      } else {
        setVerifyFeedback({
          text:
            res.error ||
            (lang === 'ar'
              ? 'لم يتم تأكيد البريد بعد. افتح الرابط المرسل في بريدك ثم اضغط تحقق الآن.'
              : 'E-mail non encore vérifié. Cliquez sur le lien reçu puis réessayez.'),
          ok: false,
        });
      }
    };

    return (
      <AuthShell>
        <AuthTitle style={{ fontSize: '1.7rem' }}>
          {lang === 'ar' ? 'تأكيد البريد الإلكتروني' : 'Vérification de l’e-mail'}
        </AuthTitle>
        <div className="tag in" style={{ '--i': 1 } as React.CSSProperties}>
          {lang === 'ar' ? 'خطوة أخيرة لتفعيل حسابك.' : 'Dernière étape pour activer votre compte.'}
        </div>
        <div className="box in text-center space-y-4" style={{ '--i': 2 } as React.CSSProperties}>
          <MailCheck className="w-12 h-12 text-[#7c9e1c] mx-auto" />
          <div className="font-bold text-sm" dir="ltr">
            {targetEmail}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setVerifyMethod('link');
                setVerifyFeedback(null);
                setVerifyEmailError(null);
              }}
              className={`py-2 px-3 rounded-[6px] border font-bold cursor-pointer ${
                verifyMethod === 'link'
                  ? 'bg-[#384D55] text-white border-[#384D55]'
                  : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
              }`}
            >
              {lang === 'ar' ? '1. إرسال رابط التحقق' : '1. Lien de vérification'}
            </button>
            <button
              type="button"
              onClick={() => {
                setVerifyMethod('otp');
                setVerifyFeedback(null);
                setVerifyEmailError(null);
              }}
              className={`py-2 px-3 rounded-[6px] border font-bold inline-flex items-center justify-center gap-1 cursor-pointer ${
                verifyMethod === 'otp'
                  ? 'bg-[#384D55] text-white border-[#384D55]'
                  : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? '2. إرسال رمز التحقق' : '2. Code à 6 chiffres'}</span>
            </button>
          </div>

          {verifyEmailError ? (
            <div className="p-3 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {verifyEmailError}
            </div>
          ) : (
            <p className="text-xs opacity-80 leading-relaxed">
              {verifyMethod === 'link'
                ? lang === 'ar'
                  ? 'تم إنشاء الحساب وأرسلنا رابط التحقق إلى بريدك الإلكتروني (صالح لمدة 5 دقائق). افتح الرابط ثم اضغط «تحقق الآن».'
                  : 'Compte créé. Ouvrez le lien envoyé par e-mail (valable 5 minutes) puis validez ci-dessous.'
                : lang === 'ar'
                  ? 'اطلب رمز تحقق من 6 أرقام عبر البريد وأدخله مباشرة لتأكيد حسابك فوراً.'
                  : 'Demandez un code OTP à 6 chiffres par e-mail et saisissez-le ci-dessous.'}
            </p>
          )}
          {verifyFeedback && (
            <div
              className={`p-2.5 rounded-[4px] border text-xs font-bold ${
                verifyFeedback.ok
                  ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {verifyFeedback.text}
            </div>
          )}

          {verifyMethod === 'link' ? (
            <div className="flex flex-col gap-2.5 pt-1">
              <AuthButton type="button" full loading={busy} onClick={() => void handleVerifyCheck()}>
                <RefreshCw className="w-4 h-4" />
                <span>{lang === 'ar' ? 'لقد أكدت البريد — تحقق الآن' : 'J’ai vérifié — Continuer'}</span>
              </AuthButton>
              <button
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => void handleResend()}
                className="lnk text-xs"
              >
                {cooldown > 0
                  ? lang === 'ar'
                    ? `إعادة إرسال رابط التفعيل بعد ${cooldown} ثانية`
                    : `Renvoyer dans ${cooldown}s`
                  : lang === 'ar'
                    ? 'إرسال / إعادة إرسال رابط التفعيل'
                    : 'Renvoyer l’e-mail de vérification'}
              </button>
              <button
                type="button"
                onClick={() => navigate('lessons')}
                className="lnk text-xs opacity-75"
              >
                {lang === 'ar' ? 'تصفح الدروس مؤقتاً' : 'Parcourir les leçons en attendant'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              {otpSent && (
                <div className="space-y-3">
                  <OtpSixDigitInput
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={busy}
                    onComplete={(c) => void handleVerifyEmailOtp(c)}
                    idPrefix="register-email-otp"
                  />
                  <AuthButton
                    type="button"
                    full
                    loading={busy}
                    disabled={otpCode.length < 6}
                    onClick={() => void handleVerifyEmailOtp()}
                  >
                    {lang === 'ar' ? 'تأكيد الرمز وتفعيل الحساب' : 'Valider le code OTP'}
                  </AuthButton>
                </div>
              )}
              <AuthButton
                type="button"
                full
                loading={busy && !otpSent}
                disabled={busy || cooldown > 0}
                onClick={() => void handleSendEmailOtp()}
              >
                {cooldown > 0
                  ? lang === 'ar'
                    ? `إعادة إرسال الرمز بعد ${cooldown} ثانية`
                    : `Renvoyer dans ${cooldown}s`
                  : otpSent
                    ? lang === 'ar'
                      ? 'إعادة إرسال رمز التحقق'
                      : 'Renvoyer le code OTP'
                    : lang === 'ar'
                      ? 'إرسال رمز تحقق من 6 أرقام'
                      : 'Envoyer un code à 6 chiffres'}
              </AuthButton>
            </div>
          )}
        </div>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell>
        <AuthTitle style={{ fontSize: '1.7rem' }}>
          {lang === 'ar' ? 'أهلاً وسهلاً' : 'Bienvenue'}
        </AuthTitle>
        <div className="tag in" style={{ '--i': 1 } as React.CSSProperties}>
          {lang === 'ar' ? 'خطوة واحدة نحو مسارك.' : 'Un pas vers votre parcours.'}
        </div>
        <div className="box in text-center space-y-4" style={{ '--i': 2 } as React.CSSProperties}>
          <CheckCircle2 className="w-11 h-11 text-[#7c9e1c] mx-auto" />
          <div className="font-bold text-base">{user.name}</div>
          <p className="text-xs opacity-75">
            {lang === 'ar' ? 'حسابك نشط ومفعّل بالكامل.' : 'Votre compte est déjà actif et vérifié.'}
          </p>
          <AuthButton type="button" onClick={() => navigate('dashboard')}>
            {t.navDashboard}
          </AuthButton>
        </div>
      </AuthShell>
    );
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      showAlertError(lang === 'ar' ? 'يرجى إدخال الاسم الكامل.' : 'Veuillez saisir votre nom complet.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showAlertError(lang === 'ar' ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Format d’e-mail invalide.');
      return;
    }
    if (password.length < 6) {
      showAlertError(
        lang === 'ar'
          ? 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.'
          : 'Le mot de passe doit contenir au moins 6 caractères.'
      );
      return;
    }
    if (password !== confirmPassword) {
      showAlertError(
        lang === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Les mots de passe ne correspondent pas.'
      );
      return;
    }
    if (!acceptedPrivacy || !acceptedTerms) {
      showAlertError(
        lang === 'ar'
          ? 'يجب الموافقة على سياسة الخصوصية واتفاقية الاستخدام قبل إنشاء الحساب.'
          : 'Veuillez accepter la politique de confidentialité et les conditions d’utilisation.'
      );
      return;
    }

    setBusy(true);
    setError(null);
    setVerifyEmailError(null);
    try {
      const nowIso = new Date().toISOString();
      const signupOverrides = {
        name: name.trim(),
        track,
        preferredLang: prefLang,
        level,
        profileCompleted: true,
        authProvider: 'password',
        acceptedTermsAt: nowIso,
        acceptedPrivacyAt: nowIso,
      };
      setPendingSignupOverrides(email.trim().toLowerCase(), signupOverrides);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await ensureUserDocuments(cred.user, signupOverrides);

      auth.languageCode = prefLang;
      try {
        await sendEmailVerification(cred.user);
        setCooldown(45);
        await apiRequest('/api/auth/action-tokens/issue', {
          method: 'POST',
          json: { purpose: 'email_verify', email: email.trim() },
        }).catch(() => {});
      } catch (mailErr) {
        setVerifyEmailError(translateFirebaseAuthError(mailErr, lang));
      }

      const cleanRef = referralCode.trim().toUpperCase();
      if (cleanRef) {
        try {
          localStorage.setItem('tadribi_pending_ref', cleanRef);
        } catch {
          // ignore
        }
      }

      setSelectedTrack(track);
      setLang(prefLang);
      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        json: {
          name: name.trim(),
          track,
          preferred_lang: prefLang,
          level,
          teacher_category: level === 'teacher' ? teacherCategory : '',
          professor_specialty: level === 'professor' ? professorSpecialty.trim() : '',
        },
      }).catch(() => {});
      await refreshUser();
      setVerifyPending(true);
    } catch (err) {
      showAlertError(translateFirebaseAuthError(err, lang));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await ensureUserDocuments(cred.user, {
        track,
        preferredLang: prefLang,
        level,
        authProvider: 'google.com',
      });
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
      await refreshCatalog();
      if (profile.profileCompleted === false && !profile.isAdmin) {
        navigate('account-complete');
        return;
      }
      if (viewParams.redirectView === 'verify-receipt' && viewParams.receiptId && viewParams.receiptSig) {
        navigate('verify-receipt', { receiptId: viewParams.receiptId, receiptSig: viewParams.receiptSig });
      } else {
        navigate(
          viewParams.planId ? 'checkout' : 'dashboard',
          viewParams.planId ? { planId: viewParams.planId } : {}
        );
      }
    } catch (err) {
      showAlertError(translateFirebaseAuthError(err, lang));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleAppleSignUp = async () => {
    setAppleBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, appleProvider);
      const profile = await ensureUserDocuments(cred.user, {
        track,
        preferredLang: prefLang,
        level,
        authProvider: 'apple.com',
      });
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
      await refreshCatalog();
      if (profile.profileCompleted === false && !profile.isAdmin) {
        navigate('account-complete');
        return;
      }
      if (viewParams.redirectView === 'verify-receipt' && viewParams.receiptId && viewParams.receiptSig) {
        navigate('verify-receipt', { receiptId: viewParams.receiptId, receiptSig: viewParams.receiptSig });
      } else {
        navigate(
          viewParams.planId ? 'checkout' : 'dashboard',
          viewParams.planId ? { planId: viewParams.planId } : {}
        );
      }
    } catch (err) {
      showAlertError(translateFirebaseAuthError(err, lang));
    } finally {
      setAppleBusy(false);
    }
  };

  return (
    <AuthShell>
      <p className="fr in" style={{ '--i': 0 } as React.CSSProperties}>
        <button
          type="button"
          className="lnk"
          onClick={() => setLang(lang === 'ar' ? 'fr' : lang === 'fr' ? 'en' : 'ar')}
        >
          <b>{tr(lang, 'Cliquez ici', 'Click here', 'اضغط هنا')}</b>
        </button>{' '}
        {tr(lang, 'Pour le français / English', 'For English', 'للغة العربية')}
      </p>

      <AuthTitle style={{ '--i': 1, fontSize: '1.7rem' } as React.CSSProperties}>
        {tr(lang, 'إنشاء حساب جديد', 'Créer un nouveau compte', 'Create a New Account')}
      </AuthTitle>

      <div className="tag in" style={{ '--i': 2 } as React.CSSProperties}>
        {tr(lang, 'خطوة واحدة نحو مسارك.', 'Un pas vers votre parcours.', 'One step toward your path.')}
      </div>

      <div key={alertKey} className={`alert in ${error ? 'show' : ''}`} style={{ '--i': 2 } as React.CSSProperties}>
        <div>
          <p>
            <span>{error || ''}</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 7v6M12 16.5v.5" />
            </svg>
          </p>
        </div>
      </div>

      <form className="box in" style={{ '--i': 3 } as React.CSSProperties} noValidate onSubmit={handleRegister}>
        <div className="field">
          <label htmlFor="sn">{lang === 'ar' ? 'الاسم الكامل:' : 'Nom complet :'}</label>
          <input
            id="sn"
            type="text"
            autoComplete="name"
            placeholder={lang === 'ar' ? 'محمد أحمد سالم' : 'Mohamed Ahmed'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="se">{lang === 'ar' ? 'بريدك الإلكتروني:' : 'Votre e-mail :'}</label>
          <input
            id="se"
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder="exemple@formation-libre.mr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <AuthPasswordField
          id="sp"
          label={lang === 'ar' ? 'كلمة المرور:' : 'Mot de passe :'}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={6}
          ariaShowLabel={lang === 'ar' ? 'إظهار كلمة المرور' : 'Afficher le mot de passe'}
          ariaHideLabel={lang === 'ar' ? 'إخفاء كلمة المرور' : 'Masquer le mot de passe'}
        />

        <PasswordStrengthMeter password={password} />

        <AuthPasswordField
          id="sc"
          label={lang === 'ar' ? 'تأكيد كلمة المرور:' : 'Confirmer le mot de passe :'}
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={6}
          ariaShowLabel={lang === 'ar' ? 'إظهار كلمة المرور' : 'Afficher le mot de passe'}
          ariaHideLabel={lang === 'ar' ? 'إخفاء كلمة المرور' : 'Masquer le mot de passe'}
        />

        <div className="selects">
          <div>
            <label htmlFor="s1">{t.navTracks}:</label>
            <select id="s1" value={track} onChange={(e) => setTrack(e.target.value as any)}>
              <option value="bilingual">{t.trackBilingual}</option>
              <option value="arabic">{t.trackArabic}</option>
              <option value="french">{t.trackFrench}</option>
            </select>
          </div>

          <div>
            <label htmlFor="s2">{tr(lang, 'المستوى / الصفة:', 'Niveau / Statut :', 'Level / Role:')}</label>
            <select id="s2" value={level} onChange={(e) => setLevel(e.target.value as LevelSlug)}>
              {ALL_USER_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {lang === 'fr' ? opt.fr : lang === 'en' ? opt.en : opt.ar}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="s3">{tr(lang, 'اللغة:', 'Langue :', 'Language:')}</label>
            <select id="s3" value={prefLang} onChange={(e) => setPrefLang(e.target.value as Language)}>
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {level === 'teacher' && (
          <div className="field">
            <label htmlFor="stc">{tr(lang, 'التخصص التعليمي للمعلم:', 'Spécialité enseignant :', 'Teacher Track:')}</label>
            <select
              id="stc"
              value={teacherCategory}
              onChange={(e) => setTeacherCategory(e.target.value as 'bilingual' | 'arabic' | 'french')}
            >
              {TEACHER_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {lang === 'fr' ? opt.fr : lang === 'en' ? opt.en : opt.ar}
                </option>
              ))}
            </select>
          </div>
        )}

        {level === 'professor' && (
          <div className="field">
            <label htmlFor="sps">{tr(lang, 'تخصص الأستاذ (المادة / الشعبة):', 'Spécialité du professeur :', 'Professor Specialty:')}</label>
            <input
              id="sps"
              type="text"
              placeholder={lang === 'ar' ? 'مثال: الرياضيات / الفيزياء / الأدب العربي' : 'Ex : Mathématiques / Physique'}
              value={professorSpecialty}
              onChange={(e) => setProfessorSpecialty(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="sref">
            {tr(lang, 'كود الإحالة (اختياري):', 'Code de parrainage (optionnel) :', 'Referral code (optional):')}
          </label>
          <input
            id="sref"
            type="text"
            dir="ltr"
            placeholder="TD-XXXXXXXX"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
          />
          {referralCheck.status === 'valid' && (
            <div className="text-[11px] font-bold text-[#557a16] mt-1">
              {tr(
                lang,
                `كود إحالة صحيح (${referralCheck.referrerName || 'مستخدم مسجل'})`,
                `Code valide (${referralCheck.referrerName || 'membre'})`,
                `Valid code (${referralCheck.referrerName || 'member'})`
              )}
            </div>
          )}
          {referralCheck.status === 'invalid' && (
            <div className="text-[11px] font-bold text-red-700 mt-1">
              {tr(
                lang,
                'كود الإحالة غير موجود أو غير نشط حالياً.',
                'Code de parrainage introuvable.',
                'Referral code not found.'
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 mb-4 text-xs">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              className="mt-0.5 accent-[#83a329]"
            />
            <span>
              {tr(lang, 'أوافق على ', 'J’accepte la ', 'I agree to the ')}
              <button
                type="button"
                onClick={() => navigate('privacy')}
                className="lnk font-bold underline"
              >
                {t.navPrivacy}
              </button>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 accent-[#83a329]"
            />
            <span>
              {tr(lang, 'أوافق على ', 'J’accepte les ', 'I accept the ')}
              <button
                type="button"
                onClick={() => navigate('terms')}
                className="lnk font-bold underline"
              >
                {t.navTerms}
              </button>
            </span>
          </label>
        </div>

        <div className="actions">
          <AuthButton type="submit" loading={busy} disabled={googleBusy || appleBusy}>
            {t.register}
          </AuthButton>
          <span>
            {tr(lang, 'لديك حساب؟ ', 'Vous avez déjà un compte ? ', 'Already have an account? ')}
            <button type="button" className="lnk" onClick={() => navigate('login', viewParams)}>
              {t.login}
            </button>
          </span>
        </div>

        <div className="or-sep">
          <span>{tr(lang, 'أو', 'ou', 'or')}</span>
        </div>

        <button
          type="button"
          className="btn-google"
          disabled={busy || googleBusy || appleBusy}
          onClick={() => void handleGoogleSignUp()}
        >
          <GoogleMark />
          <span>
            {googleBusy
              ? t.loading
              : tr(lang, 'التسجيل السريع عبر Google', 'S’inscrire avec Google', 'Sign up with Google')}
          </span>
        </button>

        <button
          type="button"
          className="btn-google mt-2.5"
          disabled={busy || googleBusy || appleBusy}
          onClick={() => void handleAppleSignUp()}
        >
          <AppleMark />
          <span>
            {appleBusy
              ? t.loading
              : tr(lang, 'التسجيل السريع عبر Apple', 'S’inscrire avec Apple', 'Sign up with Apple')}
          </span>
        </button>
      </form>
    </AuthShell>
  );
};
