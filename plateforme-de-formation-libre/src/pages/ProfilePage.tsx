import React, { useCallback, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  Award,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  FileText,
  Gift,
  Image as ImageIcon,
  KeyRound,
  Laptop,
  LogOut,
  MailWarning,
  MapPin,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Save,
  Share2,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import { auth, translateFirebaseAuthError } from '../lib/firebase';
import {
  fetchMyPrivateInfoDoc,
  updateMyPrivateContactDoc,
  updateMyProfileDoc,
} from '../lib/firestoreService';
import type {
  Language,
  LevelSlug,
  PaymentTransaction,
  ReferralSummary,
  SubscriptionRequest,
  UserSessionItem,
  VerificationRequestItem,
} from '../types';
import { apiRequest, getAuthToken, resolveApiUrl } from '../utils/api';
import {
  ALL_USER_LEVEL_OPTIONS,
  PROFESSOR_SPECIALTY_OPTIONS,
  TEACHER_CATEGORY_OPTIONS,
  formatUserLevelLabel,
} from '../utils/levelLabels';
import { localeCode, tr } from '../utils/locale';
import {
  downloadStudentReceiptJpg,
  downloadStudentReceiptPdf,
  printStudentReceipt,
  type PrintableReceiptData,
} from '../utils/receiptDocument';

const SubscribedBlueBadge: React.FC<{ title: string }> = ({ title }) => (
  <span
    title={title}
    aria-label={title}
    className="inline-flex items-center justify-center shrink-0 align-middle"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#1D9BF0" />
      <path
        d="M8.5 12.4l2.3 2.3 4.8-5.1"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

export const ProfilePage: React.FC = () => {
  const {
    lang,
    setLang,
    user,
    firebaseUser,
    refreshUser,
    setSelectedTrack,
    goToAuth,
    navigate,
    requestLogout,
  } = useApp();
  const t = getT(lang);
  const isAr = lang === 'ar';

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [wilaya, setWilaya] = useState(user?.wilaya || '');
  const [city, setCity] = useState(user?.city || '');
  const [track, setTrack] = useState<'arabic' | 'french' | 'bilingual'>(user?.track || 'bilingual');
  const [preferredLang, setPreferredLang] = useState<Language>(user?.preferred_lang || lang);
  const [level, setLevel] = useState<LevelSlug>(user?.level || 'foundation');
  const [teacherCategory, setTeacherCategory] = useState(user?.teacher_category || '');
  const [professorSpecialty, setProfessorSpecialty] = useState(user?.professor_specialty || '');

  const [verifReq, setVerifReq] = useState<VerificationRequestItem | null>(null);
  const [verifNotes, setVerifNotes] = useState('');
  const [verifDocFileId, setVerifDocFileId] = useState('');
  const [verifUploading, setVerifUploading] = useState(false);
  const [verifBusy, setVerifBusy] = useState(false);
  const [verifMsg, setVerifMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [revokeOthersOnPwChange, setRevokeOthersOnPwChange] = useState(true);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Active devices / sessions
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [sessionsMsg, setSessionsMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Referrals & Points
  const [referralData, setReferralData] = useState<ReferralSummary | null>(null);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [referralMsg, setReferralMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copiedKey, setCopiedKey] = useState<'code' | 'link' | null>(null);

  // Payment receipts (both local Mauritanian & global Visa/MC)
  const [localRequests, setLocalRequests] = useState<SubscriptionRequest[]>([]);
  const [cardTxs, setCardTxs] = useState<PaymentTransaction[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  // Browser Geolocation & Notification permissions
  const [geoStatus, setGeoStatus] = useState<string>(user?.geo_permission_status || 'prompt');
  const [geoLabel, setGeoLabel] = useState<string>(user?.last_geo_label || '');
  const [notifStatus, setNotifStatus] = useState<string>(user?.notification_permission_status || 'default');
  const [permBusy, setPermBusy] = useState<'geo' | 'notif' | null>(null);
  const [permMsg, setPermMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiRequest<{ sessions: UserSessionItem[] }>('/api/auth/sessions');
      setSessions(res.sessions || []);
    } catch {
      // Keep graceful empty list on offline
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadReferrals = useCallback(async () => {
    setReferralsLoading(true);
    try {
      const res = await apiRequest<ReferralSummary>('/api/referrals/me');
      setReferralData(res);
    } catch {
      // Graceful fallback
    } finally {
      setReferralsLoading(false);
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    try {
      const [localRes, cardRes] = await Promise.all([
        apiRequest<{ requests?: SubscriptionRequest[] }>('/api/payment-requests/mine').catch(() => ({
          requests: [],
        })),
        apiRequest<{ transactions?: PaymentTransaction[] }>('/api/payments/mine').catch(() => ({
          transactions: [],
        })),
      ]);
      setLocalRequests(Array.isArray(localRes.requests) ? localRes.requests : []);
      setCardTxs(Array.isArray(cardRes.transactions) ? cardRes.transactions : []);
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  const loadVerification = useCallback(async () => {
    try {
      const res = await apiRequest<{ request?: VerificationRequestItem | null }>('/api/verification/mine');
      setVerifReq(res.request || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setTrack(user.track);
    setPreferredLang(user.preferred_lang);
    setLevel(user.level);
    setTeacherCategory(user.teacher_category || '');
    setProfessorSpecialty(user.professor_specialty || '');
    if (user.phone) setPhone(user.phone);
    if (user.geo_permission_status) setGeoStatus(user.geo_permission_status);
    if (user.last_geo_label) setGeoLabel(user.last_geo_label);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifStatus(Notification.permission || user.notification_permission_status || 'default');
    } else if (user.notification_permission_status) {
      setNotifStatus(user.notification_permission_status);
    }
    void fetchMyPrivateInfoDoc(user.uid).then((priv) => {
      setPhone(priv.phone || user.phone || '');
      setWilaya(priv.wilaya || user.wilaya || '');
      setCity(priv.city || user.city || '');
    });
    void loadSessions();
    void loadReferrals();
    void loadReceipts();
    void loadVerification();
  }, [user, loadSessions, loadReferrals, loadReceipts, loadVerification]);

  if (!user || !firebaseUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="addressp-box text-center space-y-3">
          <UserIcon className="w-10 h-10 text-[#384D55] mx-auto" />
          <span className="ltitle">{t.myAccount}</span>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => goToAuth('login')} className="imgsend2 text-xs">
              {t.login}
            </button>
            <button type="button" onClick={() => goToAuth('register')} className="imgsend2-secondary text-xs">
              {t.register}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasPasswordProvider = firebaseUser.providerData.some((p) => p.providerId === 'password');
  const isPaidSubscriber = Boolean(
    user.activeSubscription && user.activeSubscription.billing_cycle !== 'free'
  );

  const formatTimestamp = (raw?: string | null) => {
    if (!raw) return isAr ? 'غير مسجل بعد' : 'Non enregistré';
    const d = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString(localeCode(lang), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const trackDisplay = (trVal: string) => {
    if (trVal === 'arabic') return t.trackArabic;
    if (trVal === 'french') return t.trackFrench;
    return t.trackBilingual;
  };

  const levelDisplay = (lvl: LevelSlug) =>
    formatUserLevelLabel(lvl, user.teacher_category, user.professor_specialty, lang);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setMsg({
        text: tr(
          lang,
          'الاسم يجب أن يتكون من حرفين على الأقل.',
          'Le nom est trop court.',
          'Name must be at least 2 characters.'
        ),
        ok: false,
      });
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      if (firebaseUser.emailVerified || user.email_verified) {
        await updateMyProfileDoc(user.uid, {
          name: name.trim(),
          track,
          preferredLang,
          level,
          profileCompleted: true,
        });
        await updateMyPrivateContactDoc(user.uid, {
          phone: phone.trim(),
          wilaya: wilaya.trim(),
          city: city.trim(),
        }).catch(() => {});
      }

      if (auth.currentUser && auth.currentUser.displayName !== name.trim()) {
        await updateProfile(auth.currentUser, { displayName: name.trim() }).catch(() => {});
      }

      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        json: {
          name: name.trim(),
          phone: phone.trim(),
          track,
          preferred_lang: preferredLang,
          level,
          teacher_category: level === 'teacher' ? teacherCategory : null,
          professor_specialty: level === 'professor' ? professorSpecialty : null,
        },
      }).catch(() => {});

      setSelectedTrack(track);
      setLang(preferredLang);
      await refreshUser();
      setIsEditing(false);
      setMsg({
        text: tr(
          lang,
          'تم حفظ تعديلات الملف الشخصي في حسابك بنجاح.',
          'Profil mis à jour avec succès.',
          'Profile updated successfully.'
        ),
        ok: true,
      });
    } catch (err) {
      setMsg({ text: translateFirebaseAuthError(err, lang), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (!hasPasswordProvider) {
      setPwMsg({
        text: isAr
          ? 'حسابك يعتمد على تسجيل الدخول الخارجي (Google / Apple).'
          : 'Votre compte utilise une connexion externe (Google / Apple).',
        ok: false,
      });
      return;
    }
    if (!currentPassword) {
      setPwMsg({
        text: isAr ? 'يرجى إدخال كلمة المرور الحالية.' : 'Veuillez saisir le mot de passe actuel.',
        ok: false,
      });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({
        text: isAr
          ? 'كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.'
          : 'Le nouveau mot de passe doit contenir au moins 6 caractères.',
        ok: false,
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwMsg({
        text: isAr ? 'كلمتا المرور غير متطابقتين.' : 'Les mots de passe ne correspondent pas.',
        ok: false,
      });
      return;
    }

    setPwBusy(true);
    try {
      if (auth.currentUser && user.email) {
        const cred = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updatePassword(auth.currentUser, newPassword);
        await apiRequest('/api/auth/password-updated', {
          method: 'POST',
          json: { revokeOthers: revokeOthersOnPwChange },
        }).catch(() => {});
        await refreshUser();
        await loadSessions();
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPwMsg({
          text: isAr
            ? revokeOthersOnPwChange
              ? 'تم تحديث كلمة المرور بنجاح وتسجيل الخروج من جميع الأجهزة الأخرى.'
              : 'تم تحديث كلمة المرور بنجاح.'
            : 'Mot de passe modifié avec succès.',
          ok: true,
        });
      }
    } catch (err) {
      setPwMsg({ text: translateFirebaseAuthError(err, lang), ok: false });
    } finally {
      setPwBusy(false);
    }
  };

  const handleResetPasswordEmail = async () => {
    if (!user.email) return;
    setPwBusy(true);
    setPwMsg(null);
    try {
      auth.languageCode = lang === 'fr' ? 'fr' : 'ar';
      await sendPasswordResetEmail(auth, user.email);
      await apiRequest('/api/auth/action-tokens/issue', {
        method: 'POST',
        json: { purpose: 'password_reset', email: user.email },
      }).catch(() => {});
      setPwMsg({
        text: isAr
          ? 'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني (صالح لمدة 5 دقائق ولمرة واحدة).'
          : 'Un lien de réinitialisation (valable 5 minutes) a été envoyé à votre e-mail.',
        ok: true,
      });
    } catch (err) {
      setPwMsg({ text: translateFirebaseAuthError(err, lang), ok: false });
    } finally {
      setPwBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setSessionBusyId(sessionId);
    setSessionsMsg(null);
    try {
      await apiRequest(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      await loadSessions();
      setSessionsMsg({
        text: isAr
          ? 'تم إنهاء جلسة الجهاز بنجاح. سيُطلب منه تسجيل الدخول من جديد.'
          : 'Session révoquée avec succès.',
        ok: true,
      });
    } catch (err: any) {
      setSessionsMsg({
        text: err?.message || (isAr ? 'تعذر إنهاء الجلسة.' : 'Erreur lors de la révocation.'),
        ok: false,
      });
    } finally {
      setSessionBusyId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    setSessionBusyId('all');
    setSessionsMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; revokedCount: number }>(
        '/api/auth/sessions/revoke-others',
        { method: 'POST' }
      );
      await loadSessions();
      setSessionsMsg({
        text: isAr
          ? res.revokedCount > 0
            ? `تم تسجيل الخروج من ${res.revokedCount} جهاز/جلسة أخرى بنجاح.`
            : 'لا توجد أجهزة أخرى نشطة حالياً غير جهازك هذا.'
          : `${res.revokedCount} autre(s) session(s) déconnectée(s).`,
        ok: true,
      });
    } catch (err: any) {
      setSessionsMsg({
        text: err?.message || (isAr ? 'تعذر تسجيل الخروج من الأجهزة الأخرى.' : 'Erreur de révocation.'),
        ok: false,
      });
    } finally {
      setSessionBusyId(null);
    }
  };

  const handleCopyText = async (value: string, key: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // Fallback ignored safely
    }
  };

  const handleRedeemReferral = async () => {
    setRedeemBusy(true);
    setReferralMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; expiresAt: string }>('/api/referrals/redeem', {
        method: 'POST',
      });
      await Promise.all([refreshUser(), loadReferrals()]);
      setReferralMsg({
        text: isAr
          ? `مبارك! تم استبدال نقاطك وتفعيل اشتراك مجاني حتى ${res.expiresAt.slice(0, 10)}.`
          : `Félicitations ! Abonnement gratuit activé jusqu'au ${res.expiresAt.slice(0, 10)}.`,
        ok: true,
      });
    } catch (err: any) {
      setReferralMsg({
        text: err?.message || (isAr ? 'تعذر استبدال النقاط حالياً.' : 'Impossible d’échanger les points.'),
        ok: false,
      });
    } finally {
      setRedeemBusy(false);
    }
  };

  const renderDeviceIcon = (type: string) => {
    if (type === 'mobile') return <Smartphone className="w-4 h-4 text-[#557a16]" />;
    if (type === 'tablet') return <Tablet className="w-4 h-4 text-[#557a16]" />;
    return <Laptop className="w-4 h-4 text-[#557a16]" />;
  };

  const handleRequestGeoPermission = () => {
    setPermMsg(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermMsg({
        text: tr(
          lang,
          'متصفحك لا يدعم تحديد الموقع الجغرافي.',
          'La géolocalisation n’est pas prise en charge par ce navigateur.',
          'Geolocation is not supported by your browser.'
        ),
        ok: false,
      });
      return;
    }
    setPermBusy('geo');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const label = `${lat}, ${lng}`;
        setGeoStatus('granted');
        setGeoLabel(label);
        await apiRequest('/api/auth/permissions', {
          method: 'PATCH',
          json: { geoPermissionStatus: 'granted', lat, lng, geoLabel: label },
        }).catch(() => {});
        setPermMsg({
          text: tr(
            lang,
            'تم تفعيل إذن الموقع الجغرافي وحفظ آخر موقع تقريبي لحسابك.',
            'Permission de géolocalisation activée et enregistrée.',
            'Geolocation permission granted and saved.'
          ),
          ok: true,
        });
        setPermBusy(null);
      },
      async (err) => {
        const nextStatus = err.code === 1 ? 'denied' : 'prompt';
        setGeoStatus(nextStatus);
        await apiRequest('/api/auth/permissions', {
          method: 'PATCH',
          json: { geoPermissionStatus: nextStatus },
        }).catch(() => {});
        setPermMsg({
          text:
            err.code === 1
              ? tr(
                  lang,
                  'تم رفض إذن الموقع من المتصفح. يمكنك إعادة تفعيله لاحقاً من إعدادات المتصفح.',
                  'Accès à la position refusé dans le navigateur. Vous pouvez le modifier dans les paramètres.',
                  'Location permission denied in browser. You can allow it anytime in browser settings.'
                )
              : tr(
                  lang,
                  'تعذر تحديد الموقع حالياً.',
                  'Position indisponible actuellement.',
                  'Unable to retrieve position.'
                ),
          ok: false,
        });
        setPermBusy(null);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const handleRequestNotifPermission = async () => {
    setPermMsg(null);
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermMsg({
        text: tr(
          lang,
          'إشعارات المتصفح غير مدعومة على هذا الجهاز.',
          'Les notifications ne sont pas supportées sur cet appareil.',
          'Browser notifications are not supported on this device.'
        ),
        ok: false,
      });
      return;
    }
    setPermBusy('notif');
    try {
      const result = await Notification.requestPermission();
      setNotifStatus(result);
      await apiRequest('/api/auth/permissions', {
        method: 'PATCH',
        json: { notificationPermissionStatus: result },
      }).catch(() => {});
      setPermMsg({
        text:
          result === 'granted'
            ? tr(lang, 'تم تفعيل إشعارات المتصفح بنجاح.', 'Notifications activées.', 'Notifications enabled.')
            : result === 'denied'
              ? tr(
                  lang,
                  'تم رفض إذن الإشعارات في المتصفح. يمكنك تغييره من قفل شريط العنوان.',
                  'Notifications bloquées dans le navigateur.',
                  'Notifications blocked in browser settings.'
                )
              : tr(lang, 'تم تأجيل تفعيل الإشعارات.', 'Décision reportée.', 'Notification prompt dismissed.'),
        ok: result === 'granted',
      });
    } finally {
      setPermBusy(null);
    }
  };

  const refCode = referralData?.referralCode || user.referral_code || '';
  const inviteLink =
    referralData?.inviteUrl ||
    (refCode ? `https://tadribi.chtbqi.com/?ref=${encodeURIComponent(refCode)}` : '');
  const refThreshold = Number(referralData?.settings?.reward_threshold_points || 1000);
  const refPts = Number(referralData?.referralPoints ?? user.referral_points ?? 0);
  const refPct = Math.min(100, Math.round((refPts / Math.max(1, refThreshold)) * 100));
  const otherSessionsCount = sessions.filter((s) => !s.is_current).length;

  const unifiedReceipts: Array<{
    key: string;
    rid: string;
    title: string;
    methodLabel: string;
    amount: number;
    currency: string;
    status: string;
    dateStr: string;
    verifySig?: string;
    printable: PrintableReceiptData;
  }> = [
    ...localRequests.map((req) => ({
      key: `local-${req.subscription_request_id}`,
      rid: req.subscription_request_id,
      title: req.plan_name,
      methodLabel: req.payment_method.toUpperCase(),
      amount: Number(req.paid_amount ?? req.amount ?? 0),
      currency: req.currency || 'MRU',
      status: req.status,
      dateStr: req.transaction_at || req.uploaded_at || req.created_at,
      verifySig: req.verify_sig,
      printable: {
        rid: req.subscription_request_id,
        kind: 'local_request' as const,
        studentName: user.name,
        studentEmail: user.email,
        planName: req.plan_name,
        amount: req.amount,
        paidAmount: req.paid_amount ?? req.amount,
        remainingAmount: req.remaining_amount,
        currency: req.currency || 'MRU',
        paymentMethod: req.payment_method,
        transactionId: req.transaction_id || req.transaction_reference,
        transactionReference: req.transaction_reference,
        beneficiaryName: req.beneficiary_name,
        status: req.status,
        verified: req.status === 'approved',
        transactionAt: req.transaction_at || req.uploaded_at || req.created_at,
        startsAt: req.starts_at,
        expiresAt: req.expires_at,
        verifyUrl: req.verify_url,
      },
    })),
    ...cardTxs.map((tx) => ({
      key: `card-${tx.provider_tx_id}`,
      rid: tx.provider_tx_id,
      title: isAr ? tx.plan_name_ar || 'اشتراك' : tx.plan_name_fr || 'Abonnement',
      methodLabel: `${tx.card_brand.toUpperCase()} •••• ${tx.card_last4}`,
      amount: Number(tx.amount_mru || 0),
      currency: tx.currency || 'MRU',
      status: tx.status,
      dateStr: tx.created_at,
      verifySig: tx.verify_sig,
      printable: {
        rid: tx.provider_tx_id,
        kind: 'card_tx' as const,
        studentName: tx.cardholder_name || user.name,
        studentEmail: user.email,
        planName: isAr ? tx.plan_name_ar || 'اشتراك' : tx.plan_name_fr || 'Abonnement',
        amount: tx.amount_mru,
        paidAmount: tx.amount_mru,
        currency: tx.currency || 'MRU',
        paymentMethod: tx.card_brand,
        cardBrand: tx.card_brand,
        cardLast4: tx.card_last4,
        transactionId: tx.provider_tx_id,
        status: tx.status,
        verified: tx.status === 'succeeded',
        transactionAt: tx.created_at,
        startsAt: tx.starts_at,
        expiresAt: tx.expires_at,
        verifyUrl: tx.verify_url,
      },
    })),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header & Account Status Card */}
      <div className="addressp-box-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-3">
            {/* Clean Gray User Icon Avatar */}
            <div className="w-12 h-12 rounded-full bg-[#e6eaec] border border-[#c9d0d3] text-[#4a555b] flex items-center justify-center shrink-0">
              <UserIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg font-extrabold text-[#384D55]">{user.name}</h1>
                <VerifiedBadge
                  verified={Boolean(user.verified_account)}
                  label={user.verified_badge_label}
                  size="md"
                />
                {!user.verified_account && isPaidSubscriber && (
                  <SubscribedBlueBadge
                    title={isAr ? 'مشترك مفعل' : 'Abonnement actif vérifié'}
                  />
                )}
              </div>
              <p className="text-xs text-[#6b787e]" dir="ltr">
                {user.email} · {user.isAdmin ? 'admin (official)' : user.role}
              </p>
              <div className="flex items-center gap-3 text-[11px] font-bold text-[#5c686e] mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3 text-[#557a16]" />
                  {user.followers_count ?? 0} {tr(lang, 'متابع', 'abonnés', 'followers')}
                </span>
                <span>
                  {user.following_count ?? 0} {tr(lang, 'يتابع', 'abonnements', 'following')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(user.emailVerified || user.email_verified) ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] bg-[#e2efbf] border border-[#A6CE39] text-[#384D55] text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#557a16]" />
                {isAr ? 'بريد موثق' : 'E-mail vérifié'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold">
                <MailWarning className="w-3.5 h-3.5" />
                {isAr ? 'بانتظار التفعيل' : 'Vérification requise'}
              </span>
            )}

            {!isEditing && (
              <button
                type="button"
                onClick={() => {
                  setMsg(null);
                  setIsEditing(true);
                }}
                className="imgsend2 text-xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تعديل البيانات' : 'Modifier les données'}</span>
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div
            className={`p-3 rounded-[4px] border text-xs font-bold ${
              msg.ok
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* INITIAL READ-ONLY VIEW MODE */}
        {!isEditing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                <div className="text-[#6b787e] mb-0.5">
                  {tr(lang, 'الاسم الكامل', 'Nom complet', 'Full Name')}
                </div>
                <div className="font-bold text-[#384D55] flex items-center gap-1.5">
                  <span>{user.name}</span>
                  {isPaidSubscriber && (
                    <SubscribedBlueBadge
                      title={isAr ? 'مشترك مفعل' : 'Abonnement actif vérifié'}
                    />
                  )}
                </div>
              </div>
              <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                <div className="text-[#6b787e] mb-0.5">{isAr ? 'البريد الإلكتروني' : 'E-mail'}</div>
                <div className="font-bold text-[#384D55]" dir="ltr">
                  {user.email}
                </div>
              </div>
              <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                <div className="text-[#6b787e] mb-0.5">{isAr ? 'رقم الهاتف' : 'Téléphone'}</div>
                <div className="font-bold text-[#384D55]" dir="ltr">
                  {phone || (isAr ? 'غير مسجل' : 'Non renseigné')}
                </div>
              </div>
              <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                <div className="text-[#6b787e] mb-0.5">{isAr ? 'حالة الاشتراك' : 'Statut d’abonnement'}</div>
                <div className="font-bold text-[#384D55]">
                  {isPaidSubscriber && user.activeSubscription
                    ? `${isAr ? user.activeSubscription.name_ar : user.activeSubscription.name_fr} (${isAr ? 'مفعل' : 'Actif'})`
                    : isAr
                      ? 'مجاني'
                      : 'Gratuit'}
                </div>
              </div>
              <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                <div className="text-[#6b787e] mb-0.5">{t.navTracks}</div>
                <div className="font-bold text-[#384D55]">{trackDisplay(user.track)}</div>
              </div>
              <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
                <div className="text-[#6b787e] mb-0.5">{t.navLevels}</div>
                <div className="font-bold text-[#384D55]">{levelDisplay(user.level)}</div>
              </div>
            </div>

            {/* Security & Account Activity Timestamps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-[#83a329] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[#6b787e]">
                    {tr(lang, 'آخر تسجيل دخول', 'Dernière connexion', 'Last Login')}
                  </div>
                  <div className="font-bold text-[#384D55] mt-0.5">
                    {formatTimestamp(user.last_login_at)}
                  </div>
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-[#83a329] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[#6b787e]">
                    {isAr ? 'آخر تحديث للبيانات' : 'Dernière mise à jour du profil'}
                  </div>
                  <div className="font-bold text-[#384D55] mt-0.5">
                    {formatTimestamp(user.last_profile_updated_at)}
                  </div>
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-start gap-2">
                <KeyRound className="w-3.5 h-3.5 text-[#83a329] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[#6b787e]">
                    {isAr ? 'آخر تغيير لكلمة المرور' : 'Dernier changement de mot de passe'}
                  </div>
                  <div className="font-bold text-[#384D55] mt-0.5">
                    {formatTimestamp(user.last_password_updated_at)}
                  </div>
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#83a329] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[#6b787e]">
                    {isAr ? 'آخر نشاط مسجل' : 'Dernière activité'}
                  </div>
                  <div className="font-bold text-[#384D55] mt-0.5">
                    {formatTimestamp(user.last_active_at)}
                  </div>
                </div>
              </div>
            </div>

            {user.last_geo_lat != null && user.last_geo_lng != null && (
              <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-[#384D55]">
                  <MapPin className="w-4 h-4 text-[#83a329] shrink-0" />
                  <span>
                    {user.last_geo_label || `${user.last_geo_lat}, ${user.last_geo_lng}`}
                    {user.last_geo_is_approx ? (
                      <span className="ms-1.5 text-[11px] text-[#6b787e]">
                        ({tr(lang, 'موقع تقريبي', 'Position approximative', 'Approximate location')})
                      </span>
                    ) : null}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(`${user.last_geo_lat},${user.last_geo_lng}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#557a16] hover:underline"
                >
                  {tr(lang, 'فتح على الخريطة', 'Ouvrir sur la carte', 'Open on Map')}
                </a>
              </div>
            )}
          </div>
        ) : (
          /* EDIT MODE AFTER CLICKING "تعديل البيانات" */
          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold mb-1 text-xs">
                  {tr(lang, 'الاسم الكامل', 'Nom complet', 'Full Name')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="template-input"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-xs">
                  {isAr ? 'رقم الهاتف' : 'Téléphone'}
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="22 00 00 00"
                  className="template-input"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-xs">
                  {isAr ? 'الولاية / المدينة' : 'Wilaya / Ville'}
                </label>
                <input
                  type="text"
                  value={wilaya}
                  onChange={(e) => {
                    setWilaya(e.target.value);
                    setCity(e.target.value);
                  }}
                  className="template-input"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-xs">{t.navTracks}</label>
                <select
                  value={track}
                  onChange={(e) => setTrack(e.target.value as 'arabic' | 'french' | 'bilingual')}
                  className="template-input"
                >
                  <option value="arabic">{t.trackArabic}</option>
                  <option value="french">{t.trackFrench}</option>
                  <option value="bilingual">{t.trackBilingual}</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-xs">
                  {tr(lang, 'اللغة المفضلة', 'Langue préférée', 'Preferred Language')}
                </label>
                <select
                  value={preferredLang}
                  onChange={(e) => setPreferredLang(e.target.value as Language)}
                  className="template-input"
                >
                  <option value="ar">العربية (RTL)</option>
                  <option value="fr">Français (LTR)</option>
                  <option value="en">English (LTR)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-xs">{t.navLevels}</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as LevelSlug)}
                  className="template-input"
                >
                  {ALL_USER_LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isAr ? opt.ar : opt.fr}
                    </option>
                  ))}
                </select>
              </div>
              {level === 'teacher' && (
                <div>
                  <label className="block font-bold mb-1 text-xs">
                    {isAr ? 'تصنيف المعلم' : 'Catégorie enseignant'}
                  </label>
                  <select
                    value={teacherCategory}
                    onChange={(e) => setTeacherCategory(e.target.value)}
                    className="template-input"
                  >
                    <option value="">{isAr ? 'اختر التصنيف' : 'Choisir'}</option>
                    {TEACHER_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isAr ? opt.ar : opt.fr}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {level === 'professor' && (
                <div>
                  <label className="block font-bold mb-1 text-xs">
                    {isAr ? 'تخصص الأستاذ' : 'Spécialité professeur'}
                  </label>
                  <select
                    value={professorSpecialty}
                    onChange={(e) => setProfessorSpecialty(e.target.value)}
                    className="template-input"
                  >
                    <option value="">{isAr ? 'اختر التخصص' : 'Choisir'}</option>
                    {PROFESSOR_SPECIALTY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isAr ? opt.ar : opt.fr}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button type="submit" disabled={busy} className="imgsend2 text-xs">
                <Save className="w-4 h-4" />
                <span>{busy ? t.loading : t.save}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setName(user.name);
                  setTrack(user.track);
                  setLevel(user.level);
                  setPreferredLang(user.preferred_lang);
                }}
                className="imgsend2-secondary text-xs"
              >
                <X className="w-4 h-4" />
                <span>{t.cancel}</span>
              </button>
            </div>
          </form>
        )}

        {/* Current Subscription Summary */}
        <div className="border-t border-[#efefef] pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[3px] bg-[#efefef] border border-[#cfd6da] flex items-center justify-center text-[#384D55]">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-[#384D55]">{t.currentPlanBadge}</div>
              <div className="text-xs text-[#5d6e75]">
                {user.activeSubscription
                  ? `${isAr ? user.activeSubscription.name_ar : user.activeSubscription.name_fr}${
                      user.activeSubscription.expires_at
                        ? ` · ${isAr ? 'ينتهي في' : 'Expire le'} ${new Date(
                            user.activeSubscription.expires_at
                          ).toLocaleDateString()}`
                        : ''
                    }`
                  : isAr
                    ? 'الباقة المجانية الحالية (يمكنك الترقية في أي وقت)'
                    : 'Offre gratuite actuelle (évolution possible à tout moment)'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('subscriptions')}
            className="imgsend2-secondary text-xs"
          >
            {t.subscribeNow}
          </button>
        </div>
      </div>

      {/* Active Devices & Sessions Card */}
      <div className="addressp-box-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-[#83a329]" />
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {isAr ? 'الأجهزة والجلسات النشطة' : 'Appareils et sessions actives'}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSessions()}
              disabled={sessionsLoading}
              className="imgsend2-secondary !py-1 !px-2.5 !text-[11px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث' : 'Actualiser'}</span>
            </button>
            {otherSessionsCount > 0 && (
              <button
                type="button"
                disabled={sessionBusyId === 'all'}
                onClick={() => void handleRevokeAllOthers()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-red-200 bg-red-50 text-red-700 text-[11px] font-bold cursor-pointer hover:opacity-90"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? 'تسجيل الخروج من جميع الأجهزة الأخرى'
                    : 'Déconnecter tous les autres appareils'}
                </span>
              </button>
            )}
          </div>
        </div>

        {sessionsMsg && (
          <div
            className={`p-2.5 rounded-[4px] border text-xs font-bold ${
              sessionsMsg.ok
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {sessionsMsg.text}
          </div>
        )}

        {sessionsLoading && sessions.length === 0 ? (
          <p className="text-xs text-[#6b787e]">{t.loading}</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-[#6b787e]">
            {isAr ? 'لا توجد جلسات أجهزة مسجلة بعد.' : 'Aucune session enregistrée.'}
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className={`p-3 rounded-[4px] border flex flex-wrap items-center justify-between gap-3 text-xs ${
                  s.is_current
                    ? 'bg-[#f9fcf2] border-[#A6CE39]'
                    : 'bg-[#f7f9fa] border-[#d8dfe2]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-[4px] bg-white border border-[#d8dfe2] flex items-center justify-center shrink-0 mt-0.5">
                    {renderDeviceIcon(s.device_type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#384D55]">{s.device_name}</span>
                      {s.is_current && (
                        <span className="px-2 py-0.5 rounded bg-[#e2efbf] border border-[#A6CE39] text-[#2c4a12] text-[10px] font-extrabold">
                          {isAr ? 'هذا الجهاز الحالي' : 'Cet appareil'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#6b787e] mt-0.5">
                      {s.approx_location} · {isAr ? 'آخر نشاط:' : 'Dernière activité :'} {' '}
                      {formatTimestamp(s.last_active_at)}
                    </div>
                  </div>
                </div>

                {!s.is_current && (
                  <button
                    type="button"
                    disabled={sessionBusyId === s.session_id}
                    onClick={() => void handleRevokeSession(s.session_id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-red-200 bg-white text-red-700 text-[11px] font-bold cursor-pointer hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إنهاء الجلسة' : 'Déconnecter'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share Platform / Referral & Points Card */}
      <div className="addressp-box-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#83a329]" />
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {isAr ? 'مشاركة المنصة وبرنامج النقاط' : 'Parrainage et points de fidélité'}
            </h2>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#e2efbf] text-[#2c4a12]">
            {refThreshold} {isAr ? 'نقطة = شهر مجاني' : 'points = 1 mois offert'}
          </span>
        </div>

        <p className="text-xs text-[#6b787e] leading-relaxed">
          {isAr
            ? `شارك رابط أو كود الإحالة الخاص بك مع زملائك. تُحتسب ${
                referralData?.settings?.points_per_referral || 20
              } نقطة لكل صديق يسجل ويوثق بريده الإلكتروني (50 إحالة موثقة = 1000 نقطة = اشتراك شامل مجاني لمدة ${
                referralData?.settings?.reward_duration_days || 30
              } يوماً).`
            : `Partagez votre code de parrainage. Chaque inscription vérifiée par e-mail vous rapporte ${
                referralData?.settings?.points_per_referral || 20
              } points.`}
        </p>

        {referralMsg && (
          <div
            className={`p-3 rounded-[4px] border text-xs font-bold ${
              referralMsg.ok
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {referralMsg.text}
          </div>
        )}

        {/* Code & Invite Link Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[#6b787e] mb-0.5">{isAr ? 'كود الإحالة الخاص بك' : 'Votre code'}</div>
              <div className="font-extrabold text-sm text-[#384D55] tracking-wider" dir="ltr">
                {refCode || '...'}
              </div>
            </div>
            {refCode && (
              <button
                type="button"
                onClick={() => void handleCopyText(refCode, 'code')}
                className="imgsend2-secondary !py-1.5 !px-2.5 !text-[11px] shrink-0"
              >
                {copiedKey === 'code' ? (
                  <Check className="w-3.5 h-3.5 text-[#557a16]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === 'code' ? (isAr ? 'نُسخ' : 'Copié') : isAr ? 'نسخ' : 'Copier'}</span>
              </button>
            )}
          </div>

          <div className="p-3 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[#6b787e] mb-0.5">{isAr ? 'رابط الدعوة المباشر' : 'Lien d’invitation'}</div>
              <div className="font-bold text-[#384D55] truncate" dir="ltr">
                {inviteLink || '...'}
              </div>
            </div>
            {inviteLink && (
              <button
                type="button"
                onClick={() => void handleCopyText(inviteLink, 'link')}
                className="imgsend2 !py-1.5 !px-2.5 !text-[11px] shrink-0"
              >
                {copiedKey === 'link' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === 'link' ? (isAr ? 'نُسخ' : 'Copié') : isAr ? 'نسخ الرابط' : 'Copier'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats + Progress */}
        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
          <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
            <div className="text-[#6b787e] text-[11px]">{isAr ? 'إجمالي المدعوين' : 'Invités'}</div>
            <div className="text-base font-extrabold text-[#384D55] tabular-nums">
              {referralData?.invitedCount ?? 0}
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
            <div className="text-[#6b787e] text-[11px]">{isAr ? 'الحسابات الموثقة' : 'Vérifiés'}</div>
            <div className="text-base font-extrabold text-[#557a16] tabular-nums">
              {referralData?.verifiedCount ?? 0}
            </div>
          </div>
          <div className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2]">
            <div className="text-[#6b787e] text-[11px]">{isAr ? 'رصيد النقاط' : 'Points'}</div>
            <div className="text-base font-extrabold text-[#384D55] tabular-nums">{refPts}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#384D55]">
            <span>
              {isAr ? 'التقدم نحو الاشتراك المجاني:' : 'Progression vers 1 mois offert :'}
            </span>
            <span className="tabular-nums">
              {refPts} / {refThreshold} ({refPct}%)
            </span>
          </div>
          <div className="w-full h-2.5 bg-[#e3e7ea] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#A6CE39] transition-all duration-500"
              style={{ width: `${refPct}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-[#6b787e]">
            {referralData?.canRedeem
              ? isAr
                ? 'رصيدك مؤهل الآن لاستبدال شهر مجاني كامل!'
                : 'Vous avez atteint le seuil pour échanger votre mois gratuit !'
              : isAr
                ? `المتبقي للاستبدال: ${Math.max(0, refThreshold - refPts)} نقطة`
                : `Reste ${Math.max(0, refThreshold - refPts)} points pour débloquer la récompense`}
          </span>

          <button
            type="button"
            disabled={!referralData?.canRedeem || redeemBusy || referralsLoading}
            onClick={() => void handleRedeemReferral()}
            className="imgsend2 text-xs disabled:opacity-50"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>
              {redeemBusy
                ? t.loading
                : isAr
                  ? 'استبدال باشتراك مجاني'
                  : 'Échanger contre 1 mois gratuit'}
            </span>
          </button>
        </div>

        {referralData && referralData.recentLogs.length > 0 && (
          <div className="border-t border-[#efefef] pt-3 space-y-1.5">
            <div className="text-xs font-extrabold text-[#384D55] flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#83a329]" />
              <span>{isAr ? 'سجل الإحالات الأخيرة' : 'Derniers parrainages'}</span>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {referralData.recentLogs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  className="px-2.5 py-1.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="font-bold text-[#384D55] truncate">{log.referred_name}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                      log.status === 'verified_rewarded'
                        ? 'bg-[#e2efbf] text-[#2c4a12]'
                        : log.status === 'pending_verification'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {log.status === 'verified_rewarded'
                      ? isAr
                        ? `+${log.points_awarded} نقطة (موثق)`
                        : `+${log.points_awarded} pts`
                      : log.status === 'pending_verification'
                        ? isAr
                          ? 'بانتظار توثيق البريد'
                          : 'En attente de vérification'
                        : isAr
                          ? 'مرفوض'
                          : 'Refusé'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Password Management Card */}
      <div className="addressp-box-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#83a329]" />
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {isAr ? 'الأمان وتغيير كلمة المرور' : 'Sécurité & Mot de passe'}
            </h2>
          </div>
          {hasPasswordProvider && (
            <button
              type="button"
              disabled={pwBusy}
              onClick={() => void handleResetPasswordEmail()}
              className="text-xs font-bold text-[#83a329] hover:underline cursor-pointer"
            >
              {t.forgotPassword}
            </button>
          )}
        </div>

        {pwMsg && (
          <div
            className={`p-3 rounded-[4px] border text-xs font-bold ${
              pwMsg.ok
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {pwMsg.text}
          </div>
        )}

        {hasPasswordProvider ? (
          <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {isAr ? 'كلمة المرور الحالية' : 'Mot de passe actuel'}
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="template-input"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {isAr ? 'كلمة المرور الجديدة' : 'Nouveau mot de passe'}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="template-input"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirmer le mot de passe'}
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="template-input"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#384D55] cursor-pointer">
              <input
                type="checkbox"
                checked={revokeOthersOnPwChange}
                onChange={(e) => setRevokeOthersOnPwChange(e.target.checked)}
                className="accent-[#83a329]"
              />
              <span>
                {isAr
                  ? 'تسجيل الخروج من جميع الأجهزة الأخرى فور تغيير كلمة المرور'
                  : 'Déconnecter tous les autres appareils après le changement'}
              </span>
            </label>

            <button type="submit" disabled={pwBusy} className="imgsend2-secondary text-xs">
              <KeyRound className="w-3.5 h-3.5" />
              <span>
                {pwBusy
                  ? t.loading
                  : isAr
                    ? 'تحديث كلمة المرور'
                    : 'Mettre à jour le mot de passe'}
              </span>
            </button>
          </form>
        ) : (
          <p className="text-xs text-[#6b787e]">
            {isAr
              ? 'هذا الحساب مسجل عبر موفر خارجي (Google أو Apple)؛ تتم إدارة كلمة المرور من مزود الهوية الخاص بك.'
              : 'Ce compte est connecté via un fournisseur externe (Google / Apple).'}
          </p>
        )}

        <div className="pt-3 border-t border-[#efefef] flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-[#6b787e]">
            {tr(
              lang,
              'يمكنك تسجيل الخروج من هذا الجهاز في أي وقت.',
              'Vous pouvez vous déconnecter de cet appareil à tout moment.',
              'You can sign out of this device anytime.'
            )}
          </span>
          <button
            type="button"
            onClick={() => requestLogout()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[4px] border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.logout}</span>
          </button>
        </div>
      </div>

      {/* Account Verification Badge Request Card */}
      <div className="addressp-box-white space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1D9BF0]" />
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {tr(lang, 'طلب توثيق الحساب (الشارة الزرقاء)', 'Demande de badge vérifié', 'Account Verification Badge')}
            </h2>
          </div>
          {user.verified_account ? (
            <span className="px-2 py-0.5 rounded bg-[#e2efbf] text-[#2c4a12] text-[11px] font-bold">
              {tr(lang, 'حساب موثق', 'Compte vérifié', 'Verified')}
            </span>
          ) : verifReq ? (
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-bold">
              {verifReq.status}
            </span>
          ) : null}
        </div>

        {verifMsg && (
          <div
            className={`p-2.5 rounded-[4px] border text-xs font-bold ${
              verifMsg.ok
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {verifMsg.text}
          </div>
        )}

        {user.verified_account ? (
          <p className="text-xs text-[#456810] font-bold flex items-center gap-1.5">
            <VerifiedBadge verified size="sm" />
            <span>
              {tr(
                lang,
                `حسابك موثق وتظهر شارة التوثيق الرسمية في جميع صفحات المنصة${user.verified_badge_label ? ` (${user.verified_badge_label})` : ''}.`,
                'Votre compte est officiellement vérifié sur la plateforme.',
                'Your account is officially verified across the platform.'
              )}
            </span>
          </p>
        ) : verifReq && verifReq.status === 'pending' ? (
          <p className="text-xs text-[#5c686e]">
            {tr(
              lang,
              'طلب التوثيق الخاص بك قيد المراجعة من طرف الإدارة.',
              'Votre demande de vérification est en cours d’examen par l’administration.',
              'Your verification request is pending administrative review.'
            )}
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-[#6b787e]">
              {tr(
                lang,
                'يمكن للمعلمين والأساتذة والطلبة المتميزين تقديم طلب لتوثيق حسابهم بعد مراجعة الإدارة.',
                'Les enseignants, professeurs et étudiants peuvent demander le badge de vérification.',
                'Educators and learners can apply for administrative account verification.'
              )}
            </p>
            {verifReq?.status === 'rejected' && verifReq.rejection_reason && (
              <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 font-bold">
                {tr(lang, 'ملاحظة الرفض السابقة: ', 'Motif précédent : ', 'Previous note: ')}
                {verifReq.rejection_reason}
              </div>
            )}
            <textarea
              rows={2}
              value={verifNotes}
              onChange={(e) => setVerifNotes(e.target.value)}
              placeholder={tr(
                lang,
                'أدخل نبذة توضيحية أو سبب طلب التوثيق (الصفة التربوية / المؤسسة)...',
                'Précisez votre statut éducatif ou établissement...',
                'Briefly explain your role or institution...'
              )}
              className="template-input text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#c9d0d3] bg-[#f7f9fa] text-xs font-bold text-[#384D55] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {verifUploading
                    ? t.loading
                    : verifDocFileId
                      ? tr(lang, 'تم إرفاق مستند داعم ✓', 'Document joint ✓', 'Document attached ✓')
                      : tr(lang, 'إرفاق مستند داعم (اختياري)', 'Joindre un justificatif (optionnel)', 'Attach supporting doc (optional)')}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setVerifUploading(true);
                    setVerifMsg(null);
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      fd.append('entityType', 'verification_doc');
                      fd.append('visibility', 'private');
                      const token = await getAuthToken();
                      const r = await fetch(resolveApiUrl('/api/files/upload'), {
                        method: 'POST',
                        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                        body: fd,
                      });
                      const data = await r.json();
                      if (!r.ok || !data?.file?.id) {
                        throw new Error(data?.error || 'Upload failed');
                      }
                      setVerifDocFileId(data.file.id);
                    } catch (err: any) {
                      setVerifMsg({ text: err?.message || 'Upload error', ok: false });
                    } finally {
                      setVerifUploading(false);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                disabled={verifBusy || verifUploading}
                onClick={async () => {
                  setVerifBusy(true);
                  setVerifMsg(null);
                  try {
                    const res = await apiRequest<{ ok: boolean; request: VerificationRequestItem }>(
                      '/api/verification/request',
                      {
                        method: 'POST',
                        json: {
                          requestedType: user.level === 'professor' || user.level === 'teacher' ? 'educator' : 'standard',
                          notes: verifNotes.trim(),
                          documentFileId: verifDocFileId || undefined,
                        },
                      }
                    );
                    setVerifReq(res.request);
                    setVerifMsg({
                      text: tr(
                        lang,
                        'تم إرسال طلب التوثيق للإدارة بنجاح.',
                        'Demande de vérification envoyée.',
                        'Verification request submitted.'
                      ),
                      ok: true,
                    });
                  } catch (err: any) {
                    setVerifMsg({ text: err?.message || 'Error', ok: false });
                  } finally {
                    setVerifBusy(false);
                  }
                }}
                className="imgsend2 text-xs"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{verifBusy ? t.loading : tr(lang, 'إرسال طلب التوثيق', 'Soumettre la demande', 'Submit Verification Request')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Receipts & Invoices Card */}
      <div className="addressp-box-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#83a329]" />
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {tr(lang, 'فواتيري وإيصالات الدفع', 'Mes reçus et factures', 'My Payment Receipts')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void loadReceipts()}
            disabled={receiptsLoading}
            className="imgsend2-secondary !py-1 !px-2.5 !text-[11px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${receiptsLoading ? 'animate-spin' : ''}`} />
            <span>{tr(lang, 'تحديث', 'Actualiser', 'Refresh')}</span>
          </button>
        </div>

        {unifiedReceipts.length === 0 ? (
          <p className="text-xs text-[#6b787e]">
            {tr(
              lang,
              'لا توجد فواتير أو إيصالات دفع مسجلة حتى الآن.',
              'Aucun reçu de paiement enregistré pour le moment.',
              'No payment receipts recorded yet.'
            )}
          </p>
        ) : (
          <div className="space-y-2.5">
            {unifiedReceipts.map((item) => (
              <div
                key={item.key}
                className="p-3 rounded-[4px] border border-[#d8dfe2] bg-[#f7f9fa] flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-[#384D55]">{item.title}</span>
                    <span className="font-mono text-[11px] text-[#5c686e]" dir="ltr">
                      {item.rid}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        item.status === 'approved' || item.status === 'succeeded' || item.status === 'completed'
                          ? 'bg-[#e2efbf] text-[#2c4a12]'
                          : item.status === 'rejected' || item.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : item.status === 'manual_review'
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6b787e] flex flex-wrap gap-3">
                    <span dir="ltr">{item.methodLabel}</span>
                    <span className="font-bold text-[#384D55]">
                      {item.amount.toLocaleString()} {item.currency}
                    </span>
                    <span dir="ltr">{formatTimestamp(item.dateStr)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void printStudentReceipt(item.printable, lang)}
                    className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                    title={tr(lang, 'طباعة', 'Imprimer', 'Print')}
                  >
                    <Printer className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadStudentReceiptPdf(item.printable, lang)}
                    className="imgsend2 !py-1 !px-2.5 text-[11px]"
                  >
                    <FileText className="w-3 h-3" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadStudentReceiptJpg(item.printable, lang)}
                    className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>JPG</span>
                  </button>
                  {item.verifySig && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate('verify-receipt', {
                          receiptId: item.rid,
                          receiptSig: item.verifySig,
                        })
                      }
                      className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                    >
                      <QrCode className="w-3 h-3" />
                      <span>{tr(lang, 'تحقق QR', 'QR', 'QR')}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transparent Browser Permissions Card (Geolocation & Notifications) */}
      <div className="addressp-box-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#83a329]" />
            <h2 className="text-sm font-extrabold text-[#384D55]">
              {tr(
                lang,
                'أذونات المتصفح: الموقع الجغرافي والإشعارات',
                'Autorisations navigateur : Localisation & Notifications',
                'Browser Permissions: Location & Notifications'
              )}
            </h2>
          </div>
        </div>

        <p className="text-xs text-[#6b787e] leading-relaxed">
          {tr(
            lang,
            'تُطلب هذه الأذونات اختيارياً وبموافقتك المباشرة لتحسين حماية الجلسات وتنبيهك بنتائج الامتحانات وحالة الاشتراك.',
            'Ces autorisations sont strictement facultatives et gérées avec votre consentement explicite.',
            'These permissions are strictly optional and requested only with your explicit consent.'
          )}
        </p>

        {permMsg && (
          <div
            className={`p-3 rounded-[4px] border text-xs font-bold ${
              permMsg.ok
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {permMsg.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-[5px] bg-[#f7f9fa] border border-[#d8dfe2] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'الموقع الجغرافي', 'Géolocalisation', 'Geolocation')}</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  geoStatus === 'granted'
                    ? 'bg-[#e2efbf] text-[#2c4a12]'
                    : geoStatus === 'denied'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-800'
                }`}
              >
                {geoStatus === 'granted'
                  ? tr(lang, 'مفعل', 'Accordée', 'Granted')
                  : geoStatus === 'denied'
                    ? tr(lang, 'مرفوض', 'Refusée', 'Denied')
                    : tr(lang, 'بانتظار الطلب', 'À demander', 'Prompt')}
              </span>
            </div>
            {geoLabel && (
              <div className="text-[11px] text-[#5c686e]" dir="ltr">
                {geoLabel}
              </div>
            )}
            <button
              type="button"
              disabled={permBusy !== null}
              onClick={handleRequestGeoPermission}
              className="imgsend2-secondary !py-1.5 !px-3 text-xs w-full"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {permBusy === 'geo'
                  ? t.loading
                  : tr(lang, 'تفعيل / تحديث إذن الموقع', 'Autoriser la position', 'Enable / Update Location')}
              </span>
            </button>
          </div>

          <div className="p-3 rounded-[5px] bg-[#f7f9fa] border border-[#d8dfe2] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-[#384D55] flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-[#83a329]" />
                <span>{tr(lang, 'إشعارات المتصفح', 'Notifications Web', 'Browser Notifications')}</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  notifStatus === 'granted'
                    ? 'bg-[#e2efbf] text-[#2c4a12]'
                    : notifStatus === 'denied'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-800'
                }`}
              >
                {notifStatus === 'granted'
                  ? tr(lang, 'مفعل', 'Accordées', 'Granted')
                  : notifStatus === 'denied'
                    ? tr(lang, 'مرفوض', 'Bloquées', 'Denied')
                    : tr(lang, 'بانتظار الطلب', 'Par défaut', 'Default')}
              </span>
            </div>
            <p className="text-[11px] text-[#6b787e]">
              {tr(
                lang,
                'تنبيهات الدروس الجديدة، حالة طلب الاشتراك، وردود الدعم.',
                'Alertes de cours, validation de paiement et réponses du support.',
                'Alerts for new lessons, payment review, and support replies.'
              )}
            </p>
            <button
              type="button"
              disabled={permBusy !== null}
              onClick={() => void handleRequestNotifPermission()}
              className="imgsend2-secondary !py-1.5 !px-3 text-xs w-full"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>
                {permBusy === 'notif'
                  ? t.loading
                  : tr(lang, 'تفعيل إشعارات المتصفح', 'Activer les notifications', 'Enable Notifications')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
