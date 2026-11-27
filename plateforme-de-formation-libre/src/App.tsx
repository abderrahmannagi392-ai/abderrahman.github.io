/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KeyRound, MailCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { OtpSixDigitInput } from './components/OtpSixDigitInput';
import { UpgradePromptModal } from './components/UpgradePromptModal';
import { AppProvider, useApp } from './context/AppContext';
import { apiRequest } from './utils/api';
import { AccountCompletionPage } from './pages/AccountCompletionPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AllSubjectsPage } from './pages/AllSubjectsPage';
import { BaccalaureatePage } from './pages/BaccalaureatePage';
import { DashboardPage } from './pages/DashboardPage';
import { ExamCenterPage } from './pages/ExamCenterPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HomePage } from './pages/HomePage';
import { InfoPages } from './pages/InfoPages';
import { LessonsPage } from './pages/LessonsPage';
import { LoginPage } from './pages/LoginPage';
import { MobileAppPage } from './pages/MobileAppPage';
import { isPhoneDevice } from './lib/deviceMode';
import { NotificationsPage } from './pages/NotificationsPage';
import { PaymentCheckoutPage } from './pages/PaymentCheckoutPage';
import { ProfilePage } from './pages/ProfilePage';
import { PublicSectionPage } from './pages/PublicSectionPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportIssuePage } from './pages/ReportIssuePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ReviewCenterPage } from './pages/ReviewCenterPage';
import { SchoolDashboardPage } from './pages/SchoolDashboardPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { SummariesPage } from './pages/SummariesPage';
import { SupportPage } from './pages/SupportPage';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage';
import { VerifyReceiptPage } from './pages/VerifyReceiptPage';

const EmailVerificationGateBanner: React.FC = () => {
  const {
    lang,
    firebaseUser,
    user,
    resendVerificationEmail,
    reloadVerificationStatus,
    refreshUser,
    requestLogout,
  } = useApp();
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [verifyMode, setVerifyMode] = useState<'link' | 'otp'>('link');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  if (!firebaseUser || !user || firebaseUser.emailVerified || user.email_verified) return null;

  const startCooldown = () => {
    setCooldown(45);
    const iv = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          window.clearInterval(iv);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setFeedback(null);
    const res = await resendVerificationEmail();
    setBusy(false);
    if (res.ok) {
      setFeedback({
        text:
          lang === 'ar'
            ? 'تم إرسال رابط التفعيل إلى بريدك الإلكتروني بنجاح. تحقق من البريد الوارد أو الرسائل غير المرغوب فيها.'
            : 'E-mail de vérification envoyé avec succès. Vérifiez votre boîte de réception ou spams.',
        ok: true,
      });
      startCooldown();
    } else {
      setFeedback({
        text:
          res.error ||
          (lang === 'ar' ? 'تعذر إرسال رابط التفعيل.' : 'Impossible d’envoyer le lien.'),
        ok: false,
      });
    }
  };

  const handleSendOtp = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ ok: boolean; error?: string }>('/api/auth/email-otp/send', {
        method: 'POST',
        json: { lang },
      });
      if (res.ok) {
        setOtpSent(true);
        startCooldown();
        setFeedback({
          text:
            lang === 'ar'
              ? 'تم إرسال رمز التحقق المكوّن من 6 أرقام إلى بريدك الإلكتروني.'
              : 'Code OTP à 6 chiffres envoyé par e-mail.',
          ok: true,
        });
      }
    } catch (err: any) {
      setFeedback({
        text: err?.message || (lang === 'ar' ? 'تعذر إرسال رمز التحقق.' : 'Échec de l’envoi du code.'),
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const code = (codeOverride || otpCode).trim();
    if (!/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest('/api/auth/email-otp/verify', {
        method: 'POST',
        json: { otp: code },
      });
      await refreshUser();
      await reloadVerificationStatus();
      setFeedback({
        text: lang === 'ar' ? 'تم تأكيد البريد الإلكتروني بنجاح!' : 'E-mail vérifié avec succès !',
        ok: true,
      });
    } catch (err: any) {
      setFeedback({
        text: err?.message || (lang === 'ar' ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Code OTP invalide.'),
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setBusy(true);
    setFeedback(null);
    const res = await reloadVerificationStatus();
    setBusy(false);
    if (!res.verified) {
      setFeedback({
        text:
          res.error ||
          (lang === 'ar'
            ? 'لم يتم تأكيد البريد الإلكتروني بعد. افتح الرابط المرسل إلى بريدك ثم أعد الفحص.'
            : 'E-mail non encore vérifié. Cliquez sur le lien reçu puis réessayez.'),
        ok: false,
      });
    }
  };

  return (
    <div className="bg-[#fff8e6] border-b border-[#e8cf86] px-4 py-3 text-xs text-[#544006]">
      <div className="max-w-[1200px] mx-auto space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <MailCheck className="w-4 h-4 text-[#9a7209] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">
                {lang === 'ar'
                  ? 'حسابك بانتظار تأكيد البريد الإلكتروني:'
                  : 'Votre compte attend la vérification par e-mail :'}{' '}
              </span>
              <span dir="ltr" className="font-mono font-bold">
                {user.email}
              </span>
              <span className="ms-1">
                {lang === 'ar'
                  ? 'اختر وسيلة التحقق المناسبة لتفعيل المزايا الكاملة:'
                  : 'Choisissez la méthode de vérification :'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setVerifyMode('link');
                setFeedback(null);
              }}
              className={`px-2.5 py-1 rounded-[4px] border font-bold cursor-pointer ${
                verifyMode === 'link'
                  ? 'bg-[#384D55] text-white border-[#384D55]'
                  : 'bg-white text-[#544006] border-[#d1b45a]'
              }`}
            >
              {lang === 'ar' ? '1. إرسال رابط التحقق' : '1. Lien de vérification'}
            </button>
            <button
              type="button"
              onClick={() => {
                setVerifyMode('otp');
                setFeedback(null);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border font-bold cursor-pointer ${
                verifyMode === 'otp'
                  ? 'bg-[#384D55] text-white border-[#384D55]'
                  : 'bg-white text-[#544006] border-[#d1b45a]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? '2. إرسال رمز التحقق' : '2. Code OTP'}</span>
            </button>
            <button
              type="button"
              onClick={() => requestLogout()}
              className="underline font-bold text-[#6b5514] cursor-pointer"
            >
              {lang === 'ar' ? 'تسجيل الخروج' : 'Déconnexion'}
            </button>
          </div>
        </div>

        {verifyMode === 'link' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={handleCheck}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] bg-[#384D55] text-white font-bold cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>{lang === 'ar' ? 'تم التفعيل — تحقق الآن' : 'J’ai vérifié'}</span>
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={handleResend}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] bg-white border border-[#d1b45a] text-[#544006] font-bold cursor-pointer disabled:opacity-60"
            >
              {cooldown > 0
                ? lang === 'ar'
                  ? `إعادة الإرسال (${cooldown}ث)`
                  : `Renvoyer (${cooldown}s)`
                : lang === 'ar'
                  ? 'إرسال / إعادة إرسال رابط التفعيل'
                  : 'Envoyer le lien'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void handleSendOtp()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] bg-white border border-[#d1b45a] text-[#544006] font-bold cursor-pointer disabled:opacity-60"
            >
              {cooldown > 0
                ? lang === 'ar'
                  ? `إعادة إرسال الرمز (${cooldown}ث)`
                  : `Renvoyer (${cooldown}s)`
                : otpSent
                  ? lang === 'ar'
                    ? 'إعادة إرسال رمز من 6 أرقام'
                    : 'Renvoyer le code'
                  : lang === 'ar'
                    ? 'إرسال رمز التحقق الآن'
                    : 'Envoyer le code'}
            </button>
            {otpSent && (
              <>
                <OtpSixDigitInput
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={busy}
                  onComplete={(c) => void handleVerifyOtp(c)}
                  idPrefix="banner-email-otp"
                />
                <button
                  type="button"
                  disabled={busy || otpCode.length < 6}
                  onClick={() => void handleVerifyOtp()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] bg-[#384D55] text-white font-bold cursor-pointer disabled:opacity-60"
                >
                  {lang === 'ar' ? 'تأكيد الرمز' : 'Valider le code'}
                </button>
              </>
            )}
          </div>
        )}

        {feedback && (
          <div className={`font-bold ${feedback.ok ? 'text-[#4e8b1f]' : 'text-red-700'}`}>
            {feedback.text}
          </div>
        )}
      </div>
    </div>
  );
};

// Views that stay on the web page even on a phone (opened from e-mail links or shared links).
const PHONE_WEB_VIEWS: string[] = ['reset-password', 'verify-receipt', 'section-view'];

const MainRouter: React.FC = () => {
  const { currentView, bootLoading, lang, user, authDisabledNotice, clearAuthDisabledNotice } =
    useApp();

  // Phones and the native app always get the mobile app; computers get the website.
  const showMobileApp =
    currentView === 'mobile' || (isPhoneDevice() && !PHONE_WEB_VIEWS.includes(currentView));

  if (bootLoading) {
    if (showMobileApp) {
      return (
        <div
          className="min-h-dvh flex flex-col items-center justify-center gap-3 font-bold text-sm"
          style={{
            background: '#ffffff',
            color: '#55720f',
            fontFamily: '"Reem Kufi", "Noto Sans Arabic", sans-serif',
          }}
        >
          <span
            className="text-2xl font-bold"
            style={{ color: '#3a4650', fontFamily: '"Reem Kufi", sans-serif' }}
          >
            تدريبي
          </span>
          <span
            className="w-24 h-1 rounded-full overflow-hidden"
            style={{ background: '#e6f2c4' }}
          >
            <span
              className="block h-full w-1/2 rounded-full animate-pulse"
              style={{ background: '#a4cc39' }}
            />
          </span>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f7] text-[#384D55] font-bold text-sm">
        {lang === 'ar' ? 'جارٍ تحميل منصة التدريب الحر...' : 'Chargement de la plateforme...'}
      </div>
    );
  }

  if (showMobileApp) {
    return <MobileAppPage />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <HomePage />;
      case 'all-subjects':
        return <AllSubjectsPage />;
      case 'lessons':
        return <LessonsPage />;
      case 'summaries':
        return <SummariesPage />;
      case 'question-bank':
        return <QuestionBankPage />;
      case 'review-center':
        return <ReviewCenterPage />;
      case 'exams':
        return <ExamCenterPage />;
      case 'baccalaureate':
        return <BaccalaureatePage />;
      case 'favorites':
        return <FavoritesPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'report':
        return <ReportIssuePage />;
      case 'dashboard':
        return <DashboardPage />;
      case 'profile':
        return <ProfilePage />;
      case 'account-complete':
        return <AccountCompletionPage />;
      case 'support':
        return <SupportPage />;
      case 'about':
        return <InfoPages mode="about" />;
      case 'privacy':
        return <InfoPages mode="privacy" />;
      case 'terms':
        return <InfoPages mode="terms" />;
      case 'contact':
        return <InfoPages mode="contact" />;
      case 'teacher-dashboard':
        return <TeacherDashboardPage />;
      case 'section-view':
        return <PublicSectionPage />;
      case 'school-dashboard':
        return <SchoolDashboardPage />;
      case 'admin':
        return user?.isAdmin || (user?.permissions && user.permissions.length > 0) ? (
          <AdminDashboardPage />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-12">
            <div className="bg-white border border-[#d8dfe2] p-8 text-center space-y-3 rounded-[4px]">
              <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
              <h1 className="text-lg font-extrabold text-[#384D55]">
                {lang === 'ar' ? 'وصول مقيّد بالإدارة الرسمية فقط' : 'Accès strictement réservé'}
              </h1>
              <p className="text-xs text-[#6b787e]">
                {lang === 'ar'
                  ? 'لوحة الإدارة متاحة فقط لحساب المدير الرسمي أو المشرفين المفوضين.'
                  : 'Ce panneau est exclusivement réservé à l’administrateur officiel et aux modérateurs autorisés.'}
              </p>
            </div>
          </div>
        );
      case 'login':
        return <LoginPage initialMode="login" />;
      case 'forgot-password':
        return <LoginPage initialMode="forgot" />;
      case 'reset-password':
        return <ResetPasswordPage />;
      case 'verify-receipt':
        return <VerifyReceiptPage />;
      case 'register':
        return <RegisterPage />;
      case 'subscriptions':
        return <SubscriptionsPage />;
      case 'checkout':
        return <PaymentCheckoutPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <Layout>
      {authDisabledNotice && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-800 flex items-center justify-between max-w-[1200px] mx-auto">
          <span className="font-bold">{authDisabledNotice}</span>
          <button
            type="button"
            onClick={clearAuthDisabledNotice}
            className="font-bold underline cursor-pointer"
          >
            {lang === 'ar' ? 'إغلاق' : 'Fermer'}
          </button>
        </div>
      )}
      <EmailVerificationGateBanner />
      {renderView()}
      <UpgradePromptModal />
    </Layout>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
