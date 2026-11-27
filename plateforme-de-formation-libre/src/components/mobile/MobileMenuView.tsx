import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  Building2,
  Calculator,
  Check,
  Copy,
  CreditCard,
  Gift,
  HelpCircle,
  KeyRound,
  Languages,
  Laptop,
  Layers,
  LogOut,
  MapPin,
  MessageSquarePlus,
  Moon,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  User as UserIcon,
  Users,
  Volume2,
  Wallet,
} from 'lucide-react';
import { VerifiedBadge } from '../VerifiedBadge';
import { useApp } from '../../context/AppContext';
import type {
  Language,
  PaymentTransaction,
  ReferralSummary,
  SubscriptionRequest,
  UserSessionItem,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { formatUserLevelDisplay } from '../../utils/levelLabels';
import { localeCode, tr } from '../../utils/locale';
import {
  MobilePaymentMethodsScreen,
  type MobilePaymentMethodId,
} from './MobilePaymentMethods';
import {
  MobileDarkSheet,
  MobileGreenSwitch,
  MobileLeafEmblemGraphic,
  MobileListRow,
} from './MobilePrimitives';
import { MobileSubscriptionsView } from './MobileSubscriptionViews';

export type MobileMenuSubView =
  | 'root'
  | 'profile'
  | 'rewards'
  | 'settings'
  | 'payment-methods'
  | 'subscriptions'
  | 'notifications'
  | 'payments'
  | 'sessions'
  | 'feedback';

export const MobileMenuView: React.FC<{
  subView: MobileMenuSubView;
  onChangeSubView: (v: MobileMenuSubView) => void;
  preselectedPayMethod?: MobilePaymentMethodId;
  onSelectPayMethodForSub?: (m: MobilePaymentMethodId) => void;
  onJumpToQuestionBank: () => void;
  onJumpToReviewCenter: () => void;
  onJumpToBaccalaureate: () => void;
  onNotice?: (text: string, ok?: boolean) => void;
}> = ({
  subView,
  onChangeSubView,
  preselectedPayMethod,
  onSelectPayMethodForSub,
  onJumpToQuestionBank,
  onJumpToReviewCenter,
  onJumpToBaccalaureate,
  onNotice,
}) => {
  const {
    lang,
    setLang,
    theme,
    toggleTheme,
    user,
    notifications,
    unreadNotificationCount,
    markNotificationsRead,
    notificationSoundEnabled,
    toggleNotificationSound,
    refreshUser,
    navigate,
    logout,
  } = useApp();
  const isAr = lang === 'ar';

  const [permSheet, setPermSheet] = useState<'geo' | 'notif' | null>(null);
  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [logoutSheetOpen, setLogoutSheetOpen] = useState(false);

  const [statusBanner, setStatusBanner] = useState<{ text: string; ok: boolean } | null>(null);

  // Referrals / Rewards
  const [referralData, setReferralData] = useState<ReferralSummary | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [redeemBusy, setRedeemBusy] = useState(false);

  // Profile edit
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editCity, setEditCity] = useState(user?.city || '');
  const [editTrack, setEditTrack] = useState<'arabic' | 'french' | 'bilingual'>(
    user?.track || 'bilingual'
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Settings permissions state
  const [geoStatus, setGeoStatus] = useState<string>(user?.geo_permission_status || 'prompt');
  const [notifStatus, setNotifStatus] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return window.Notification.permission;
    }
    return user?.notification_permission_status || 'default';
  });

  // Payments & Sessions
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);

  // Feature Request / Report
  const [reportType, setReportType] = useState<'suggestion' | 'bug' | 'content_error'>('suggestion');
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const showNotice = (text: string, ok = true) => {
    setStatusBanner({ text, ok });
    onNotice?.(text, ok);
    window.setTimeout(() => setStatusBanner(null), 4000);
  };

  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditPhone(user.phone || '');
      setEditCity(user.city || '');
      setEditTrack(user.track || 'bilingual');
      setGeoStatus(user.geo_permission_status || 'prompt');
    }
  }, [user]);

  const loadReferrals = useCallback(async () => {
    const res = await apiRequest<ReferralSummary>('/api/referrals/me').catch(() => null);
    if (res) setReferralData(res);
  }, []);

  const loadPayments = useCallback(async () => {
    const [pRes, rRes] = await Promise.all([
      apiRequest<{ transactions?: PaymentTransaction[] }>('/api/payments/mine').catch(() => ({
        transactions: [],
      })),
      apiRequest<{ requests?: SubscriptionRequest[] }>('/api/payment-requests/mine').catch(() => ({
        requests: [],
      })),
    ]);
    setPayments(pRes.transactions || []);
    setRequests(rRes.requests || []);
  }, []);

  const loadSessions = useCallback(async () => {
    const res = await apiRequest<{ sessions?: UserSessionItem[] }>('/api/auth/sessions').catch(() => ({
      sessions: [],
    }));
    setSessions(res.sessions || []);
  }, []);

  useEffect(() => {
    if (subView === 'rewards') void loadReferrals();
    if (subView === 'payments') void loadPayments();
    if (subView === 'sessions') void loadSessions();
    if (subView === 'notifications' && unreadNotificationCount > 0) {
      void markNotificationsRead();
    }
  }, [subView, loadReferrals, loadPayments, loadSessions, unreadNotificationCount, markNotificationsRead]);

  const isPaid = Boolean(user?.activeSubscription && user.activeSubscription.billing_cycle !== 'free');

  // Strict Role-Based Gating for Dashboard Shortcuts
  const canOpenAdmin = Boolean(user?.isAdmin || (user?.permissions && user.permissions.length > 0));
  const canOpenTeacher = Boolean(
    user?.isAdmin ||
      user?.role === 'teacher' ||
      user?.level === 'teacher' ||
      user?.level === 'professor'
  );
  const canOpenSchool = Boolean(user?.isAdmin || user?.institution);

  const handleRequestGeo = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showNotice(
        tr(lang, 'المتصفح لا يدعم الموقع الجغرافي.', 'Géolocalisation non supportée.', 'Geolocation unsupported.'),
        false
      );
      setPermSheet(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const label = `${lat}, ${lng}`;
        setGeoStatus('granted');
        setPermSheet(null);
        await apiRequest('/api/auth/permissions', {
          method: 'PATCH',
          json: { geoPermissionStatus: 'granted', lat, lng, geoLabel: label },
        }).catch(() => {});
        await refreshUser();
        showNotice(tr(lang, 'تم تفعيل إذن الموقع الجغرافي.', 'Géolocalisation activée.', 'Location enabled.'));
      },
      async () => {
        setGeoStatus('denied');
        setPermSheet(null);
        await apiRequest('/api/auth/permissions', {
          method: 'PATCH',
          json: { geoPermissionStatus: 'denied' },
        }).catch(() => {});
        showNotice(
          tr(lang, 'تم رفض إذن الموقع من المتصفح.', 'Permission refusée par le navigateur.', 'Location denied.'),
          false
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const handleRequestNotif = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermSheet(null);
      showNotice(
        tr(lang, 'إشعارات المتصفح غير مدعومة هنا.', 'Notifications non supportées.', 'Notifications unsupported.'),
        false
      );
      return;
    }
    const result = await window.Notification.requestPermission();
    setNotifStatus(result);
    setPermSheet(null);
    await apiRequest('/api/auth/permissions', {
      method: 'PATCH',
      json: { notificationPermissionStatus: result },
    }).catch(() => {});
    showNotice(
      result === 'granted'
        ? tr(lang, 'تم تفعيل إشعارات المتصفح.', 'Notifications activées.', 'Notifications enabled.')
        : tr(lang, 'لم يتم منح إذن الإشعارات.', 'Notifications refusées.', 'Permission not granted.'),
      result === 'granted'
    );
  };

  return (
    <div className="space-y-4">
      {statusBanner && (
        <div
          className="tdr-m-card p-3.5 text-xs font-extrabold border"
          style={
            statusBanner.ok
              ? { background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)', borderColor: 'var(--m-brand-border)' }
              : { background: 'var(--m-errbg)', color: 'var(--m-err)', borderColor: 'var(--m-errline)' }
          }
        >
          {statusBanner.text}
        </div>
      )}

      {/* ====================================================================
          ROOT MENU VIEW
          ==================================================================== */}
      {subView === 'root' && (
        <div className="space-y-3.5">
          {/* Official Green Pro Card with Brand Pill + Laurel Leaf Emblem */}
          <button
            type="button"
            onClick={() => onChangeSubView('subscriptions')}
            className="tdr-m-hero-card w-full text-start cursor-pointer active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2 min-w-0 flex-1">
                <span className="tdr-m-brand-pill">
                  {isPaid
                    ? tr(lang, 'نسخة محترفة نشطة', 'Version Pro Active', 'Pro Active')
                    : tr(lang, 'انتقل إلى النسخة المحترفة', 'Passer à la version Pro', 'Go Pro')}
                </span>
                <div className="text-xl font-extrabold tdr-m-kufi leading-tight pt-1">
                  {isPaid
                    ? isAr
                      ? user?.activeSubscription?.name_ar || 'وصول غير محدود'
                      : user?.activeSubscription?.name_fr || 'Accès illimité'
                    : tr(lang, 'وصول غير محدود', 'Accès illimité', 'Unlimited Access')}
                </div>
                <div className="text-xs opacity-90">
                  {tr(
                    lang,
                    'تعلّم وتدرّب بلا قيود أو عوائق',
                    'Apprenez et révisez sans limites',
                    'Study & practice without limits'
                  )}
                </div>
              </div>
              <MobileLeafEmblemGraphic />
            </div>
          </button>

          {/* Menu List Rows */}
          <div className="space-y-2.5">
            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<UserIcon className="w-5 h-5" />}
              title={tr(lang, 'حسابي والملف الشخصي', 'Mon profil', 'My Profile')}
              subtitle={user?.email}
              onClick={() => onChangeSubView('profile')}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Wallet className="w-5 h-5" />}
              title={tr(lang, 'طرق الدفع', 'Moyens de paiement', 'Payment Methods')}
              subtitle={tr(lang, 'السداد، مصرفي، بنكيلي، Visa و Mastercard', 'Sedad, Masrvi, Bankily, Cartes', 'Sedad, Masrvi, Bankily, Cards')}
              onClick={() => onChangeSubView('payment-methods')}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Gift className="w-5 h-5" />}
              title={tr(lang, 'المكافآت والإحالات', 'Récompenses & Parrainage', 'Rewards & Referrals')}
              subtitle={tr(
                lang,
                `نقاطك: ${user?.referral_points ?? 0}`,
                `Points : ${user?.referral_points ?? 0}`,
                `Points: ${user?.referral_points ?? 0}`
              )}
              onClick={() => onChangeSubView('rewards')}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Layers className="w-5 h-5" />}
              title={tr(lang, 'مركز المراجعة', 'Centre de révision', 'Review Center')}
              onClick={onJumpToReviewCenter}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<HelpCircle className="w-5 h-5" />}
              title={tr(lang, 'بنك الأسئلة', 'Banque de questions', 'Question Bank')}
              onClick={onJumpToQuestionBank}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Calculator className="w-5 h-5" />}
              title={tr(lang, 'حاسبة البكالوريا', 'Calculateur Baccalauréat', 'Baccalaureate GPA')}
              onClick={onJumpToBaccalaureate}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Bell className="w-5 h-5" />}
              title={tr(lang, 'الإشعارات', 'Notifications', 'Notifications')}
              trailing={
                unreadNotificationCount > 0 ? (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-extrabold"
                    style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }}
                  >
                    {unreadNotificationCount}
                  </span>
                ) : undefined
              }
              onClick={() => onChangeSubView('notifications')}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Settings className="w-5 h-5" />}
              title={tr(lang, 'الإعدادات', 'Paramètres', 'Settings')}
              onClick={() => onChangeSubView('settings')}
            />

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              icon={<Languages className="w-5 h-5" />}
              title={tr(lang, 'تغيير اللغة', 'Changer de langue', 'Change Language')}
              subtitle={lang === 'ar' ? 'العربية' : lang === 'fr' ? 'Français' : 'English'}
              onClick={() => setLangSheetOpen(true)}
            />

            {/* Role-Gated Dashboards ONLY when authorized */}
            {canOpenTeacher && (
              <MobileListRow
                dir={isAr ? 'rtl' : 'ltr'}
                icon={<Users className="w-5 h-5" />}
                title={tr(lang, 'لوحة المعلم والأقسام', 'Espace enseignant', 'Teacher Dashboard')}
                subtitle={tr(lang, 'إدارة أقسامك وطلابك', 'Gérer vos sections', 'Manage sections')}
                onClick={() => navigate('teacher-dashboard')}
              />
            )}

            {canOpenSchool && (
              <MobileListRow
                dir={isAr ? 'rtl' : 'ltr'}
                icon={<Building2 className="w-5 h-5" />}
                title={tr(lang, 'بوابة المدرسة', 'Portail école', 'School Portal')}
                subtitle={user?.institution || ''}
                onClick={() => navigate('school-dashboard')}
              />
            )}

            {canOpenAdmin && (
              <MobileListRow
                dir={isAr ? 'rtl' : 'ltr'}
                icon={<ShieldCheck className="w-5 h-5" />}
                title={tr(lang, 'لوحة الإدارة', 'Panneau Admin', 'Admin Console')}
                subtitle={tr(lang, 'صلاحيات الإدارة الرسمية', 'Accès administrateur', 'Official administration')}
                onClick={() => navigate('admin')}
              />
            )}

            <MobileListRow
              dir={isAr ? 'rtl' : 'ltr'}
              danger
              icon={<LogOut className="w-5 h-5" />}
              title={tr(lang, 'تسجيل الخروج', 'Déconnexion', 'Sign Out')}
              onClick={() => setLogoutSheetOpen(true)}
            />
          </div>

          <div className="pt-4 pb-2 text-center text-xs space-y-1" style={{ color: 'var(--m-muted)' }}>
            <div className="font-bold tdr-m-kufi">منصة تدريبي التعليمية — Tadreebi</div>
            <div className="tabular-nums">الإصدار: 2.0.0</div>
          </div>
        </div>
      )}

      {/* ====================================================================
          PAYMENT METHODS SCREEN
          ==================================================================== */}
      {subView === 'payment-methods' && (
        <MobilePaymentMethodsScreen
          onOpenSubscriptions={(m) => {
            onSelectPayMethodForSub?.(m || 'sedad');
            onChangeSubView('subscriptions');
          }}
          onNotice={showNotice}
        />
      )}

      {/* ====================================================================
          SUBSCRIPTIONS & STICKY CHECKOUT VIEW
          ==================================================================== */}
      {subView === 'subscriptions' && (
        <MobileSubscriptionsView
          preselectedMethod={preselectedPayMethod}
          onNotice={showNotice}
        />
      )}

      {/* ====================================================================
          REWARDS & REFERRALS VIEW
          ==================================================================== */}
      {subView === 'rewards' && (() => {
        const refCode = referralData?.referralCode || user?.referral_code || '';
        const inviteUrl =
          referralData?.inviteUrl ||
          (refCode ? `https://tadribi.chtbqi.com/?ref=${encodeURIComponent(refCode)}` : '');
        const pts = Number(referralData?.referralPoints ?? user?.referral_points ?? 0);
        const threshold = Number(referralData?.settings?.reward_threshold_points || 1000);
        const ptsPerRef = Number(referralData?.settings?.points_per_referral || 200);
        const rewardDays = Number(referralData?.settings?.reward_duration_days || 30);
        const pct = Math.min(100, Math.round((pts / Math.max(1, threshold)) * 100));
        const verifiedRefs = Number(referralData?.verifiedCount || 0);

        return (
          <div className="space-y-4">
            <div className="tdr-m-hero-card space-y-3 py-6">
              <h2 className="text-lg font-extrabold tdr-m-kufi">
                {tr(lang, 'كيف يعمل:', 'Comment ça marche :', 'How it works:')}
              </h2>
              <p className="text-sm leading-7 opacity-95">
                {tr(
                  lang,
                  `1. شارك رابط الإحالة الرسمي الخاص بك مع زملائك. تحصل على ${ptsPerRef} نقطة عن كل صديق يفعل حسابه.`,
                  `1. Partagez votre lien de parrainage officiel. Vous gagnez ${ptsPerRef} points par ami vérifié.`,
                  `1. Share your official referral link. Earn ${ptsPerRef} points for each verified friend.`
                )}
              </p>
              <p className="text-sm leading-7 opacity-95">
                {tr(
                  lang,
                  `2. عند الوصول إلى ${threshold} نقطة يمكنك استبدالها باشتراك مدفوع مجاني لمدة ${rewardDays} يوماً.`,
                  `2. Atteignez ${threshold} points pour débloquer ${rewardDays} jours d’abonnement gratuit.`,
                  `2. Reach ${threshold} points to redeem ${rewardDays} free subscription days.`
                )}
              </p>
            </div>

            <div className="tdr-m-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold tdr-m-kufi">
                    {tr(lang, 'مكافآت الإحالة', 'Récompenses de parrainage', 'Referral Rewards')}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--m-ink-sub)' }}>
                    {tr(
                      lang,
                      `تمت مكافأة ${verifiedRefs} إحالات • رصيدك ${pts} / ${threshold} نقطة`,
                      `${verifiedRefs} parrainages validés • ${pts} / ${threshold} pts`,
                      `${verifiedRefs} verified referrals • ${pts} / ${threshold} pts`
                    )}
                  </p>
                </div>
                <Star
                  className="w-7 h-7 shrink-0"
                  color="var(--m-brand-d)"
                  fill="var(--m-brand)"
                />
              </div>

              <div className="relative pt-2 pb-1">
                <div
                  className="h-2.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--m-brand-soft)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(6, pct)}%`, background: 'var(--m-brand-d)' }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold mt-2" style={{ color: 'var(--m-muted)' }}>
                  <span>0</span>
                  <span>{Math.round(threshold / 2)}</span>
                  <span style={{ color: 'var(--m-brand-deep)' }}>{threshold} ★</span>
                </div>
              </div>

              {inviteUrl && (
                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--m-border)' }}>
                  <div
                    dir="ltr"
                    className="p-3 rounded-xl text-xs font-mono truncate border tdr-m-selectable"
                    style={{ background: 'var(--m-surface-muted)', borderColor: 'var(--m-border)' }}
                  >
                    {inviteUrl}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        setCopiedRef(true);
                        window.setTimeout(() => setCopiedRef(false), 2000);
                      } catch {
                        // ignore
                      }
                    }}
                    className="tdr-m-btn-secondary w-full"
                  >
                    {copiedRef ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>
                      {copiedRef
                        ? tr(lang, 'تم نسخ الرابط الرسمي', 'Lien copié !', 'Copied!')
                        : tr(lang, 'نسخ رابط الإحالة الرسمي', 'Copier le lien officiel', 'Copy Official Link')}
                    </span>
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={redeemBusy || !referralData?.canRedeem}
                onClick={async () => {
                  setRedeemBusy(true);
                  try {
                    await apiRequest('/api/referrals/redeem', { method: 'POST', json: {} });
                    await Promise.all([loadReferrals(), refreshUser()]);
                    showNotice(
                      tr(lang, 'تم تفعيل مكافأة الاشتراك بنجاح!', 'Récompense activée !', 'Reward redeemed!')
                    );
                  } catch (err: any) {
                    showNotice(err?.message || 'Error', false);
                  } finally {
                    setRedeemBusy(false);
                  }
                }}
                className="tdr-m-btn-primary"
              >
                <Gift className="w-4 h-4" />
                <span>
                  {referralData?.canRedeem
                    ? tr(lang, 'استبدال النقاط الآن', 'Échanger mes points', 'Redeem Points Now')
                    : tr(
                        lang,
                        `يتبقى ${Math.max(0, threshold - pts)} نقطة للمكافأة`,
                        `Encore ${Math.max(0, threshold - pts)} pts`,
                        `${Math.max(0, threshold - pts)} pts left`
                      )}
                </span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* ====================================================================
          SETTINGS VIEW
          ==================================================================== */}
      {subView === 'settings' && (
        <div className="space-y-3">
          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Award className="w-5 h-5" />}
            title={tr(lang, 'إدارة الاشتراك والباقة', 'Gérer l’abonnement', 'Manage Subscription')}
            subtitle={
              isPaid
                ? isAr
                  ? user?.activeSubscription?.name_ar
                  : user?.activeSubscription?.name_fr
                : tr(lang, 'الباقة المجانية', 'Offre gratuite', 'Free Tier')
            }
            onClick={() => onChangeSubView('subscriptions')}
          />

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Wallet className="w-5 h-5" />}
            title={tr(lang, 'طرق الدفع', 'Moyens de paiement', 'Payment Methods')}
            subtitle={tr(lang, 'السداد، مصرفي، بنكيلي، Visa و Mastercard', 'Portefeuilles & Cartes', 'Wallets & Cards')}
            onClick={() => onChangeSubView('payment-methods')}
          />

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Receipt className="w-5 h-5" />}
            title={tr(lang, 'سجل المدفوعات والفواتير', 'Historique des paiements', 'Payment History')}
            onClick={() => onChangeSubView('payments')}
          />

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Smartphone className="w-5 h-5" />}
            title={tr(lang, 'الأجهزة والجلسات النشطة', 'Sessions actives', 'Active Sessions')}
            onClick={() => onChangeSubView('sessions')}
          />

          {/* Official Green "لديك فكرة؟ / طلب ميزة" Banner Card */}
          <div className="tdr-m-hero-card flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(28, 42, 14, 0.14)' }}
              >
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold tdr-m-kufi">
                  {tr(lang, 'لديك فكرة؟', 'Une idée ?', 'Have an idea?')}
                </div>
                <div className="text-xs opacity-90 truncate">
                  {tr(lang, 'اقترح ميزة أو أبلغ عن خلل', 'Suggérer une fonctionnalité', 'Suggest a feature')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChangeSubView('feedback')}
              className="min-h-[40px] px-4 rounded-full text-xs font-extrabold shrink-0 cursor-pointer shadow-sm"
              style={{ background: '#1c2a0e', color: '#e6f2c4' }}
            >
              {tr(lang, 'طلب ميزة', 'Proposer', 'Request')}
            </button>
          </div>

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Volume2 className="w-5 h-5" />}
            title={tr(lang, 'أصوات الإشعارات', 'Sons de notification', 'Notification Sounds')}
            trailing={
              <MobileGreenSwitch
                checked={notificationSoundEnabled}
                onChange={() => void toggleNotificationSound()}
                ariaLabel="Toggle notification sound"
              />
            }
          />

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Bell className="w-5 h-5" />}
            title={tr(lang, 'إشعارات المتصفح', 'Notifications push', 'Browser Notifications')}
            subtitle={notifStatus === 'granted' ? tr(lang, 'مفعّل', 'Activé', 'Granted') : tr(lang, 'غير مفعّل', 'Désactivé', 'Off')}
            trailing={
              <MobileGreenSwitch
                checked={notifStatus === 'granted'}
                onChange={() => setPermSheet('notif')}
                ariaLabel="Toggle browser notifications"
              />
            }
          />

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<MapPin className="w-5 h-5" />}
            title={tr(lang, 'إذن الموقع الجغرافي', 'Localisation', 'Location Permission')}
            subtitle={geoStatus === 'granted' ? tr(lang, 'مسموح', 'Autorisé', 'Allowed') : tr(lang, 'حسب الطلب', 'Sur demande', 'Prompt')}
            trailing={
              <MobileGreenSwitch
                checked={geoStatus === 'granted'}
                onChange={() => setPermSheet('geo')}
                ariaLabel="Toggle geolocation permission"
              />
            }
          />

          <MobileListRow
            dir={isAr ? 'rtl' : 'ltr'}
            icon={<Moon className="w-5 h-5" />}
            title={tr(lang, 'الوضع الليلي', 'Mode sombre', 'Dark Mode')}
            trailing={
              <MobileGreenSwitch
                checked={theme === 'dark'}
                onChange={toggleTheme}
                ariaLabel="Toggle dark theme"
              />
            }
          />
        </div>
      )}

      {/* ====================================================================
          PROFILE SUB-VIEW
          ==================================================================== */}
      {subView === 'profile' && user && (
        <div className="space-y-4">
          <div className="tdr-m-hero-card flex items-center gap-3.5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold shrink-0"
              style={{ background: '#1c2a0e', color: '#e6f2c4' }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-extrabold tdr-m-kufi truncate">{user.name}</h2>
                {Boolean(user.verified_account) && <VerifiedBadge size="sm" />}
              </div>
              <div className="text-xs opacity-90 truncate" dir="ltr">
                {user.email}
              </div>
              <div className="text-[11px] opacity-85 mt-0.5">
                {formatUserLevelDisplay(
                  lang,
                  user.level,
                  user.teacher_category,
                  user.professor_specialty
                )}
              </div>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingProfile(true);
              try {
                await apiRequest('/api/auth/profile', {
                  method: 'PATCH',
                  json: {
                    name: editName.trim(),
                    phone: editPhone.trim(),
                    city: editCity.trim(),
                    track: editTrack,
                  },
                });
                await refreshUser();
                showNotice(tr(lang, 'تم تحديث بيانات الحساب.', 'Profil mis à jour.', 'Profile saved.'));
              } catch (err: any) {
                showNotice(err?.message || 'Error', false);
              } finally {
                setSavingProfile(false);
              }
            }}
            className="tdr-m-card p-5 space-y-3"
          >
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                {tr(lang, 'الاسم الكامل', 'Nom complet', 'Full Name')}
              </label>
              <input
                type="text"
                className="tdr-m-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                {tr(lang, 'رقم الهاتف', 'Téléphone', 'Phone')}
              </label>
              <input
                type="tel"
                dir="ltr"
                className="tdr-m-input"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                  {tr(lang, 'المدينة', 'Ville', 'City')}
                </label>
                <input
                  type="text"
                  className="tdr-m-input"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                  {tr(lang, 'المسار', 'Filière', 'Track')}
                </label>
                <select
                  className="tdr-m-select"
                  value={editTrack}
                  onChange={(e) => setEditTrack(e.target.value as any)}
                >
                  <option value="bilingual">{tr(lang, 'مزدوج', 'Bilingue', 'Bilingual')}</option>
                  <option value="arabic">{tr(lang, 'عربي', 'Arabe', 'Arabic')}</option>
                  <option value="french">{tr(lang, 'فرنسي', 'Français', 'French')}</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={savingProfile} className="tdr-m-btn-primary">
              {savingProfile
                ? tr(lang, 'جارٍ الحفظ...', 'Enregistrement...', 'Saving...')
                : tr(lang, 'حفظ التعديلات', 'Enregistrer', 'Save Changes')}
            </button>
          </form>
        </div>
      )}

      {/* ====================================================================
          NOTIFICATIONS VIEW
          ==================================================================== */}
      {subView === 'notifications' && (
        <div className="space-y-2.5">
          {notifications.length === 0 ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {tr(lang, 'لا توجد إشعارات حالياً.', 'Aucune notification.', 'No notifications yet.')}
            </div>
          ) : (
            notifications.map((n, idx) => (
              <div key={n.firestoreId || n.id || idx} className="tdr-m-card p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold">
                    {isAr ? n.title_ar : n.title_fr || n.title_ar}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--m-muted)' }}>
                    {new Date(n.created_at).toLocaleDateString(localeCode(lang))}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--m-ink-sub)' }}>
                  {isAr ? n.body_ar : n.body_fr || n.body_ar}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ====================================================================
          PAYMENTS HISTORY VIEW
          ==================================================================== */}
      {subView === 'payments' && (
        <div className="space-y-2.5">
          {payments.length === 0 && requests.length === 0 ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {tr(lang, 'لا توجد عمليات دفع مسجلة.', 'Aucun paiement enregistré.', 'No payment records.')}
            </div>
          ) : (
            <>
              {payments.map((tx) => (
                <MobileListRow
                  key={tx.id}
                  dir={isAr ? 'rtl' : 'ltr'}
                  icon={<CreditCard className="w-5 h-5" />}
                  title={isAr ? tx.plan_name_ar || tx.provider : tx.plan_name_fr || tx.provider}
                  subtitle={`${tx.amount_mru} ${tx.currency} • ${tx.status}`}
                  trailing={
                    <span className="text-xs font-extrabold" style={{ color: 'var(--m-brand-deep)' }}>
                      {tx.status}
                    </span>
                  }
                />
              ))}
              {requests.map((r) => (
                <MobileListRow
                  key={r.subscription_request_id}
                  dir={isAr ? 'rtl' : 'ltr'}
                  icon={<Receipt className="w-5 h-5" />}
                  title={r.plan_name}
                  subtitle={`${r.amount} ${r.currency} • ${r.payment_method}`}
                  trailing={
                    <span className="text-xs font-extrabold" style={{ color: 'var(--m-brand-deep)' }}>
                      {r.status}
                    </span>
                  }
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ====================================================================
          SESSIONS VIEW
          ==================================================================== */}
      {subView === 'sessions' && (
        <div className="space-y-3">
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={async () => {
                await apiRequest('/api/auth/sessions/revoke-others', { method: 'POST', json: {} });
                await loadSessions();
                showNotice(tr(lang, 'تم إنهاء الجلسات الأخرى.', 'Autres sessions fermées.', 'Other sessions revoked.'));
              }}
              className="tdr-m-btn-secondary w-full"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{tr(lang, 'تسجيل الخروج من جميع الأجهزة الأخرى', 'Déconnecter les autres appareils', 'Sign Out Other Devices')}</span>
            </button>
          )}
          {sessions.map((s) => (
            <MobileListRow
              key={s.session_id}
              dir={isAr ? 'rtl' : 'ltr'}
              icon={s.device_type === 'mobile' ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
              title={s.device_name || `${s.browser} • ${s.os}`}
              subtitle={
                s.is_current
                  ? tr(lang, 'هذا الجهاز الحالي', 'Appareil actuel', 'Current device')
                  : s.approx_location || new Date(s.last_active_at).toLocaleDateString(localeCode(lang))
              }
              trailing={
                s.is_current ? (
                  <span className="text-xs font-extrabold" style={{ color: 'var(--m-ok)' }}>
                    {tr(lang, 'نشط', 'Actif', 'Active')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/auth/sessions/${encodeURIComponent(s.session_id)}`, {
                        method: 'DELETE',
                      });
                      await loadSessions();
                    }}
                    className="text-xs font-extrabold px-2 py-1 cursor-pointer"
                    style={{ color: 'var(--m-err)' }}
                  >
                    {tr(lang, 'إنهاء', 'Fermer', 'Revoke')}
                  </button>
                )
              }
            />
          ))}
        </div>
      )}

      {/* ====================================================================
          FEEDBACK / FEATURE REQUEST VIEW
          ==================================================================== */}
      {subView === 'feedback' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reportReason.trim() || !reportDesc.trim()) return;
            setReportBusy(true);
            try {
              await apiRequest('/api/reports', {
                method: 'POST',
                json: {
                  reportType,
                  reason: reportReason.trim(),
                  description: reportDesc.trim(),
                },
              });
              setReportReason('');
              setReportDesc('');
              onChangeSubView('settings');
              showNotice(tr(lang, 'شكراً لك! تم استلام اقتراحك.', 'Merci ! Demande envoyée.', 'Thank you! Sent.'));
            } catch (err: any) {
              showNotice(err?.message || 'Error', false);
            } finally {
              setReportBusy(false);
            }
          }}
          className="tdr-m-card p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--m-brand-d)' }} />
            <h3 className="text-base font-extrabold tdr-m-kufi">
              {tr(lang, 'طلب ميزة أو إرسال ملاحظة', 'Suggérer ou signaler', 'Feature Request / Report')}
            </h3>
          </div>
          <select
            className="tdr-m-select"
            value={reportType}
            onChange={(e) => setReportType(e.target.value as any)}
          >
            <option value="suggestion">{tr(lang, 'اقتراح ميزة جديدة', 'Suggestion', 'Feature Request')}</option>
            <option value="bug">{tr(lang, 'مشكلة تقنية', 'Bug technique', 'Technical Issue')}</option>
            <option value="content_error">{tr(lang, 'خطأ في المحتوى', 'Erreur de contenu', 'Content Error')}</option>
          </select>
          <input
            type="text"
            required
            placeholder={tr(lang, 'عنوان الطلب', 'Titre', 'Subject')}
            className="tdr-m-input"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
          />
          <textarea
            required
            placeholder={tr(lang, 'اكتب التفاصيل هنا...', 'Détails...', 'Details...')}
            className="tdr-m-textarea"
            value={reportDesc}
            onChange={(e) => setReportDesc(e.target.value)}
          />
          <button type="submit" disabled={reportBusy} className="tdr-m-btn-primary">
            {reportBusy ? tr(lang, 'جارٍ الإرسال...', 'Envoi...', 'Sending...') : tr(lang, 'إرسال', 'Envoyer', 'Submit')}
          </button>
        </form>
      )}

      {/* ====================================================================
          DARK BOTTOM SHEETS
          ==================================================================== */}
      <MobileDarkSheet
        open={permSheet === 'geo'}
        onClose={() => setPermSheet(null)}
        icon={<MapPin className="w-6 h-6" />}
        title={tr(
          lang,
          'هل تسمح لتطبيق تدريبي بمعرفة موقعك التقريبي؟',
          'Autoriser Tadreebi à accéder à votre position ?',
          'Allow Tadreebi location access?'
        )}
        description={tr(
          lang,
          'يُستخدم الموقع لتحسين دقة الجلسات النشطة واقتراحات المدارس والمناهج المحلية.',
          'Utilisé pour la sécurité des sessions et le contenu local.',
          'Used for session security and local educational content.'
        )}
      >
        <button
          type="button"
          onClick={handleRequestGeo}
          className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
        >
          {tr(lang, 'السماح أثناء استخدام التطبيق', 'Autoriser lorsque l’app est active', 'While using the app')}
        </button>
        <button
          type="button"
          onClick={async () => {
            setGeoStatus('denied');
            setPermSheet(null);
            await apiRequest('/api/auth/permissions', {
              method: 'PATCH',
              json: { geoPermissionStatus: 'denied' },
            }).catch(() => {});
          }}
          className="tdr-m-sheet-btn"
        >
          {tr(lang, 'عدم السماح', 'Ne pas autoriser', 'Don’t allow')}
        </button>
      </MobileDarkSheet>

      <MobileDarkSheet
        open={permSheet === 'notif'}
        onClose={() => setPermSheet(null)}
        icon={<Bell className="w-6 h-6" />}
        title={tr(
          lang,
          'هل تسمح لتطبيق تدريبي بإرسال الإشعارات؟',
          'Autoriser les notifications Tadreebi ?',
          'Allow Tadreebi notifications?'
        )}
        description={tr(
          lang,
          'ستصلك تنبيهات الدروس الجديدة ومواعيد الاختبارات ورسائل الأساتذة.',
          'Recevez les alertes des nouveaux cours, examens et messages.',
          'Receive alerts for new lessons, exams, and teacher messages.'
        )}
      >
        <button
          type="button"
          onClick={() => void handleRequestNotif()}
          className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
        >
          {tr(lang, 'السماح بالإشعارات', 'Autoriser', 'Allow')}
        </button>
        <button
          type="button"
          onClick={() => setPermSheet(null)}
          className="tdr-m-sheet-btn"
        >
          {tr(lang, 'عدم السماح', 'Ne pas autoriser', 'Don’t allow')}
        </button>
      </MobileDarkSheet>

      <MobileDarkSheet
        open={langSheetOpen}
        onClose={() => setLangSheetOpen(false)}
        icon={<Languages className="w-6 h-6" />}
        title={tr(lang, 'اختر لغة التطبيق', 'Choisir la langue', 'Select App Language')}
      >
        {(
          [
            { code: 'ar', label: 'العربية (RTL)' },
            { code: 'fr', label: 'Français' },
            { code: 'en', label: 'English' },
          ] as Array<{ code: Language; label: string }>
        ).map((opt) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => {
              setLang(opt.code);
              setLangSheetOpen(false);
            }}
            className={`tdr-m-sheet-btn ${lang === opt.code ? 'tdr-m-sheet-btn--primary' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </MobileDarkSheet>

      <MobileDarkSheet
        open={logoutSheetOpen}
        onClose={() => setLogoutSheetOpen(false)}
        icon={<KeyRound className="w-6 h-6" />}
        title={tr(lang, 'تسجيل الخروج من حسابك؟', 'Se déconnecter ?', 'Sign out of Tadreebi?')}
        description={tr(
          lang,
          'سيتم حفظ تقدمك في الدروس والامتحانات بأمان على حسابك.',
          'Votre progression est enregistrée en toute sécurité.',
          'Your lesson and exam progress is safely saved.'
        )}
      >
        <button
          type="button"
          onClick={async () => {
            setLogoutSheetOpen(false);
            await logout();
          }}
          className="tdr-m-sheet-btn tdr-m-sheet-btn--danger"
        >
          {tr(lang, 'نعم، تسجيل الخروج', 'Oui, déconnexion', 'Yes, Sign Out')}
        </button>
        <button
          type="button"
          onClick={() => setLogoutSheetOpen(false)}
          className="tdr-m-sheet-btn"
        >
          {tr(lang, 'إلغاء', 'Annuler', 'Cancel')}
        </button>
      </MobileDarkSheet>
    </div>
  );
};
