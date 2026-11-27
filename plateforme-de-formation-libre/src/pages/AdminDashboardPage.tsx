import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  Edit3,
  Eye,
  FilePlus,
  Film,
  FolderKanban,
  Gift,
  GraduationCap,
  History,
  Image,
  LayoutTemplate,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sliders,
  Trash2,
  Upload,
  Users,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import { isOfficialAdminEmail } from '../lib/firebase';
import {
  approveSubscriptionRequestInFirestore,
  createLessonSectionAdmin,
  createOrUpdateLessonAdmin,
  deleteLessonAdmin,
  deleteLessonSectionAdmin,
  deleteNotificationAdmin,
  fetchAllNotificationsAdmin,
  fetchAllOrdersAndSubscriptionsAdmin,
  fetchAllUsersForAdmin,
  fetchAuditLogsAdmin,
  fetchFirestoreLessons,
  fetchFirestoreLessonSections,
  markConversationReadByRole,
  rejectSubscriptionRequestInFirestore,
  savePlanAdmin,
  saveSiteConfigAdmin,
  seedFirestoreCatalogIfNeeded,
  sendSupportChatMessage,
  sendTargetedNotificationAdmin,
  setUserDisabledAdmin,
  subscribeAllConversationsForAdmin,
  subscribeConversationMessages,
  updateConversationStatusAdmin,
  updateLessonSectionAdmin,
  updateOrderStatusAdmin,
  updateSubscriptionStatusAdmin,
  writeAdminAuditLog,
  type AdminUserRecord,
} from '../lib/firestoreService';
import type {
  AdminAnalyticsData,
  AdminPermission,
  AuditLog,
  BacCoefficientItem,
  BacSeriesItem,
  ChatConversation,
  ChatMessage,
  ContactMessageItem,
  ElevenLabsStatus,
  ExamMode,
  HeroSlide,
  IssueReportItem,
  Lesson,
  LessonSection,
  LevelSlug,
  NotificationItem,
  NotificationTargetScope,
  PaymentMethodConfig,
  PaymentTransaction,
  PlanLimitsConfig,
  PronunciationRuleItem,
  Question,
  ReferralLogItem,
  ReferralRewardItem,
  ReferralSettings,
  SecurityEventItem,
  SubscriptionPlan,
  SubscriptionRequest,
  SubscriptionRequestStatus,
  TickerMessage,
  TrackSlug,
  UserSubscription,
} from '../types';
import {
  AdminAdministratorsTab,
  AdminDirectoryTab,
  AdminSchoolsTab,
  AdminVerificationTab,
} from '../components/admin/AdminInstitutionalPanels';
import {
  AdminExamsTab,
  AdminFilesTab,
  AdminNardoPayOrdersTab,
  AdminSystemHealthCard,
} from '../components/admin/AdminOperationsPanels';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';
import { speechEngine } from '../utils/speechEngine';

type AdminTab =
  | 'overview'
  | 'analytics'
  | 'security'
  | 'users'
  | 'students'
  | 'teachers'
  | 'professors'
  | 'schools'
  | 'verification'
  | 'lessons'
  | 'exams'
  | 'baccalaureate'
  | 'subscriptions'
  | 'payments'
  | 'reports'
  | 'contact'
  | 'referrals'
  | 'notifications'
  | 'chat'
  | 'questions'
  | 'files'
  | 'administrators'
  | 'site'
  | 'audit'
  | 'backup';

export const AdminDashboardPage: React.FC = () => {
  const {
    lang,
    user,
    firebaseUser,
    catalog,
    siteConfig,
    unreadSupportCount,
    refreshCatalog,
    refreshPlans,
  } = useApp();
  const t = getT(lang);

  const isEmailVerified = Boolean(firebaseUser?.emailVerified || user?.email_verified);
  const isSuperAdmin = Boolean(user && isEmailVerified && isOfficialAdminEmail(user.email));
  const userPermissions: AdminPermission[] = Array.isArray(user?.permissions) ? user.permissions : [];
  const hasPerm = (...required: AdminPermission[]) =>
    isSuperAdmin || required.some((p) => userPermissions.includes(p));

  const isAuthorizedAdmin = Boolean(
    user && isEmailVerified && (isSuperAdmin || user.isAdmin || userPermissions.length > 0)
  );

  const [tab, setTab] = useState<AdminTab>('overview');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Firestore Admin Datasets
  const [adminUsers, setAdminUsers] = useState<AdminUserRecord[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [adminSections, setAdminSections] = useState<LessonSection[]>([]);
  const [adminLessons, setAdminLessons] = useState<Lesson[]>([]);
  const [adminPlans, setAdminPlans] = useState<SubscriptionPlan[]>([]);
  const [adminOrders, setAdminOrders] = useState<PaymentTransaction[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<
    Array<UserSubscription & { userEmail?: string; userName?: string }>
  >([]);
  const [adminNotifications, setAdminNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // SQLite Question Bank & Exam Results (Authenticated via Firebase Bearer token)
  const [overviewApi, setOverviewApi] = useState<any>(null);
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [qPage, setQPage] = useState(1);
  const [qTotal, setQTotal] = useState(0);
  const [qTotalPages, setQTotalPages] = useState(1);
  const [qStatusFilter, setQStatusFilter] = useState<'all' | 'published' | 'review' | 'draft' | 'approved' | 'archived'>('all');
  const [qSearchFilter, setQSearchFilter] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);

  // Mauritanian Subscription Requests, Payment Methods & Free Quotas (SQLite Backend)
  const [paymentRequests, setPaymentRequests] = useState<SubscriptionRequest[]>([]);
  const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsData | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventItem[]>([]);
  const [securityRiskFilter, setSecurityRiskFilter] = useState<
    'all' | 'normal' | 'warning' | 'suspicious' | 'fraud_rejected'
  >('all');
  const [reqStatusFilter, setReqStatusFilter] = useState<'all' | SubscriptionRequestStatus>('all');
  const [previewProofReq, setPreviewProofReq] = useState<SubscriptionRequest | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [clarifyTargetId, setClarifyTargetId] = useState<number | null>(null);
  const [clarifyNoteInput, setClarifyNoteInput] = useState('');
  const [forceApproveTargetId, setForceApproveTargetId] = useState<number | null>(null);
  const [adminPaymentMethods, setAdminPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [sqlPlans, setSqlPlans] = useState<SubscriptionPlan[]>([]);
  const [freeLimits, setFreeLimits] = useState<PlanLimitsConfig>({
    plan_tier: 'free',
    daily_questions_limit: 25,
    daily_lessons_limit: 3,
    daily_exams_limit: 2,
    allow_official_sim: 0,
    allow_review_center: 1,
  });
  const [newMethodCode, setNewMethodCode] = useState('');
  const [newMethodNameAr, setNewMethodNameAr] = useState('');
  const [newMethodNameFr, setNewMethodNameFr] = useState('');
  const [newMethodBeneficiary, setNewMethodBeneficiary] = useState('');
  const [newMethodAccount, setNewMethodAccount] = useState('');
  const [newMethodInstrAr, setNewMethodInstrAr] = useState('');
  const [newMethodInstrFr, setNewMethodInstrFr] = useState('');

  // Reports & Bug Triage State
  const [adminReports, setAdminReports] = useState<IssueReportItem[]>([]);
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'open' | 'in_review' | 'resolved' | 'closed'>('all');
  const [reportEditId, setReportEditId] = useState<number | null>(null);
  const [reportStatusInput, setReportStatusInput] = useState<'open' | 'in_review' | 'resolved' | 'closed'>('in_review');
  const [reportActionInput, setReportActionInput] = useState('');
  const [reportReplyInput, setReportReplyInput] = useState('');
  const [previewReportShot, setPreviewReportShot] = useState<IssueReportItem | null>(null);

  // Contact Messages State
  const [contactMessages, setContactMessages] = useState<ContactMessageItem[]>([]);
  const [contactFilter, setContactFilter] = useState<'all' | 'unread' | 'read' | 'replied' | 'archived'>('all');
  const [contactEditId, setContactEditId] = useState<number | null>(null);
  const [contactStatusInput, setContactStatusInput] = useState<'unread' | 'read' | 'replied' | 'archived'>('read');
  const [contactNoteInput, setContactNoteInput] = useState('');

  // Referrals & Rewards Admin State
  const [referralSettings, setReferralSettings] = useState<ReferralSettings>({
    enabled: 1,
    points_per_referral: 20,
    reward_threshold_points: 1000,
    reward_duration_days: 30,
    welcome_bonus_points: 0,
    max_rewards_per_user: 12,
  });
  const [referralLogs, setReferralLogs] = useState<ReferralLogItem[]>([]);
  const [referralRewards, setReferralRewards] = useState<ReferralRewardItem[]>([]);
  const [savingReferralSettings, setSavingReferralSettings] = useState(false);

  // Baccalaureate Series & Coefficients State
  const [bacSeries, setBacSeries] = useState<BacSeriesItem[]>([]);
  const [bacCoeffs, setBacCoeffs] = useState<BacCoefficientItem[]>([]);
  const [bacFilterSeries, setBacFilterSeries] = useState<string>('all');
  const [editingBacCoeffId, setEditingBacCoeffId] = useState<number | null>(null);
  const [bacSeriesSlug, setBacSeriesSlug] = useState('SN');
  const [bacSubjectSlug, setBacSubjectSlug] = useState('');
  const [bacSubjectAr, setBacSubjectAr] = useState('');
  const [bacSubjectFr, setBacSubjectFr] = useState('');
  const [bacCoeffValue, setBacCoeffValue] = useState(2);
  const [bacMaxGrade, setBacMaxGrade] = useState(20);
  const [bacOptional, setBacOptional] = useState(false);

  // ElevenLabs HD Voice Configuration State
  const [elevenConfig, setElevenConfig] = useState<ElevenLabsStatus>({
    enabled: false,
    configured: false,
    freeTierAllowed: false,
    voiceIdAr: 'pNInz6obpgDQGcFmaJgB',
    voiceIdFr: '21m00Tcm4TlvDq8ikWAM',
    modelId: 'eleven_multilingual_v2',
    source: 'none',
    maskedHint: '',
  });
  const [elevenApiKeyInput, setElevenApiKeyInput] = useState('');
  const [savingElevenLabs, setSavingElevenLabs] = useState(false);

  // Pronunciation Dictionary State
  const [pronRules, setPronRules] = useState<PronunciationRuleItem[]>([]);
  const [pPattern, setPPattern] = useState('');
  const [pReplacement, setPReplacement] = useState('');
  const [pLang, setPLang] = useState<'ar' | 'fr' | 'all'>('ar');
  const [pMatchType, setPMatchType] = useState<'word' | 'exact' | 'regex'>('word');
  const [pNotes, setPNotes] = useState('');
  const [pTestText, setPTestText] = useState('');

  // Live Support Chat State
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [chatFilter, setChatFilter] = useState<'all' | 'open' | 'pending' | 'closed'>('all');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [adminChatReply, setAdminChatReply] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Lesson Section Form State
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [secTitleAr, setSecTitleAr] = useState('');
  const [secTitleFr, setSecTitleFr] = useState('');
  const [secDescAr, setSecDescAr] = useState('');
  const [secDescFr, setSecDescFr] = useState('');
  const [secSubject, setSecSubject] = useState('arabic-language');
  const [secTrack, setSecTrack] = useState<TrackSlug>('all');
  const [secLevel, setSecLevel] = useState<LevelSlug>('foundation');
  const [secOrder, setSecOrder] = useState(1);
  const [secActive, setSecActive] = useState(true);

  // Lesson CRUD Form State
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lSubject, setLSubject] = useState('arabic-language');
  const [lSectionId, setLSectionId] = useState<string>('');
  const [lTrack, setLTrack] = useState<TrackSlug>('arabic');
  const [lLevel, setLLevel] = useState<LevelSlug>('foundation');
  const [lOrder, setLOrder] = useState(1);
  const [lTitleAr, setLTitleAr] = useState('');
  const [lTitleFr, setLTitleFr] = useState('');
  const [lSummaryAr, setLSummaryAr] = useState('');
  const [lSummaryFr, setLSummaryFr] = useState('');
  const [lExpAr, setLExpAr] = useState('');
  const [lExpFr, setLExpFr] = useState('');
  const [lActive, setLActive] = useState(true);

  // Plan Editing State
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

  // Targeted Notification State
  const [notifScope, setNotifScope] = useState<NotificationTargetScope>('current_users');
  const [notifType, setNotifType] = useState<'info' | 'exam' | 'alert' | 'offer'>('info');
  const [notifTrack, setNotifTrack] = useState<TrackSlug>('all');
  const [notifLevel, setNotifLevel] = useState<'all' | LevelSlug>('all');
  const [notifSubFilter, setNotifSubFilter] = useState<'all' | 'paid' | 'free'>('all');
  const [notifTargetUids, setNotifTargetUids] = useState<string[]>([]);
  const [notifTitleAr, setNotifTitleAr] = useState('');
  const [notifTitleFr, setNotifTitleFr] = useState('');
  const [notifBodyAr, setNotifBodyAr] = useState('');
  const [notifBodyFr, setNotifBodyFr] = useState('');

  // Question Bank State
  const [qSubject, setQSubject] = useState('education-sciences');
  const [qTrack, setQTrack] = useState('all');
  const [qLevel, setQLevel] = useState('foundation');
  const [qStemAr, setQStemAr] = useState('');
  const [qStemFr, setQStemFr] = useState('');
  const [qOptAr, setQOptAr] = useState(['', '', '', '']);
  const [qOptFr, setQOptFr] = useState(['', '', '', '']);
  const [qCorrect, setQCorrect] = useState(0);
  const [qExpAr, setQExpAr] = useState('');
  const [qExpFr, setQExpFr] = useState('');
  const [importJson, setImportJson] = useState('');

  // Site Config & Grading Policy State
  const [maxScore, setMaxScore] = useState(catalog.gradingPolicy?.maxScore || 20);
  const [wrongPenalty, setWrongPenalty] = useState(catalog.gradingPolicy?.wrongPenalty || 0);
  const [passingScore, setPassingScore] = useState(catalog.gradingPolicy?.passingScore || 10);
  const [editTicker, setEditTicker] = useState<TickerMessage[]>(siteConfig.tickerMessages || []);
  const [editSlides, setEditSlides] = useState<HeroSlide[]>(siteConfig.heroSlides || []);
  const [supportEnabled, setSupportEnabled] = useState(siteConfig.supportEnabled ?? true);
  const [maintenanceMode, setMaintenanceMode] = useState(siteConfig.maintenanceMode ?? false);
  const [savingSiteConfig, setSavingSiteConfig] = useState(false);

  useEffect(() => {
    setEditTicker(siteConfig.tickerMessages || []);
    setEditSlides(siteConfig.heroSlides || []);
    setSupportEnabled(siteConfig.supportEnabled ?? true);
    setMaintenanceMode(siteConfig.maintenanceMode ?? false);
  }, [siteConfig]);

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
  };

  const loadAdminQuestions = async (
    targetPage = qPage,
    targetStatus = qStatusFilter,
    targetSearch = qSearchFilter
  ) => {
    try {
      const p = new URLSearchParams();
      p.set('page', String(targetPage));
      p.set('limit', '20');
      if (targetStatus !== 'all') p.set('status', targetStatus);
      if (targetSearch.trim()) p.set('search', targetSearch.trim());
      const qRes = await apiRequest<{
        questions: Question[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/questions?${p.toString()}`);
      setQuestionsList(qRes.questions || []);
      setQTotal(Number(qRes.total || 0));
      setQTotalPages(Math.max(1, Number(qRes.totalPages || 1)));
    } catch {
      // ignore
    }
  };

  const loadAllAdminData = async () => {
    if (!isAuthorizedAdmin) return;
    try {
      const [
        uList,
        secList,
        lesList,
        ordSubPlans,
        notifsList,
        logsList,
        ov,
        aRes,
        subAdminRes,
        dictRes,
        analyticsRes,
        secEventsRes,
        reportsRes,
        bacRes,
        elevenRes,
        contactRes,
        referralsRes,
      ] =
        await Promise.all([
          hasPerm('users', 'students', 'teachers', 'professors', 'notifications')
            ? fetchAllUsersForAdmin().catch(() => [] as AdminUserRecord[])
            : Promise.resolve([] as AdminUserRecord[]),
          hasPerm('lessons', 'content', 'dashboard')
            ? fetchFirestoreLessonSections(true).catch(() => [] as LessonSection[])
            : Promise.resolve([] as LessonSection[]),
          hasPerm('lessons', 'content', 'dashboard')
            ? fetchFirestoreLessons(true).catch(() => [] as Lesson[])
            : Promise.resolve([] as Lesson[]),
          hasPerm('subscriptions', 'payments', 'receipts', 'transactions', 'dashboard')
            ? fetchAllOrdersAndSubscriptionsAdmin().catch(() => ({
                orders: [] as PaymentTransaction[],
                subscriptions: [] as Array<UserSubscription & { userEmail?: string; userName?: string }>,
                plans: [] as SubscriptionPlan[],
              }))
            : Promise.resolve({
                orders: [] as PaymentTransaction[],
                subscriptions: [] as Array<UserSubscription & { userEmail?: string; userName?: string }>,
                plans: [] as SubscriptionPlan[],
              }),
          hasPerm('notifications')
            ? fetchAllNotificationsAdmin().catch(() => [] as NotificationItem[])
            : Promise.resolve([] as NotificationItem[]),
          hasPerm('audit_logs')
            ? fetchAuditLogsAdmin().catch(() => [] as AuditLog[])
            : Promise.resolve([] as AuditLog[]),
          hasPerm('dashboard')
            ? apiRequest('/api/admin/overview').catch(() => null)
            : Promise.resolve(null),
          hasPerm('exams', 'dashboard')
            ? apiRequest<{ attempts: any[] }>('/api/admin/attempts').catch(() => ({ attempts: [] }))
            : Promise.resolve({ attempts: [] }),
          hasPerm('subscriptions', 'payments', 'receipts', 'transactions')
            ? apiRequest<{
                plans: SubscriptionPlan[];
                requests: SubscriptionRequest[];
                paymentMethods: PaymentMethodConfig[];
                freeLimits?: PlanLimitsConfig;
              }>('/api/admin/subscriptions').catch(() => null)
            : Promise.resolve(null),
          hasPerm('settings', 'content')
            ? apiRequest<{ rules: PronunciationRuleItem[] }>('/api/admin/pronunciation-dictionary').catch(() => ({
                rules: [],
              }))
            : Promise.resolve({ rules: [] }),
          hasPerm('dashboard', 'audit_logs')
            ? apiRequest<AdminAnalyticsData>('/api/admin/analytics').catch(() => null)
            : Promise.resolve(null),
          hasPerm('audit_logs', 'receipts', 'payments')
            ? apiRequest<{ events: SecurityEventItem[] }>('/api/admin/security-events').catch(() => ({
                events: [],
              }))
            : Promise.resolve({ events: [] }),
          hasPerm('reports')
            ? apiRequest<{ reports: IssueReportItem[] }>('/api/admin/reports').catch(() => ({ reports: [] }))
            : Promise.resolve({ reports: [] }),
          hasPerm('baccalaureate', 'content')
            ? apiRequest<{ series: BacSeriesItem[]; coefficients: BacCoefficientItem[] }>(
                '/api/admin/baccalaureate/coefficients'
              ).catch(() => ({ series: [], coefficients: [] }))
            : Promise.resolve({ series: [], coefficients: [] }),
          hasPerm('settings')
            ? apiRequest<ElevenLabsStatus>('/api/admin/elevenlabs').catch(() => null)
            : Promise.resolve(null),
          hasPerm('reports', 'notifications')
            ? apiRequest<{ messages: ContactMessageItem[] }>('/api/admin/contact-messages').catch(() => ({
                messages: [],
              }))
            : Promise.resolve({ messages: [] }),
          hasPerm('subscriptions', 'settings')
            ? apiRequest<{
                settings: ReferralSettings;
                logs: ReferralLogItem[];
                rewards: ReferralRewardItem[];
              }>('/api/admin/referrals').catch(() => null)
            : Promise.resolve(null),
        ]);

      setAdminUsers(uList);
      setAdminSections(secList);
      setAdminLessons(lesList);
      setAdminOrders(ordSubPlans.orders);
      setAdminSubscriptions(ordSubPlans.subscriptions);
      setAdminPlans(ordSubPlans.plans);
      setAdminNotifications(notifsList);
      setAuditLogs(logsList);
      setOverviewApi(ov);
      setAttempts(aRes.attempts || []);
      if (subAdminRes) {
        setPaymentRequests(subAdminRes.requests || []);
        setAdminPaymentMethods(subAdminRes.paymentMethods || []);
        setSqlPlans(subAdminRes.plans || []);
        if (subAdminRes.freeLimits) setFreeLimits(subAdminRes.freeLimits);
      }
      setPronRules(dictRes.rules || []);
      if (analyticsRes) setAnalyticsData(analyticsRes);
      setSecurityEvents(secEventsRes.events || []);
      setAdminReports(reportsRes.reports || []);
      setBacSeries(bacRes.series || []);
      setBacCoeffs(bacRes.coefficients || []);
      if (elevenRes) setElevenConfig(elevenRes);
      setContactMessages(contactRes.messages || []);
      if (referralsRes) {
        if (referralsRes.settings) setReferralSettings(referralsRes.settings);
        setReferralLogs(referralsRes.logs || []);
        setReferralRewards(referralsRes.rewards || []);
      }
      if (hasPerm('questions', 'content')) {
        await loadAdminQuestions(qPage, qStatusFilter, qSearchFilter);
      }
    } catch (err: any) {
      flash(err?.message || 'Failed loading admin data', false);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      void loadAllAdminData();
    }
  }, [isAuthorizedAdmin]);

  useEffect(() => {
    if (isAuthorizedAdmin) {
      void loadAdminQuestions(qPage, qStatusFilter, qSearchFilter);
    }
  }, [isAuthorizedAdmin, qPage, qStatusFilter, qSearchFilter]);

  // Real-time conversations listener for Admin
  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    const unsub = subscribeAllConversationsForAdmin((list) => {
      setConversations(list);
      setSelectedConvId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || null;
      });
    });
    return () => unsub();
  }, [isAuthorizedAdmin]);

  const activeConv = conversations.find((c) => c.id === selectedConvId) || null;

  // Real-time messages listener for selected conversation
  useEffect(() => {
    if (!isAuthorizedAdmin || !activeConv) {
      setChatMessages([]);
      return;
    }
    const unsub = subscribeConversationMessages(activeConv.id, activeConv.uid, true, (msgs) => {
      setChatMessages(msgs);
    });
    if (activeConv.unreadForAdmin > 0) {
      void markConversationReadByRole(activeConv.id, 'admin');
    }
    return () => unsub();
  }, [isAuthorizedAdmin, activeConv?.id, activeConv?.unreadForAdmin]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return adminUsers;
    return adminUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [adminUsers, userSearch]);

  const filteredConversations = useMemo(() => {
    if (chatFilter === 'all') return conversations;
    return conversations.filter((c) => c.status === chatFilter);
  }, [conversations, chatFilter]);

  const userByUid = useMemo(() => {
    const map = new Map<string, AdminUserRecord>();
    for (const u of adminUsers) map.set(u.uid, u);
    return map;
  }, [adminUsers]);

  const paidOrdersTotalMru = useMemo(
    () =>
      adminOrders
        .filter((o) => o.status === 'succeeded')
        .reduce((acc, o) => acc + (o.amount_mru || 0), 0),
    [adminOrders]
  );

  if (!isAuthorizedAdmin || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white border border-[#d8dfe2] p-8 text-center space-y-2 rounded-[4px]">
          <Shield className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="text-lg font-extrabold text-[#384D55]">
            {lang === 'ar' ? 'وصول مقيّد بالإدارة الرسمية فقط' : 'Accès strictement réservé'}
          </h1>
          <p className="text-xs text-[#6b787e]">
            {lang === 'ar'
              ? 'هذه اللوحة مخصصة حصرياً لحساب المدير الرسمي المعتمد.'
              : 'Ce panneau est exclusivement réservé à l’administrateur officiel.'}
          </p>
        </div>
      </div>
    );
  }

  const handleSeedFirestore = async () => {
    setBusyAction(true);
    try {
      const [apiCat, apiPlans] = await Promise.all([
        apiRequest<any>('/api/catalog'),
        apiRequest<{ plans: SubscriptionPlan[] }>('/api/plans'),
      ]);
      const res = await seedFirestoreCatalogIfNeeded({
        subjects: apiCat.subjects || [],
        lessons: apiCat.lessons || [],
        plans: apiPlans.plans || [],
        siteConfig: apiCat.siteConfig || siteConfig,
        gradingPolicy: apiCat.gradingPolicy || { maxScore: 20, wrongPenalty: 0, passingScore: 10 },
      });
      await Promise.all([refreshCatalog(), refreshPlans(), loadAllAdminData()]);
      flash(
        res.seeded
          ? lang === 'ar'
            ? 'تمت مزامنة وتهيئة بيانات الكتالوج في Firestore بنجاح.'
            : 'Catalogue initialisé dans Firestore.'
          : lang === 'ar'
            ? 'البيانات متزامنة بالفعل في Firestore.'
            : 'Données déjà synchronisées dans Firestore.'
      );
    } catch (err: any) {
      flash(err?.message || 'Seed error', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleUserDisabled = async (target: AdminUserRecord) => {
    if (isOfficialAdminEmail(target.email)) {
      flash(
        lang === 'ar'
          ? 'لا يمكن إيقاف حساب المدير الرسمي للمنصة.'
          : 'Impossible de désactiver le compte administrateur officiel.',
        false
      );
      return;
    }
    setBusyAction(true);
    try {
      await setUserDisabledAdmin(target.uid, !target.disabled, user.uid, user.email);
      await loadAllAdminData();
      flash(
        !target.disabled
          ? lang === 'ar'
            ? 'تم إيقاف حساب المستخدم.'
            : 'Compte utilisateur désactivé.'
          : lang === 'ar'
            ? 'تم إعادة تفعيل حساب المستخدم.'
            : 'Compte utilisateur réactivé.'
      );
    } catch (err: any) {
      flash(err?.message || 'Error updating user status', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Lesson Sections CRUD
  const resetSectionForm = () => {
    setEditingSectionId(null);
    setSecTitleAr('');
    setSecTitleFr('');
    setSecDescAr('');
    setSecDescFr('');
    setSecSubject('arabic-language');
    setSecTrack('all');
    setSecLevel('foundation');
    setSecOrder(adminSections.length + 1);
    setSecActive(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secTitleAr.trim()) return;
    setBusyAction(true);
    try {
      if (editingSectionId) {
        await updateLessonSectionAdmin(editingSectionId, {
          titleAr: secTitleAr,
          titleFr: secTitleFr || secTitleAr,
          descriptionAr: secDescAr,
          descriptionFr: secDescFr || secDescAr,
          subjectSlug: secSubject,
          track: secTrack,
          level: secLevel,
          displayOrder: secOrder,
          active: secActive,
        });
        await writeAdminAuditLog({
          actorUid: user.uid,
          actorEmail: user.email,
          action: 'UPDATE_SECTION',
          targetType: 'lessonSection',
          targetId: editingSectionId,
          details: secTitleAr,
        });
      } else {
        const newId = await createLessonSectionAdmin({
          titleAr: secTitleAr,
          titleFr: secTitleFr || secTitleAr,
          descriptionAr: secDescAr,
          descriptionFr: secDescFr || secDescAr,
          subjectSlug: secSubject,
          track: secTrack,
          level: secLevel,
          displayOrder: secOrder,
          active: secActive,
        });
        await writeAdminAuditLog({
          actorUid: user.uid,
          actorEmail: user.email,
          action: 'CREATE_SECTION',
          targetType: 'lessonSection',
          targetId: newId,
          details: secTitleAr,
        });
      }
      resetSectionForm();
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم حفظ قسم الدروس بنجاح.' : 'Section enregistrée.');
    } catch (err: any) {
      flash(err?.message || 'Error saving section', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteSection = async (id: string) => {
    setBusyAction(true);
    try {
      await deleteLessonSectionAdmin(id);
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'DELETE_SECTION',
        targetType: 'lessonSection',
        targetId: id,
        details: 'deleted',
      });
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم حذف القسم.' : 'Section supprimée.');
    } catch (err: any) {
      flash(err?.message || 'Error', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Lessons CRUD
  const resetLessonForm = () => {
    setEditingLessonId(null);
    setLSubject('arabic-language');
    setLSectionId('');
    setLTrack('arabic');
    setLLevel('foundation');
    setLOrder(adminLessons.length + 1);
    setLTitleAr('');
    setLTitleFr('');
    setLSummaryAr('');
    setLSummaryFr('');
    setLExpAr('');
    setLExpFr('');
    setLActive(true);
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lTitleAr.trim() || !lExpAr.trim()) return;
    setBusyAction(true);
    try {
      const savedId = await createOrUpdateLessonAdmin({
        id: editingLessonId || undefined,
        subjectSlug: lSubject,
        sectionId: lSectionId || null,
        track: lTrack,
        level: lLevel,
        lessonOrder: lOrder,
        titleAr: lTitleAr,
        titleFr: lTitleFr || lTitleAr,
        summaryAr: lSummaryAr,
        summaryFr: lSummaryFr || lSummaryAr,
        explanationAr: lExpAr,
        explanationFr: lExpFr || lExpAr,
        active: lActive,
      });
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: editingLessonId ? 'UPDATE_LESSON' : 'CREATE_LESSON',
        targetType: 'lesson',
        targetId: savedId,
        details: lTitleAr,
      });
      resetLessonForm();
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم حفظ الدرس ونشره في المنصة.' : 'Leçon enregistrée.');
    } catch (err: any) {
      flash(err?.message || 'Error saving lesson', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleLessonActive = async (lesson: Lesson) => {
    if (!lesson.firestoreId) return;
    setBusyAction(true);
    try {
      await createOrUpdateLessonAdmin({
        id: lesson.firestoreId,
        numericId: lesson.id,
        subjectSlug: lesson.subject_slug,
        sectionId: lesson.sectionId || null,
        track: lesson.track,
        level: lesson.level,
        lessonOrder: lesson.lesson_order || 1,
        titleAr: lesson.title_ar,
        titleFr: lesson.title_fr,
        summaryAr: lesson.summary_ar,
        summaryFr: lesson.summary_fr,
        explanationAr: lesson.explanation_ar || '-',
        explanationFr: lesson.explanation_fr || '-',
        active: !(lesson.active !== false),
      });
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم تحديث حالة نشر الدرس.' : 'Statut de la leçon mis à jour.');
    } catch (err: any) {
      flash(err?.message || 'Error updating lesson', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteLesson = async (lesson: Lesson) => {
    if (!lesson.firestoreId) return;
    setBusyAction(true);
    try {
      await deleteLessonAdmin(lesson.firestoreId);
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'DELETE_LESSON',
        targetType: 'lesson',
        targetId: lesson.firestoreId,
        details: lesson.title_ar,
      });
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم حذف الدرس.' : 'Leçon supprimée.');
    } catch (err: any) {
      flash(err?.message || 'Error deleting lesson', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Plan Editing (Syncs Firestore + SQLite)
  const handleSavePlanEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setBusyAction(true);
    try {
      const matchedSql = sqlPlans.find((p) => p.slug === editingPlan.slug);
      const targetNumericId = matchedSql?.id || editingPlan.id;
      const savedId = await savePlanAdmin({
        id: editingPlan.firestoreId || editingPlan.slug,
        numericId: targetNumericId,
        slug: editingPlan.slug,
        nameAr: editingPlan.name_ar,
        nameFr: editingPlan.name_fr,
        descriptionAr: editingPlan.description_ar,
        descriptionFr: editingPlan.description_fr,
        priceMru: editingPlan.price_mru,
        priceEur: editingPlan.price_eur,
        durationDays: editingPlan.duration_days,
        billingCycle: editingPlan.billing_cycle,
        featuresAr: editingPlan.features_ar,
        featuresFr: editingPlan.features_fr,
        isPopular: Boolean(editingPlan.is_popular),
        active: Boolean(editingPlan.active),
        displayOrder: editingPlan.display_order,
      });
      if (targetNumericId) {
        await apiRequest(`/api/admin/plans/${targetNumericId}`, {
          method: 'PUT',
          json: {
            name_ar: editingPlan.name_ar,
            name_fr: editingPlan.name_fr,
            price_mru: editingPlan.price_mru,
            duration_days: editingPlan.duration_days,
            active: Boolean(editingPlan.active),
          },
        }).catch(() => {});
      }
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'UPDATE_PLAN',
        targetType: 'plan',
        targetId: savedId,
        details: `${editingPlan.name_ar} (${editingPlan.price_mru} MRU)`,
      });
      setEditingPlan(null);
      await Promise.all([refreshPlans(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم تحديث الباقة بنجاح.' : 'Offre mise à jour.');
    } catch (err: any) {
      flash(err?.message || 'Error saving plan', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Mauritanian & Card Subscription Requests Approval / Clarification / Rejection
  const handleApprovePaymentRequest = async (reqItem: SubscriptionRequest, forceApprove = false) => {
    const paidAmt = Number(reqItem.paid_amount ?? reqItem.extracted_amount ?? reqItem.amount ?? 0);
    if (paidAmt + 0.01 < Number(reqItem.amount || 0) && !forceApprove) {
      setForceApproveTargetId(reqItem.id);
      return;
    }
    setBusyAction(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        approvedAt: string;
        startsAt: string;
        expiresAt: string;
        paymentId: string;
      }>(`/api/admin/payment-requests/${reqItem.id}/approve`, {
        method: 'POST',
        json: forceApprove ? { forceApprove: true } : {},
      });

      const matchedFsUser = adminUsers.find(
        (u) => u.email.toLowerCase() === (reqItem.user_email || '').toLowerCase()
      );
      const matchedPlan = (sqlPlans.length > 0 ? sqlPlans : adminPlans).find(
        (p) => p.slug === reqItem.plan_slug
      );

      await approveSubscriptionRequestInFirestore({
        subscriptionRequestId: reqItem.subscription_request_id,
        userUid: matchedFsUser?.uid,
        planSlug: reqItem.plan_slug,
        planNameAr: reqItem.plan_name,
        planNameFr: matchedPlan?.name_fr || reqItem.plan_name,
        billingCycle: (matchedPlan?.billing_cycle as any) || 'monthly',
        amount: reqItem.amount,
        currency: reqItem.currency || 'MRU',
        paymentMethod: reqItem.payment_method,
        transactionReference: reqItem.transaction_reference,
        transactionId: reqItem.transaction_id,
        approvedBy: user.email,
        approvedAtIso: res.approvedAt,
        expiresAtIso: res.expiresAt,
        paymentId: res.paymentId,
      });

      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'APPROVE_PAYMENT_REQUEST',
        targetType: 'subscriptionRequest',
        targetId: reqItem.subscription_request_id,
        details: `${reqItem.user_email} · ${reqItem.amount} MRU · exp ${res.expiresAt.slice(0, 10)}`,
      });

      setForceApproveTargetId(null);
      setPreviewProofReq(null);
      await Promise.all([refreshPlans(), loadAllAdminData()]);
      flash(
        lang === 'ar'
          ? `تم اعتماد الطلب ${reqItem.subscription_request_id} وتفعيل الاشتراك حتى ${res.expiresAt.slice(0, 10)}.`
          : `Demande ${reqItem.subscription_request_id} approuvée jusqu'au ${res.expiresAt.slice(0, 10)}.`
      );
    } catch (err: any) {
      flash(err?.message || 'Error approving request', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRequestInfoPaymentRequest = async (reqItem: SubscriptionRequest) => {
    const cleanNote = clarifyNoteInput.trim();
    if (cleanNote.length < 3) {
      flash(
        lang === 'ar' ? 'يرجى كتابة التوضيح المطلوب من الطالب.' : 'Veuillez saisir la précision demandée.',
        false
      );
      return;
    }
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/payment-requests/${reqItem.id}/request-info`, {
        method: 'POST',
        json: { clarificationNote: cleanNote },
      });
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'REQUEST_INFO_PAYMENT_REQUEST',
        targetType: 'subscriptionRequest',
        targetId: reqItem.subscription_request_id,
        details: cleanNote,
      });
      setClarifyTargetId(null);
      setClarifyNoteInput('');
      setPreviewProofReq(null);
      await loadAllAdminData();
      flash(
        lang === 'ar'
          ? `تم إرسال طلب توضيح للطالب (${reqItem.subscription_request_id}).`
          : `Demande de précision envoyée (${reqItem.subscription_request_id}).`
      );
    } catch (err: any) {
      flash(err?.message || 'Error requesting clarification', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRejectPaymentRequest = async (reqItem: SubscriptionRequest) => {
    const cleanReason = rejectReasonInput.trim();
    if (cleanReason.length < 3) {
      flash(
        lang === 'ar' ? 'يرجى كتابة سبب الرفض (3 أحرف على الأقل).' : 'Veuillez saisir le motif du refus.',
        false
      );
      return;
    }
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/payment-requests/${reqItem.id}/reject`, {
        method: 'POST',
        json: { rejectionReason: cleanReason },
      });
      await rejectSubscriptionRequestInFirestore({
        subscriptionRequestId: reqItem.subscription_request_id,
        rejectionReason: cleanReason,
        approvedBy: user.email,
      });
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'REJECT_PAYMENT_REQUEST',
        targetType: 'subscriptionRequest',
        targetId: reqItem.subscription_request_id,
        details: cleanReason,
      });
      setRejectTargetId(null);
      setRejectReasonInput('');
      setPreviewProofReq(null);
      await loadAllAdminData();
      flash(
        lang === 'ar'
          ? `تم رفض الطلب ${reqItem.subscription_request_id} وإبلاغ الطالب.`
          : `Demande ${reqItem.subscription_request_id} refusée.`
      );
    } catch (err: any) {
      flash(err?.message || 'Error rejecting request', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Issue Reports Admin Update Handler
  const handleSaveReportUpdate = async (reportId: number) => {
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        json: {
          status: reportStatusInput,
          adminReply: reportReplyInput.trim(),
          adminAction: reportActionInput.trim(),
        },
      });
      setReportEditId(null);
      setReportReplyInput('');
      setReportActionInput('');
      await loadAllAdminData();
      flash(lang === 'ar' ? `تم تحديث حالة البلاغ #${reportId} بنجاح.` : `Signalement #${reportId} mis à jour.`);
    } catch (err: any) {
      flash(err?.message || 'Error updating report', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Baccalaureate Coefficients Handlers
  const resetBacCoeffForm = () => {
    setEditingBacCoeffId(null);
    setBacSubjectSlug('');
    setBacSubjectAr('');
    setBacSubjectFr('');
    setBacCoeffValue(2);
    setBacMaxGrade(20);
    setBacOptional(false);
  };

  const handleSaveBacCoeff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bacSubjectAr.trim() || (!editingBacCoeffId && !bacSubjectSlug.trim())) return;
    setBusyAction(true);
    try {
      if (editingBacCoeffId) {
        await apiRequest(`/api/admin/baccalaureate/coefficients/${editingBacCoeffId}`, {
          method: 'PUT',
          json: {
            subject_name_ar: bacSubjectAr.trim(),
            subject_name_fr: bacSubjectFr.trim() || bacSubjectAr.trim(),
            coefficient: Number(bacCoeffValue || 1),
            max_grade: Number(bacMaxGrade || 20),
            is_optional: bacOptional,
          },
        });
      } else {
        await apiRequest('/api/admin/baccalaureate/coefficients', {
          method: 'POST',
          json: {
            series_slug: bacSeriesSlug,
            subject_slug: bacSubjectSlug.trim(),
            subject_name_ar: bacSubjectAr.trim(),
            subject_name_fr: bacSubjectFr.trim() || bacSubjectAr.trim(),
            coefficient: Number(bacCoeffValue || 1),
            max_grade: Number(bacMaxGrade || 20),
            is_optional: bacOptional,
          },
        });
      }
      resetBacCoeffForm();
      await loadAllAdminData();
      flash(lang === 'ar' ? 'تم حفظ معامل مادة البكالوريا بنجاح.' : 'Coefficient enregistré.');
    } catch (err: any) {
      flash(err?.message || 'Error saving coefficient', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteBacCoeff = async (id: number) => {
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/baccalaureate/coefficients/${id}`, { method: 'DELETE' });
      await loadAllAdminData();
      flash(lang === 'ar' ? 'تم حذف المعامل.' : 'Coefficient supprimé.');
    } catch (err: any) {
      flash(err?.message || 'Error deleting coefficient', false);
    } finally {
      setBusyAction(false);
    }
  };

  // ElevenLabs HD Voice Configuration Handler
  const handleSaveElevenLabsConfig = async (e: React.FormEvent, clearApiKey = false) => {
    e.preventDefault();
    setSavingElevenLabs(true);
    try {
      const updated = await apiRequest<ElevenLabsStatus>('/api/admin/elevenlabs', {
        method: 'PUT',
        json: {
          enabled: elevenConfig.enabled,
          freeTierAllowed: elevenConfig.freeTierAllowed,
          voiceIdAr: elevenConfig.voiceIdAr.trim(),
          voiceIdFr: elevenConfig.voiceIdFr.trim(),
          modelId: (elevenConfig.modelId || 'eleven_multilingual_v2').trim(),
          ...(clearApiKey
            ? { clearApiKey: true }
            : elevenApiKeyInput.trim()
              ? { apiKey: elevenApiKeyInput.trim() }
              : {}),
        },
      });
      setElevenConfig((prev) => ({
        ...prev,
        ...updated,
        source: clearApiKey ? 'none' : elevenApiKeyInput.trim() ? 'db' : prev.source,
      }));
      setElevenApiKeyInput('');
      await speechEngine.refreshElevenLabsStatus();
      flash(
        clearApiKey
          ? lang === 'ar'
            ? 'تم مسح مفتاح ElevenLabs المحفوظ.'
            : 'Clé API supprimée.'
          : lang === 'ar'
            ? 'تم حفظ إعدادات الصوت فائق الجودة ElevenLabs.'
            : 'Configuration ElevenLabs enregistrée.'
      );
    } catch (err: any) {
      flash(err?.message || 'Error updating ElevenLabs config', false);
    } finally {
      setSavingElevenLabs(false);
    }
  };

  const handleSavePaymentMethod = async (pm: PaymentMethodConfig) => {
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/payment-methods/${pm.code}`, {
        method: 'PUT',
        json: {
          beneficiary_name: pm.beneficiary_name,
          account_number: pm.account_number,
          instructions_ar: pm.instructions_ar,
          instructions_fr: pm.instructions_fr,
          active: Boolean(pm.active),
        },
      });
      await Promise.all([refreshPlans(), loadAllAdminData()]);
      flash(
        lang === 'ar'
          ? `تم حفظ إعدادات وسيلة الدفع: ${pm.name_ar}`
          : `Moyen de paiement mis à jour : ${pm.name_fr}`
      );
    } catch (err: any) {
      flash(err?.message || 'Error saving payment method', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMethodCode.trim() || !newMethodNameAr.trim()) return;
    setBusyAction(true);
    try {
      await apiRequest('/api/admin/payment-methods', {
        method: 'POST',
        json: {
          code: newMethodCode.trim().toLowerCase(),
          name_ar: newMethodNameAr.trim(),
          name_fr: newMethodNameFr.trim() || newMethodNameAr.trim(),
          beneficiary_name: newMethodBeneficiary.trim(),
          account_number: newMethodAccount.trim(),
          instructions_ar: newMethodInstrAr.trim(),
          instructions_fr: newMethodInstrFr.trim() || newMethodInstrAr.trim(),
          requires_receipt: true,
          active: true,
        },
      });
      setNewMethodCode('');
      setNewMethodNameAr('');
      setNewMethodNameFr('');
      setNewMethodBeneficiary('');
      setNewMethodAccount('');
      setNewMethodInstrAr('');
      setNewMethodInstrFr('');
      await Promise.all([refreshPlans(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تمت إضافة وسيلة الدفع الجديدة.' : 'Nouveau moyen de paiement ajouté.');
    } catch (err: any) {
      flash(err?.message || 'Error creating payment method', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveFreeLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      await apiRequest('/api/admin/plan-limits', {
        method: 'PUT',
        json: {
          daily_questions_limit: Number(freeLimits.daily_questions_limit || 25),
          daily_lessons_limit: Number(freeLimits.daily_lessons_limit || 3),
          daily_exams_limit: Number(freeLimits.daily_exams_limit || 2),
          allow_official_sim: Boolean(freeLimits.allow_official_sim),
          allow_review_center: Boolean(freeLimits.allow_review_center),
        },
      });
      await Promise.all([refreshPlans(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم حفظ حدود الباقة المجانية.' : 'Quotas gratuits mis à jour.');
    } catch (err: any) {
      flash(err?.message || 'Error updating limits', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Targeted Notifications (Firestore + SQLite + Real-time SSE Broadcast)
  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitleAr.trim() || !notifBodyAr.trim()) return;
    if (notifScope === 'specific_users' && notifTargetUids.length === 0) {
      flash(
        lang === 'ar'
          ? 'اختر مستخدماً واحداً على الأقل عند تحديد مستخدمين محددين.'
          : 'Sélectionnez au moins un utilisateur cible.',
        false
      );
      return;
    }
    setBusyAction(true);
    try {
      const id = await sendTargetedNotificationAdmin({
        createdByUid: user.uid,
        titleAr: notifTitleAr,
        titleFr: notifTitleFr || notifTitleAr,
        bodyAr: notifBodyAr,
        bodyFr: notifBodyFr || notifBodyAr,
        type: notifType,
        targetScope: notifScope,
        targetTrack: notifTrack,
        targetLevel: notifLevel,
        targetSubscription: notifSubFilter,
        targetUserIds: notifTargetUids,
      });
      await apiRequest('/api/admin/notifications/broadcast', {
        method: 'POST',
        json: {
          title_ar: notifTitleAr,
          title_fr: notifTitleFr || notifTitleAr,
          body_ar: notifBodyAr,
          body_fr: notifBodyFr || notifBodyAr,
          type: notifType,
          target_scope: notifScope === 'all_including_future' ? 'all_including_future' : 'current_users',
        },
      }).catch(() => {});
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'SEND_NOTIFICATION',
        targetType: 'notification',
        targetId: id,
        details: `scope=${notifScope} title=${notifTitleAr}`,
      });
      setNotifTitleAr('');
      setNotifTitleFr('');
      setNotifBodyAr('');
      setNotifBodyFr('');
      setNotifTargetUids([]);
      await loadAllAdminData();
      flash(
        lang === 'ar'
          ? 'تم إرسال الإشعار الموجه وبثه لحظياً بنجاح.'
          : 'Notification envoyée et diffusée en temps réel.'
      );
    } catch (err: any) {
      flash(err?.message || 'Error sending notification', false);
    } finally {
      setBusyAction(false);
    }
  };

  // Support Chat Reply
  const handleSendAdminChatReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !adminChatReply.trim()) return;
    const text = adminChatReply.trim();
    setAdminChatReply('');
    try {
      await sendSupportChatMessage({
        conversation: activeConv,
        senderUid: user.uid,
        senderName: user.name,
        senderRole: 'admin',
        text,
      });
    } catch (err: any) {
      flash(err?.message || 'Error sending reply', false);
    }
  };

  // Question Bank (SQLite backend authenticated with Firebase Bearer token)
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/questions', {
        method: 'POST',
        json: {
          subject_slug: qSubject,
          track: qTrack,
          level: qLevel,
          stem_ar: qStemAr,
          stem_fr: qStemFr,
          options_ar: qOptAr,
          options_fr: qOptFr,
          correct_index: qCorrect,
          explanation_ar: qExpAr,
          explanation_fr: qExpFr,
        },
      });
      setQStemAr('');
      setQStemFr('');
      setQOptAr(['', '', '', '']);
      setQOptFr(['', '', '', '']);
      setQExpAr('');
      setQExpFr('');
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تمت إضافة السؤال الفريد بنجاح.' : 'Question ajoutée.');
    } catch (err: any) {
      flash(err?.message || 'Duplicate or invalid question', false);
    }
  };

  const handleImportQuestions = async () => {
    try {
      const parsed = JSON.parse(importJson);
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      const res = await apiRequest<{ inserted: number; duplicates: number }>(
        '/api/admin/questions/import',
        { method: 'POST', json: { questions: list } }
      );
      setImportJson('');
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(
        lang === 'ar'
          ? `تم استيراد ${res.inserted} سؤالاً وتجاهل ${res.duplicates} مكرراً.`
          : `${res.inserted} importées, ${res.duplicates} doublons ignorés.`
      );
    } catch (err: any) {
      flash(err?.message || 'Invalid JSON', false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    try {
      await apiRequest(`/api/admin/questions/${id}`, { method: 'DELETE' });
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(lang === 'ar' ? 'تم حذف السؤال.' : 'Question supprimée.');
    } catch (err: any) {
      flash(err?.message || 'Error', false);
    }
  };

  const handleSaveEditedQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/questions/${editingQuestion.id}`, {
        method: 'PUT',
        json: {
          subject_slug: editingQuestion.subject_slug,
          track: editingQuestion.track,
          level: editingQuestion.level,
          axis_ar: editingQuestion.axis_ar || editingQuestion.topic_ar,
          axis_fr: editingQuestion.axis_fr || editingQuestion.topic_fr,
          topic_ar: editingQuestion.topic_ar,
          topic_fr: editingQuestion.topic_fr,
          difficulty: editingQuestion.difficulty,
          question_type: editingQuestion.question_type || 'mcq',
          stem_ar: editingQuestion.stem_ar,
          stem_fr: editingQuestion.stem_fr,
          options_ar: editingQuestion.options_ar,
          options_fr: editingQuestion.options_fr,
          correct_index: editingQuestion.correct_index ?? 0,
          answer_ar: editingQuestion.answer_ar,
          answer_fr: editingQuestion.answer_fr,
          explanation_ar: editingQuestion.explanation_ar,
          explanation_fr: editingQuestion.explanation_fr,
          content_status: editingQuestion.content_status || 'published',
        },
      });
      setEditingQuestion(null);
      await Promise.all([refreshCatalog(), loadAdminQuestions(qPage, qStatusFilter, qSearchFilter)]);
      flash(lang === 'ar' ? 'تم تحديث السؤال بنجاح.' : 'Question mise à jour.');
    } catch (err: any) {
      flash(err?.message || 'Error updating question', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickQuestionStatus = async (
    id: number,
    content_status: 'draft' | 'review' | 'approved' | 'published' | 'archived'
  ) => {
    try {
      await apiRequest(`/api/admin/questions/${id}/status`, {
        method: 'PATCH',
        json: { content_status },
      });
      await loadAdminQuestions(qPage, qStatusFilter, qSearchFilter);
      flash(lang === 'ar' ? `تم تحديث حالة السؤال إلى ${content_status}.` : `Statut : ${content_status}`);
    } catch (err: any) {
      flash(err?.message || 'Error updating status', false);
    }
  };

  // Pronunciation Dictionary Handlers
  const handleCreatePronRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pPattern.trim() || !pReplacement.trim()) return;
    setBusyAction(true);
    try {
      await apiRequest('/api/admin/pronunciation-dictionary', {
        method: 'POST',
        json: {
          pattern: pPattern.trim(),
          replacement: pReplacement.trim(),
          lang: pLang,
          match_type: pMatchType,
          active: true,
          notes: pNotes.trim(),
        },
      });
      setPPattern('');
      setPReplacement('');
      setPNotes('');
      await loadAllAdminData();
      flash(lang === 'ar' ? 'تمت إضافة قاعدة النطق للقاموس.' : 'Règle de prononciation ajoutée.');
    } catch (err: any) {
      flash(err?.message || 'Error adding pronunciation rule', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleTogglePronRuleActive = async (rule: PronunciationRuleItem) => {
    try {
      await apiRequest(`/api/admin/pronunciation-dictionary/${rule.id}`, {
        method: 'PUT',
        json: {
          pattern: rule.pattern,
          replacement: rule.replacement,
          lang: rule.lang,
          match_type: rule.match_type,
          active: !rule.active,
          notes: rule.notes,
        },
      });
      await loadAllAdminData();
    } catch (err: any) {
      flash(err?.message || 'Error toggling rule', false);
    }
  };

  const handleDeletePronRule = async (id: number) => {
    try {
      await apiRequest(`/api/admin/pronunciation-dictionary/${id}`, { method: 'DELETE' });
      await loadAllAdminData();
      flash(lang === 'ar' ? 'تم حذف قاعدة النطق.' : 'Règle supprimée.');
    } catch (err: any) {
      flash(err?.message || 'Error deleting rule', false);
    }
  };

  // Grading Policy + Site Config (Firestore + SQLite)
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await Promise.all([
        saveSiteConfigAdmin({
          tickerMessages: editTicker,
          heroSlides: editSlides,
          gradingPolicy: { maxScore, wrongPenalty, passingScore },
          supportEnabled,
          maintenanceMode,
        }),
        apiRequest('/api/admin/grading-policy', {
          method: 'PUT',
          json: { maxScore, wrongPenalty, passingScore },
        }),
      ]);
      await refreshCatalog();
      flash(lang === 'ar' ? 'تم حفظ سياسة التصحيح.' : 'Politique de notation enregistrée.');
    } catch (err: any) {
      flash(err?.message || 'Error', false);
    }
  };

  const handleSaveSiteConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSiteConfig(true);
    try {
      await Promise.all([
        saveSiteConfigAdmin({
          tickerMessages: editTicker,
          heroSlides: editSlides,
          gradingPolicy: { maxScore, wrongPenalty, passingScore },
          supportEnabled,
          maintenanceMode,
        }),
        apiRequest('/api/admin/site-config', {
          method: 'PUT',
          json: { tickerMessages: editTicker, heroSlides: editSlides },
        }),
      ]);
      await writeAdminAuditLog({
        actorUid: user.uid,
        actorEmail: user.email,
        action: 'UPDATE_SITE_CONFIG',
        targetType: 'siteConfig',
        targetId: 'main',
        details: `slides=${editSlides.length}, ticker=${editTicker.length}`,
      });
      await Promise.all([refreshCatalog(), loadAllAdminData()]);
      flash(
        lang === 'ar'
          ? 'تم حفظ إعدادات الواجهة والشريط الإخباري في Firestore بنجاح.'
          : 'Configuration du site enregistrée dans Firestore.'
      );
    } catch (err: any) {
      flash(err?.message || 'Error saving site config', false);
    } finally {
      setSavingSiteConfig(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const snap = await apiRequest('/api/admin/backup');
      const fullBackup = {
        exportedAt: new Date().toISOString(),
        firestore: {
          usersCount: adminUsers.length,
          lessonSections: adminSections,
          lessons: adminLessons,
          plans: adminPlans,
          subscriptions: adminSubscriptions,
          orders: adminOrders,
          notifications: adminNotifications,
        },
        questionBankBackup: snap,
      };
      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tedribi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash(lang === 'ar' ? 'تم تنزيل النسخة الاحتياطية الكاملة.' : 'Sauvegarde téléchargée.');
    } catch (err: any) {
      flash(err?.message || 'Backup error', false);
    }
  };

  const handleSaveContactUpdate = async (id: number) => {
    setBusyAction(true);
    try {
      await apiRequest(`/api/admin/contact-messages/${id}`, {
        method: 'PATCH',
        json: {
          status: contactStatusInput,
          admin_note: contactNoteInput,
        },
      });
      setContactEditId(null);
      await loadAllAdminData();
      flash(
        tr(
          lang,
          'تم تحديث حالة رسالة التواصل وحفظ الملاحظة الإدارية.',
          'Statut du message mis à jour.',
          'Contact message updated.'
        )
      );
    } catch (err: any) {
      flash(err?.message || 'Error updating contact message', false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveReferralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingReferralSettings(true);
    try {
      const res = await apiRequest<{ ok: boolean; settings: ReferralSettings }>(
        '/api/admin/referral-settings',
        {
          method: 'PUT',
          json: {
            enabled: Boolean(referralSettings.enabled),
            points_per_referral: Number(referralSettings.points_per_referral || 20),
            reward_threshold_points: Number(referralSettings.reward_threshold_points || 1000),
            reward_duration_days: Number(referralSettings.reward_duration_days || 30),
            welcome_bonus_points: Number(referralSettings.welcome_bonus_points || 0),
            max_rewards_per_user: Number(referralSettings.max_rewards_per_user || 12),
          },
        }
      );
      if (res.settings) setReferralSettings(res.settings);
      flash(
        tr(
          lang,
          'تم حفظ إعدادات برنامج الإحالات والنقاط بنجاح.',
          'Paramètres de parrainage enregistrés.',
          'Referral settings saved.'
        )
      );
    } catch (err: any) {
      flash(err?.message || 'Error saving referral settings', false);
    } finally {
      setSavingReferralSettings(false);
    }
  };

  const pendingRequestsCount = paymentRequests.filter((r) =>
    ['pending_review', 'manual_review', 'partial_pending', 'needs_info'].includes(r.status)
  ).length;
  const openReportsCount = adminReports.filter(
    (r) => r.status === 'open' || r.status === 'in_review'
  ).length;
  const unreadContactCount = contactMessages.filter((m) => m.status === 'unread').length;
  const highRiskCount = securityEvents.filter(
    (e) => e.risk_level === 'suspicious' || e.risk_level === 'fraud_rejected'
  ).length;

  const allTabs: Array<{ id: AdminTab; label: string; badge?: number; perms: AdminPermission[] }> = [
    { id: 'overview', label: tr(lang, 'نظرة عامة', 'Vue générale', 'Overview'), perms: ['dashboard'] },
    { id: 'analytics', label: tr(lang, 'الإحصائيات والفيديو', 'Analytiques & Vidéo', 'Analytics & Video'), perms: ['dashboard', 'audit_logs'] },
    {
      id: 'security',
      label: tr(lang, 'سجل المخالفات والأمان', 'Sécurité & Fraude', 'Security & Risk Log'),
      badge: highRiskCount > 0 ? highRiskCount : undefined,
      perms: ['audit_logs', 'receipts', 'payments'],
    },
    { id: 'users', label: tr(lang, 'المستخدمون', 'Utilisateurs', 'Users'), perms: ['users'] },
    { id: 'students', label: tr(lang, 'الطلاب', 'Étudiants', 'Students'), perms: ['students', 'users'] },
    { id: 'teachers', label: tr(lang, 'المعلمون', 'Enseignants', 'Teachers'), perms: ['teachers', 'users'] },
    { id: 'professors', label: tr(lang, 'الأساتذة', 'Professeurs', 'Professors'), perms: ['professors', 'users'] },
    {
      id: 'schools',
      label: tr(lang, 'المدارس والشعب', 'Écoles & Dépts', 'Schools'),
      badge: overviewApi?.pendingSchoolsCount > 0 ? overviewApi.pendingSchoolsCount : undefined,
      perms: ['schools', 'departments'],
    },
    {
      id: 'verification',
      label: tr(lang, 'شارات التوثيق', 'Vérifications', 'Verification Badges'),
      badge: overviewApi?.pendingVerificationBadges > 0 ? overviewApi.pendingVerificationBadges : undefined,
      perms: ['verification'],
    },
    { id: 'lessons', label: tr(lang, 'الأقسام والدروس', 'Sections & Leçons', 'Sections & Lessons'), perms: ['lessons', 'content'] },
    { id: 'questions', label: tr(lang, 'بنك الأسئلة', 'Questions', 'Question Bank'), perms: ['questions', 'content'] },
    { id: 'exams', label: tr(lang, 'الامتحانات والنتائج', 'Examens & Résultats', 'Exams'), perms: ['exams'] },
    { id: 'baccalaureate', label: tr(lang, 'معاملات البكالوريا', 'Coefficients Bac', 'Bac Coefficients'), perms: ['baccalaureate'] },
    {
      id: 'subscriptions',
      label: tr(lang, 'الباقات والإيصالات', 'Offres & Reçus', 'Plans & Receipts'),
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
      perms: ['subscriptions', 'receipts'],
    },
    { id: 'payments', label: tr(lang, 'مدفوعات NardoPay', 'NardoPay', 'NardoPay Orders'), perms: ['payments', 'transactions'] },
    {
      id: 'reports',
      label: tr(lang, 'البلاغات والدعم الفني', 'Signalements', 'Bug Reports'),
      badge: openReportsCount > 0 ? openReportsCount : undefined,
      perms: ['reports'],
    },
    {
      id: 'contact',
      label: tr(lang, 'رسائل تواصل بنا', 'Messages Contact', 'Contact Messages'),
      badge: unreadContactCount > 0 ? unreadContactCount : undefined,
      perms: ['reports', 'notifications'],
    },
    { id: 'referrals', label: tr(lang, 'الإحالات والنقاط', 'Parrainages & Points', 'Referrals & Points'), perms: ['subscriptions', 'settings'] },
    { id: 'notifications', label: tr(lang, 'الإشعارات الموجهة', 'Notifications', 'Notifications'), perms: ['notifications'] },
    {
      id: 'chat',
      label: tr(lang, 'دردشة الدعم', 'Chat Support', 'Support Chat'),
      badge: unreadSupportCount > 0 ? unreadSupportCount : undefined,
      perms: ['reports', 'notifications'],
    },
    { id: 'files', label: tr(lang, 'إدارة الملفات', 'Fichiers', 'Files'), perms: ['files'] },
    { id: 'administrators', label: tr(lang, 'المشرفون والصلاحيات', 'Admins & RBAC', 'Admins & RBAC'), perms: ['administrators', 'permissions'] },
    { id: 'site', label: tr(lang, 'إعدادات الموقع والنطق', 'Config, Notation & Voix', 'Site, Grading & Voice'), perms: ['settings', 'content'] },
    { id: 'audit', label: tr(lang, 'سجل التدقيق', 'Audit Logs', 'Audit Logs'), perms: ['audit_logs'] },
    { id: 'backup', label: tr(lang, 'النسخ الاحتياطي', 'Sauvegarde', 'Backup'), perms: ['settings', 'administrators'] },
  ];

  const tabs = allTabs.filter((tb) => hasPerm(...tb.perms));
  const activeTab: AdminTab = tabs.some((tb) => tb.id === tab) ? tab : (tabs[0]?.id || 'overview');

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box !mb-0">
        <div className="rotator-box-header !mb-0 !border-b-0 !pb-0 flex-wrap gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold flex items-center gap-2 text-[#384D55]">
              <Shield className="w-5 h-5 text-[#678813]" />
              <span>{t.navAdmin}</span>
            </h1>
            <p className="text-xs font-normal text-[#5d6e75] mt-0.5">
              {isSuperAdmin
                ? lang === 'ar'
                  ? `المدير الرسمي المعتمد: ${user.name}`
                  : `Administrateur officiel : ${user.name}`
                : lang === 'ar'
                  ? `مشرف مفوض (${tabs.length} أقسام مصرح بها): ${user.name}`
                  : `Modérateur délégué (${tabs.length} sections) : ${user.name}`}{' '}
              · <span dir="ltr">{user.email}</span>
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handleSeedFirestore()}
                className="imgsend2-secondary !py-1.5 !px-3 !text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction ? 'animate-spin' : ''}`} />
                <span>{lang === 'ar' ? 'مزامنة الكتالوج مع Firestore' : 'Synchroniser Firestore'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="addressp-box !mb-0 !p-2.5 flex flex-wrap justify-start items-center gap-1.5 text-xs font-bold">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === tb.id
                ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                : 'bg-[#efefef] text-[#384D55] border-[#d8dfe2] hover:bg-[#e2efbf]'
            }`}
          >
            <span>{tb.label}</span>
            {tb.badge !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#A6CE39] text-[#384D55] text-[10px] leading-none">
                {tb.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`p-3 border rounded-[3px] text-xs font-bold ${
            msg.ok ? 'addtocartnotf' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 text-xs">
            {[
              { label: lang === 'ar' ? 'المستخدمون' : 'Utilisateurs', val: overviewApi?.usersCount ?? adminUsers.length },
              { label: lang === 'ar' ? 'الطلاب' : 'Étudiants', val: overviewApi?.studentsCount ?? 0 },
              { label: lang === 'ar' ? 'المعلمون' : 'Enseignants', val: overviewApi?.teachersCount ?? 0 },
              { label: lang === 'ar' ? 'الأساتذة' : 'Professeurs', val: overviewApi?.professorsCount ?? 0 },
              { label: lang === 'ar' ? 'المدارس النشطة' : 'Écoles actives', val: overviewApi?.schoolsCount ?? 0 },
              { label: lang === 'ar' ? 'أقسام الدروس' : 'Sections', val: adminSections.length },
              { label: lang === 'ar' ? 'الدروس' : 'Leçons', val: overviewApi?.lessonsCount ?? adminLessons.length },
              {
                label: lang === 'ar' ? 'اشتراكات نشطة' : 'Abonnements actifs',
                val: adminSubscriptions.filter((s) => s.status === 'active').length,
              },
              {
                label: lang === 'ar' ? 'إيرادات MRU' : 'Revenus MRU',
                val: paidOrdersTotalMru.toLocaleString(),
              },
              {
                label: lang === 'ar' ? 'محادثات مفتوحة' : 'Chats ouverts',
                val: conversations.filter((c) => c.status !== 'closed').length,
              },
              {
                label: lang === 'ar' ? 'بنك الأسئلة' : 'Questions',
                val: overviewApi?.questionsCount ?? catalog.bankStats.totalVerifiedQuestions,
              },
              {
                label: tr(lang, 'رسائل تواصل غير مقروءة', 'Messages non lus', 'Unread Contacts'),
                val: overviewApi?.unreadContactMessages ?? unreadContactCount,
              },
              {
                label: tr(lang, 'إحالات مؤكدة', 'Parrainages vérifiés', 'Verified Referrals'),
                val:
                  overviewApi?.verifiedReferrals ??
                  referralLogs.filter((l) => l.status === 'verified_rewarded').length,
              },
              {
                label: tr(lang, 'طلبات توثيق معلقة', 'Badges en attente', 'Pending Badges'),
                val: overviewApi?.pendingVerificationBadges ?? 0,
              },
            ].map((k, i) => (
              <div key={i} className="addressp-box !mb-0 !p-4 flex flex-col justify-between min-h-[78px]">
                <div className="text-[#6b787e] font-semibold">{k.label}</div>
                <div className="text-2xl font-black text-[#384D55] tabular-nums mt-1.5">{k.val}</div>
              </div>
            ))}
          </div>

          <AdminSystemHealthCard lang={lang} />

          {attempts.length > 0 && (
            <div className="addressp-box !mb-0 overflow-x-auto">
              <h2 className="ltitle">
                {lang === 'ar' ? 'أحدث نتائج الطلاب في الامتحانات' : 'Derniers résultats examens'}
              </h2>
              <table className="w-full text-xs text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">{lang === 'ar' ? 'الطالب' : 'Étudiant'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'النمط' : 'Mode'}</th>
                    <th className="p-2 text-start">{t.scoreOutOf20}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {attempts.slice(0, 15).map((a) => (
                    <tr key={a.id}>
                      <td className="p-2 font-bold">{a.student_name}</td>
                      <td className="p-2">{a.mode}</td>
                      <td className="p-2 font-extrabold tabular-nums">{a.score_20} / 20</td>
                      <td className="p-2 text-[#6b787e]">{new Date(a.submitted_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'students' && (
        <AdminDirectoryTab lang={lang} category="students" canVerify={hasPerm('verification')} onFlash={flash} />
      )}
      {activeTab === 'teachers' && (
        <AdminDirectoryTab lang={lang} category="teachers" canVerify={hasPerm('verification')} onFlash={flash} />
      )}
      {activeTab === 'professors' && (
        <AdminDirectoryTab lang={lang} category="professors" canVerify={hasPerm('verification')} onFlash={flash} />
      )}
      {activeTab === 'schools' && <AdminSchoolsTab lang={lang} onFlash={flash} />}
      {activeTab === 'verification' && <AdminVerificationTab lang={lang} onFlash={flash} />}
      {activeTab === 'exams' && (
        <AdminExamsTab lang={lang} attempts={attempts} onRefresh={loadAllAdminData} onFlash={flash} />
      )}
      {activeTab === 'payments' && <AdminNardoPayOrdersTab lang={lang} onFlash={flash} />}
      {activeTab === 'files' && <AdminFilesTab lang={lang} onFlash={flash} />}
      {activeTab === 'administrators' && <AdminAdministratorsTab lang={lang} onFlash={flash} />}

      {/* TAB: USERS (SINGLE ADMIN + ENABLE/DISABLE) */}
      {activeTab === 'users' && (
        <div className="addressp-box !mb-0 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="ltitle !mb-0 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#557a16]" />
              <span>
                {lang === 'ar'
                  ? `إدارة حسابات المستخدمين (${adminUsers.length})`
                  : `Gestion des utilisateurs (${adminUsers.length})`}
              </span>
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#6b787e] absolute top-2.5 start-2.5" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={lang === 'ar' ? 'بحث بالاسم أو البريد...' : 'Rechercher nom/email...'}
                className="template-input !ps-8 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                  <th className="p-2.5 text-start">{lang === 'ar' ? 'المستخدم' : 'Utilisateur'}</th>
                  <th className="p-2.5 text-start">{t.navTracks}</th>
                  <th className="p-2.5 text-start">{lang === 'ar' ? 'توثيق البريد' : 'E-mail'}</th>
                  <th className="p-2.5 text-start">{lang === 'ar' ? 'الاشتراك' : 'Abonnement'}</th>
                  <th className="p-2.5 text-start">{lang === 'ar' ? 'الحالة' : 'Statut'}</th>
                  <th className="p-2.5 text-start">{lang === 'ar' ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefef]">
                {filteredUsers.map((u) => {
                  const isOfficial = isOfficialAdminEmail(u.email);
                  const activeSub = adminSubscriptions.find(
                    (s) => s.uid === u.uid && s.status === 'active'
                  );
                  return (
                    <tr key={u.uid}>
                      <td className="p-2.5">
                        <div className="font-bold text-[#384D55]">
                          {u.name}{' '}
                          {isOfficial && (
                            <span className="px-1.5 py-0.5 rounded-[3px] bg-[#384D55] text-[#A6CE39] text-[10px]">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#6b787e]" dir="ltr">
                          {u.email || u.uid}
                        </div>
                      </td>
                      <td className="p-2.5">
                        {u.track} · {u.level}
                      </td>
                      <td className="p-2.5">
                        {u.emailVerified ? (
                          <span className="text-green-700 font-bold">✓ {lang === 'ar' ? 'موثق' : 'Vérifié'}</span>
                        ) : (
                          <span className="text-amber-700 font-bold">
                            {lang === 'ar' ? 'غير مفعل' : 'En attente'}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {activeSub ? (
                          <span className="px-2 py-0.5 rounded-[3px] bg-[#e2efbf] text-[#384D55] font-bold">
                            {lang === 'ar' ? activeSub.name_ar : activeSub.name_fr}
                          </span>
                        ) : (
                          <span className="text-[#6b787e]">{lang === 'ar' ? 'مجاني' : 'Gratuit'}</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {u.disabled ? (
                          <span className="text-red-700 font-bold">{lang === 'ar' ? 'موقوف' : 'Suspendu'}</span>
                        ) : (
                          <span className="text-green-700 font-bold">{lang === 'ar' ? 'نشط' : 'Actif'}</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {isOfficial ? (
                          <span className="text-[11px] text-[#6b787e]">
                            {lang === 'ar' ? 'المدير الرسمي' : 'Protégé'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleToggleUserDisabled(u)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                              u.disabled
                                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}
                          >
                            <Ban className="w-3 h-3" />
                            <span>
                              {u.disabled
                                ? lang === 'ar'
                                  ? 'إعادة التفعيل'
                                  : 'Réactiver'
                                : lang === 'ar'
                                  ? 'إيقاف الحساب'
                                  : 'Suspendre'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: LESSON SECTIONS & LESSONS CRUD */}
      {activeTab === 'lessons' && (
        <div className="space-y-5 text-xs">
          {/* Panel 1: Lesson Sections CRUD */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <form onSubmit={handleSaveSection} className="addressp-box !mb-0 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                  <FolderKanban className="w-4 h-4 text-[#557a16]" />
                  <span>
                    {editingSectionId
                      ? lang === 'ar'
                        ? 'تعديل قسم دروس'
                        : 'Modifier la section'
                      : lang === 'ar'
                        ? 'إضافة قسم دروس جديد'
                        : 'Créer une section de leçons'}
                  </span>
                </h2>
                {editingSectionId && (
                  <button type="button" onClick={resetSectionForm} className="text-[#6b787e] underline cursor-pointer">
                    {t.cancel}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select value={secSubject} onChange={(e) => setSecSubject(e.target.value)} className="template-input text-xs">
                  {catalog.subjects.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {lang === 'ar' ? s.name_ar : s.name_fr}
                    </option>
                  ))}
                </select>
                <select value={secTrack} onChange={(e) => setSecTrack(e.target.value as TrackSlug)} className="template-input text-xs">
                  <option value="all">{t.allTracks}</option>
                  <option value="arabic">{t.trackArabic}</option>
                  <option value="french">{t.trackFrench}</option>
                  <option value="bilingual">{t.trackBilingual}</option>
                </select>
                <select value={secLevel} onChange={(e) => setSecLevel(e.target.value as LevelSlug)} className="template-input text-xs">
                  <option value="foundation">{t.levelFoundation}</option>
                  <option value="intermediate">{t.levelIntermediate}</option>
                  <option value="advanced">{t.levelAdvanced}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  required
                  value={secTitleAr}
                  onChange={(e) => setSecTitleAr(e.target.value)}
                  placeholder={lang === 'ar' ? 'اسم القسم بالعربية' : 'Titre section (AR)'}
                  className="template-input"
                />
                <input
                  value={secTitleFr}
                  onChange={(e) => setSecTitleFr(e.target.value)}
                  placeholder={lang === 'ar' ? 'اسم القسم بالفرنسية' : 'Titre section (FR)'}
                  className="template-input"
                />
                <input
                  value={secDescAr}
                  onChange={(e) => setSecDescAr(e.target.value)}
                  placeholder={lang === 'ar' ? 'وصف مختصر AR' : 'Description AR'}
                  className="template-input"
                />
                <input
                  type="number"
                  min={1}
                  value={secOrder}
                  onChange={(e) => setSecOrder(Number(e.target.value))}
                  placeholder={lang === 'ar' ? 'الترتيب' : 'Ordre'}
                  className="template-input tabular-nums"
                />
              </div>

              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={secActive}
                  onChange={(e) => setSecActive(e.target.checked)}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'القسم ظاهر للطلاب' : 'Section visible'}</span>
              </label>

              <button type="submit" disabled={busyAction} className="imgsend2 !py-2 !px-4 !text-xs">
                <Plus className="w-4 h-4" />
                <span>{editingSectionId ? t.save : lang === 'ar' ? 'حفظ القسم' : 'Créer la section'}</span>
              </button>
            </form>

            <div className="addressp-box !mb-0 space-y-2.5">
              <h3 className="ltitle2">
                {lang === 'ar'
                  ? `أقسام الدروس الحالية (${adminSections.length})`
                  : `Sections existantes (${adminSections.length})`}
              </h3>
              {adminSections.length === 0 ? (
                <p className="text-[#6b787e]">
                  {lang === 'ar'
                    ? 'لم تتم إضافة أقسام بعد. أنشئ أقساماً لتنظيم الدروس حسب المحاور.'
                    : 'Aucune section créée pour le moment.'}
                </p>
              ) : (
                <div className="divide-y divide-[#efefef] max-h-64 overflow-y-auto">
                  {adminSections.map((sec) => (
                    <div key={sec.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#384D55]">
                          #{sec.displayOrder} · {lang === 'ar' ? sec.titleAr : sec.titleFr || sec.titleAr}
                        </div>
                        <div className="text-[11px] text-[#6b787e]">
                          {sec.subjectSlug} · {sec.track} · {sec.active ? '✓ Active' : 'Hidden'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSectionId(sec.id);
                            setSecTitleAr(sec.titleAr);
                            setSecTitleFr(sec.titleFr);
                            setSecDescAr(sec.descriptionAr);
                            setSecDescFr(sec.descriptionFr);
                            setSecSubject(sec.subjectSlug);
                            setSecTrack(sec.track);
                            setSecLevel(sec.level);
                            setSecOrder(sec.displayOrder);
                            setSecActive(sec.active);
                          }}
                          className="p-1.5 text-[#384D55] hover:bg-[#efefef] rounded-[3px] cursor-pointer"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSection(sec.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel 2: Lessons CRUD */}
          <form onSubmit={handleSaveLesson} className="addressp-box !mb-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                <FilePlus className="w-4 h-4 text-[#557a16]" />
                <span>
                  {editingLessonId
                    ? lang === 'ar'
                      ? 'تعديل درس'
                      : 'Modifier la leçon'
                    : lang === 'ar'
                      ? 'إضافة درس مكثف جديد'
                      : 'Ajouter une nouvelle leçon'}
                </span>
              </h2>
              {editingLessonId && (
                <button type="button" onClick={resetLessonForm} className="text-[#6b787e] underline cursor-pointer">
                  {t.cancel}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              <select value={lSubject} onChange={(e) => setLSubject(e.target.value)} className="template-input text-xs">
                {catalog.subjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {lang === 'ar' ? s.name_ar : s.name_fr}
                  </option>
                ))}
              </select>
              <select value={lSectionId} onChange={(e) => setLSectionId(e.target.value)} className="template-input text-xs">
                <option value="">{lang === 'ar' ? 'بدون قسم فرعي' : 'Sans section'}</option>
                {adminSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {lang === 'ar' ? sec.titleAr : sec.titleFr || sec.titleAr}
                  </option>
                ))}
              </select>
              <select value={lTrack} onChange={(e) => setLTrack(e.target.value as TrackSlug)} className="template-input text-xs">
                <option value="all">{t.allTracks}</option>
                <option value="arabic">{t.trackArabic}</option>
                <option value="french">{t.trackFrench}</option>
                <option value="bilingual">{t.trackBilingual}</option>
              </select>
              <select value={lLevel} onChange={(e) => setLLevel(e.target.value as LevelSlug)} className="template-input text-xs">
                <option value="foundation">{t.levelFoundation}</option>
                <option value="intermediate">{t.levelIntermediate}</option>
                <option value="advanced">{t.levelAdvanced}</option>
              </select>
              <input
                type="number"
                min={1}
                value={lOrder}
                onChange={(e) => setLOrder(Number(e.target.value))}
                placeholder={lang === 'ar' ? 'الترتيب' : 'Ordre'}
                className="template-input tabular-nums"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={lTitleAr}
                onChange={(e) => setLTitleAr(e.target.value)}
                placeholder={lang === 'ar' ? 'عنوان الدرس بالعربية' : 'Titre (AR)'}
                className="template-input"
              />
              <input
                value={lTitleFr}
                onChange={(e) => setLTitleFr(e.target.value)}
                placeholder={lang === 'ar' ? 'عنوان الدرس بالفرنسية' : 'Titre (FR)'}
                className="template-input"
              />
              <input
                value={lSummaryAr}
                onChange={(e) => setLSummaryAr(e.target.value)}
                placeholder={lang === 'ar' ? 'ملخص النقاط بالعربية' : 'Résumé (AR)'}
                className="template-input"
              />
              <input
                value={lSummaryFr}
                onChange={(e) => setLSummaryFr(e.target.value)}
                placeholder={lang === 'ar' ? 'ملخص النقاط بالفرنسية' : 'Résumé (FR)'}
                className="template-input"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <textarea
                required
                rows={3}
                value={lExpAr}
                onChange={(e) => setLExpAr(e.target.value)}
                placeholder={lang === 'ar' ? 'الشرح المفصل بالعربية' : 'Explication (AR)'}
                className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-2 outline-none focus:border-[#A6CE39]"
              />
              <textarea
                rows={3}
                value={lExpFr}
                onChange={(e) => setLExpFr(e.target.value)}
                placeholder={lang === 'ar' ? 'الشرح المفصل بالفرنسية' : 'Explication (FR)'}
                className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-2 outline-none focus:border-[#A6CE39]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={lActive}
                  onChange={(e) => setLActive(e.target.checked)}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'منشور ومتاح للطلاب' : 'Publié'}</span>
              </label>
              <button type="submit" disabled={busyAction} className="imgsend2 !py-2 !px-5 !text-xs">
                <BookOpen className="w-4 h-4" />
                <span>{editingLessonId ? t.save : lang === 'ar' ? 'نشر الدرس' : 'Publier'}</span>
              </button>
            </div>
          </form>

          <div className="addressp-box !mb-0 space-y-2">
            <h3 className="ltitle2">
              {lang === 'ar' ? `جميع الدروس (${adminLessons.length})` : `Leçons (${adminLessons.length})`}
            </h3>
            <div className="divide-y divide-[#efefef]">
              {adminLessons.map((l) => (
                <div key={l.firestoreId || l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <span className="font-bold text-[#384D55]">
                      #{l.lesson_order} · {lang === 'ar' ? l.title_ar : l.title_fr}
                    </span>{' '}
                    <span className="text-[#6b787e]">
                      ({l.subject_slug} · {l.level})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleToggleLessonActive(l)}
                      className={`px-2 py-1 rounded-[3px] border font-bold cursor-pointer ${
                        l.active !== false
                          ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                          : 'bg-[#f4f6f7] border-[#cfd6da] text-[#6b787e]'
                      }`}
                    >
                      {l.active !== false
                        ? lang === 'ar'
                          ? 'منشور'
                          : 'Publié'
                        : lang === 'ar'
                          ? 'مسودة'
                          : 'Masqué'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLessonId(l.firestoreId || null);
                        setLSubject(l.subject_slug);
                        setLSectionId(l.sectionId || '');
                        setLTrack(l.track);
                        setLLevel(l.level);
                        setLOrder(l.lesson_order || 1);
                        setLTitleAr(l.title_ar);
                        setLTitleFr(l.title_fr);
                        setLSummaryAr(l.summary_ar);
                        setLSummaryFr(l.summary_fr);
                        setLExpAr(l.explanation_ar);
                        setLExpFr(l.explanation_fr);
                        setLActive(l.active !== false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="p-1.5 text-[#384D55] hover:bg-[#efefef] rounded-[3px] cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteLesson(l)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: PLANS, PAYMENT REQUESTS, PAYMENT METHODS & FREE LIMITS */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-5 text-xs">
          {/* 1. Pending & Historical Mauritanian / Card Payment Requests Queue */}
          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle !mb-0 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#678813]" />
                <span>
                  {lang === 'ar'
                    ? `طلبات الدفع ومراجعة الإيصالات (${paymentRequests.length})`
                    : `Demandes d'abonnement & reçus (${paymentRequests.length})`}
                </span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'pending_review', 'manual_review', 'partial_pending', 'needs_info', 'approved', 'rejected', 'expired'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setReqStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                      reqStatusFilter === st
                        ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                        : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                    }`}
                  >
                    {st === 'all'
                      ? lang === 'ar'
                        ? 'الكل'
                        : 'Tous'
                      : st === 'pending_review'
                        ? lang === 'ar'
                          ? `قيد المراجعة (${paymentRequests.filter((r) => r.status === 'pending_review').length})`
                          : `En attente`
                        : st === 'manual_review'
                          ? lang === 'ar'
                            ? `مراجعة يدوية (${paymentRequests.filter((r) => r.status === 'manual_review').length})`
                            : `Révision manuelle`
                          : st === 'partial_pending'
                            ? lang === 'ar'
                              ? 'دفع جزئي'
                              : 'Partiel'
                            : st === 'needs_info'
                              ? lang === 'ar'
                                ? 'مطلوب توضيح'
                                : 'Info requise'
                              : st === 'approved'
                                ? lang === 'ar'
                                  ? 'مقبول'
                                  : 'Approuvé'
                                : st === 'rejected'
                                  ? lang === 'ar'
                                    ? 'مرفوض'
                                    : 'Refusé'
                                  : lang === 'ar'
                                    ? 'منتهي'
                                    : 'Expiré'}
                  </button>
                ))}
              </div>
            </div>

            {paymentRequests.filter((r) => reqStatusFilter === 'all' || r.status === reqStatusFilter).length === 0 ? (
              <p className="text-[#6b787e]">{t.emptyState}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start">
                  <thead>
                    <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                      <th className="p-2 text-start">ID</th>
                      <th className="p-2 text-start">{lang === 'ar' ? 'الطالب' : 'Candidat'}</th>
                      <th className="p-2 text-start">{lang === 'ar' ? 'الباقة والمبلغ' : 'Offre & Montant'}</th>
                      <th className="p-2 text-start">{lang === 'ar' ? 'الوسيلة / المعاملة' : 'Moyen & Réf'}</th>
                      <th className="p-2 text-start">{lang === 'ar' ? 'الإيصال' : 'Reçu'}</th>
                      <th className="p-2 text-start">{lang === 'ar' ? 'الحالة' : 'Statut'}</th>
                      <th className="p-2 text-start">{lang === 'ar' ? 'الإجراء الإداري' : 'Décision'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#efefef]">
                    {paymentRequests
                      .filter((r) => reqStatusFilter === 'all' || r.status === reqStatusFilter)
                      .map((rq) => {
                        const isActionable = ['pending_review', 'manual_review', 'partial_pending', 'needs_info'].includes(rq.status);
                        const paidAmt = rq.paid_amount ?? rq.extracted_amount ?? rq.amount;
                        const remAmt = rq.remaining_amount ?? Math.max(0, rq.amount - paidAmt);
                        return (
                          <tr key={rq.id}>
                            <td className="p-2 font-mono font-bold text-[#384D55]" dir="ltr">
                              {rq.subscription_request_id}
                            </td>
                            <td className="p-2">
                              <div className="font-bold text-[#384D55]">{rq.user_name || `#${rq.user_id}`}</div>
                              <div className="text-[11px] text-[#6b787e]" dir="ltr">
                                {rq.user_email}
                              </div>
                              {rq.sender_phone && (
                                <div className="text-[11px] font-mono text-[#1a4430]" dir="ltr">
                                  Tel: {rq.sender_phone}
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              <div className="font-bold">{rq.plan_name}</div>
                              <div className="tabular-nums font-extrabold text-[#557a16]">
                                {rq.amount} {rq.currency}
                              </div>
                              <div className="text-[10.5px] text-[#4a5c64] tabular-nums">
                                {lang === 'ar' ? 'المدفوع:' : 'Payé :'} {paidAmt} {rq.currency}
                                {remAmt > 0 && (
                                  <span className="text-amber-700 font-bold ms-1">
                                    ({lang === 'ar' ? `متبقي ${remAmt}` : `Reste ${remAmt}`})
                                  </span>
                                )}
                              </div>
                              {rq.second_extracted_amount !== null && rq.second_extracted_amount !== undefined && (
                                <div className="text-[10px] text-[#1a4430] tabular-nums">
                                  {lang === 'ar' ? 'دفعة مكمّلة:' : 'Complément :'} +{rq.second_extracted_amount} {rq.currency}
                                </div>
                              )}
                            </td>
                            <td className="p-2 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold uppercase">{rq.payment_method}</span>
                                {rq.risk_level && rq.risk_level !== 'normal' && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                      rq.risk_level === 'fraud_rejected' || rq.risk_level === 'suspicious'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {rq.risk_level}
                                  </span>
                                )}
                              </div>
                              {rq.transaction_id && (
                                <div className="text-[11px] font-mono" dir="ltr">
                                  ID: {rq.transaction_id}
                                </div>
                              )}
                              {rq.second_transaction_id && (
                                <div className="text-[10.5px] font-mono text-[#1a4430]" dir="ltr">
                                  ID2: {rq.second_transaction_id}
                                </div>
                              )}
                              {rq.transaction_reference && (
                                <div className="text-[11px] font-mono" dir="ltr">
                                  Ref: {rq.transaction_reference}
                                </div>
                              )}
                              {rq.beneficiary_name && (
                                <div className="text-[11px] text-[#6b787e]">{rq.beneficiary_name}</div>
                              )}
                              <div className="text-[10px] text-[#6b787e]" dir="ltr">
                                Tx: {new Date(rq.transaction_at).toLocaleString()}
                              </div>
                            </td>
                            <td className="p-2">
                              {rq.proof_data_url || rq.second_proof_data_url ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewProofReq(rq)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#e2efbf] border border-[#cfd6da] font-bold cursor-pointer"
                                >
                                  <Image className="w-3.5 h-3.5 text-[#557a16]" />
                                  <span>
                                    {tr(lang, 'معاينة', 'Voir', 'View')}
                                    {rq.second_proof_data_url ? ' (2)' : ''}
                                  </span>
                                </button>
                              ) : (
                                <span className="text-[#6b787e]">—</span>
                              )}
                            </td>
                            <td className="p-2">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-[3px] font-bold ${
                                  rq.status === 'approved'
                                    ? 'bg-[#e2efbf] text-[#384D55]'
                                    : rq.status === 'pending_review' || rq.status === 'manual_review'
                                      ? 'bg-amber-100 text-amber-900'
                                      : rq.status === 'partial_pending'
                                        ? 'bg-orange-100 text-orange-900'
                                        : rq.status === 'needs_info'
                                          ? 'bg-blue-100 text-blue-900'
                                          : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {rq.status}
                              </span>
                              {rq.expires_at && (
                                <div className="text-[10px] text-[#6b787e] tabular-nums mt-0.5" dir="ltr">
                                  Exp: {rq.expires_at.slice(0, 10)}
                                </div>
                              )}
                              {rq.admin_clarification_note && (
                                <div className="text-[10px] text-blue-800 mt-0.5 max-w-[170px]">
                                  {rq.admin_clarification_note}
                                </div>
                              )}
                              {rq.rejection_reason && (
                                <div className="text-[10px] text-red-700 mt-0.5 max-w-[160px]">
                                  {rq.rejection_reason}
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              {isActionable ? (
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      disabled={busyAction}
                                      onClick={() => void handleApprovePaymentRequest(rq, false)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] bg-[#557a16] hover:bg-[#446311] text-white font-bold cursor-pointer"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>{lang === 'ar' ? 'اعتماد وتفعيل' : 'Approuver'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyAction}
                                      onClick={() => {
                                        setClarifyTargetId(clarifyTargetId === rq.id ? null : rq.id);
                                        setClarifyNoteInput(rq.admin_clarification_note || '');
                                        setRejectTargetId(null);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] bg-blue-50 border border-blue-200 text-blue-800 font-bold cursor-pointer"
                                    >
                                      <AlertCircle className="w-3 h-3" />
                                      <span>{lang === 'ar' ? 'طلب توضيح' : 'Précision'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyAction}
                                      onClick={() => {
                                        setRejectTargetId(rejectTargetId === rq.id ? null : rq.id);
                                        setRejectReasonInput('');
                                        setClarifyTargetId(null);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] bg-red-50 border border-red-200 text-red-700 font-bold cursor-pointer"
                                    >
                                      <XCircle className="w-3 h-3" />
                                      <span>{lang === 'ar' ? 'رفض' : 'Refuser'}</span>
                                    </button>
                                  </div>
                                  {forceApproveTargetId === rq.id && (
                                    <div className="p-1.5 bg-amber-50 border border-amber-300 rounded-[3px] space-y-1">
                                      <div className="text-[10.5px] font-bold text-amber-900">
                                        {lang === 'ar'
                                          ? `المدفوع (${paidAmt}) أقل من المطلوب (${rq.amount}). هل تؤكد الاعتماد؟`
                                          : `Payé (${paidAmt}) < Requis (${rq.amount}). Confirmer ?`}
                                      </div>
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          disabled={busyAction}
                                          onClick={() => void handleApprovePaymentRequest(rq, true)}
                                          className="px-2 py-0.5 rounded-[3px] bg-[#557a16] text-white text-[10.5px] font-bold cursor-pointer"
                                        >
                                          {lang === 'ar' ? 'تأكيد الاعتماد' : 'Forcer'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setForceApproveTargetId(null)}
                                          className="px-2 py-0.5 rounded-[3px] bg-white border border-[#cfd6da] text-[10.5px] cursor-pointer"
                                        >
                                          {t.cancel}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {clarifyTargetId === rq.id && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={clarifyNoteInput}
                                        onChange={(e) => setClarifyNoteInput(e.target.value)}
                                        placeholder={lang === 'ar' ? 'أكتب التوضيح المطلوب...' : 'Note au candidat...'}
                                        className="template-input !h-7 text-[11px] min-w-[150px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void handleRequestInfoPaymentRequest(rq)}
                                        className="px-2 py-1 rounded-[3px] bg-blue-600 text-white font-bold cursor-pointer text-[11px]"
                                      >
                                        {lang === 'ar' ? 'إرسال' : 'Envoyer'}
                                      </button>
                                    </div>
                                  )}
                                  {rejectTargetId === rq.id && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={rejectReasonInput}
                                        onChange={(e) => setRejectReasonInput(e.target.value)}
                                        placeholder={lang === 'ar' ? 'سبب الرفض...' : 'Motif...'}
                                        className="template-input !h-7 text-[11px] min-w-[140px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void handleRejectPaymentRequest(rq)}
                                        className="px-2 py-1 rounded-[3px] bg-red-600 text-white font-bold cursor-pointer text-[11px]"
                                      >
                                        {lang === 'ar' ? 'تأكيد' : 'Confirmer'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#6b787e] text-[11px]">{rq.approved_by || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2. Mauritanian Payment Methods & Card Settings */}
          <div className="addressp-box !mb-0 space-y-3">
            <h3 className="ltitle2">
              {lang === 'ar'
                ? 'وسائل الدفع المفعلة (السداد · مصرفي · بنكيلي · البطاقة المصرفية)'
                : 'Moyens de paiement configurés'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {adminPaymentMethods.map((pm) => (
                <div key={pm.code} className="border border-[#d8dfe2] rounded-[3px] p-3 bg-[#f7f9fa] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#384D55]">
                      {lang === 'ar' ? pm.name_ar : pm.name_fr}{' '}
                      <span className="font-mono text-[11px] text-[#6b787e]">({pm.code})</span>
                    </span>
                    <label className="inline-flex items-center gap-1 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(pm.active)}
                        onChange={(e) =>
                          setAdminPaymentMethods((prev) =>
                            prev.map((x) => (x.code === pm.code ? { ...x, active: e.target.checked ? 1 : 0 } : x))
                          )
                        }
                        className="accent-[#384D55]"
                      />
                      <span>{lang === 'ar' ? 'مفعل' : 'Actif'}</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={pm.beneficiary_name}
                      onChange={(e) =>
                        setAdminPaymentMethods((prev) =>
                          prev.map((x) => (x.code === pm.code ? { ...x, beneficiary_name: e.target.value } : x))
                        )
                      }
                      placeholder={lang === 'ar' ? 'اسم المستفيد' : 'Bénéficiaire'}
                      className="template-input"
                    />
                    <input
                      value={pm.account_number}
                      dir="ltr"
                      onChange={(e) =>
                        setAdminPaymentMethods((prev) =>
                          prev.map((x) => (x.code === pm.code ? { ...x, account_number: e.target.value } : x))
                        )
                      }
                      placeholder={lang === 'ar' ? 'رقم الحساب / الهاتف' : 'Compte / Numéro'}
                      className="template-input font-mono"
                    />
                  </div>
                  <input
                    value={pm.instructions_ar}
                    onChange={(e) =>
                      setAdminPaymentMethods((prev) =>
                        prev.map((x) => (x.code === pm.code ? { ...x, instructions_ar: e.target.value } : x))
                      )
                    }
                    placeholder={lang === 'ar' ? 'التعليمات بالعربية' : 'Instructions (AR)'}
                    className="template-input"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleSavePaymentMethod(pm)}
                      className="imgsend2-secondary !py-1 !px-3 !text-[11px]"
                    >
                      {t.save}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddPaymentMethod} className="border-t border-[#efefef] pt-3 space-y-2">
              <div className="font-bold text-[#384D55]">
                {lang === 'ar' ? 'إضافة وسيلة دفع جديدة:' : 'Ajouter un moyen de paiement :'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <input
                  value={newMethodCode}
                  dir="ltr"
                  onChange={(e) => setNewMethodCode(e.target.value)}
                  placeholder="code (e.g. click)"
                  className="template-input font-mono"
                />
                <input
                  value={newMethodNameAr}
                  onChange={(e) => setNewMethodNameAr(e.target.value)}
                  placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Nom (AR)'}
                  className="template-input"
                />
                <input
                  value={newMethodNameFr}
                  onChange={(e) => setNewMethodNameFr(e.target.value)}
                  placeholder="Nom (FR)"
                  className="template-input"
                />
                <input
                  value={newMethodBeneficiary}
                  onChange={(e) => setNewMethodBeneficiary(e.target.value)}
                  placeholder={lang === 'ar' ? 'المستفيد' : 'Bénéficiaire'}
                  className="template-input"
                />
                <input
                  value={newMethodAccount}
                  dir="ltr"
                  onChange={(e) => setNewMethodAccount(e.target.value)}
                  placeholder={lang === 'ar' ? 'الحساب / الرقم' : 'Numéro'}
                  className="template-input font-mono"
                />
                <button type="submit" disabled={busyAction} className="imgsend2 !py-1.5 !px-3 !text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'إضافة وسيلة' : 'Ajouter'}</span>
                </button>
              </div>
              <input
                value={newMethodInstrAr}
                onChange={(e) => setNewMethodInstrAr(e.target.value)}
                placeholder={lang === 'ar' ? 'تعليمات التحويل للطلاب (اختياري)' : 'Instructions AR'}
                className="template-input"
              />
            </form>
          </div>

          {/* 3. Free Plan Daily Quotas & Paid Unlock Rules */}
          <form onSubmit={handleSaveFreeLimits} className="addressp-box !mb-0 space-y-3">
            <h3 className="ltitle2">
              {lang === 'ar' ? 'حدود الباقة المجانية اليومية وصلاحيات الوصول' : 'Quotas quotidiens de la formule gratuite'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-2xl">
              <div>
                <label className="block font-bold mb-1">
                  {lang === 'ar' ? 'الأسئلة اليومية المجانية' : 'Questions / jour'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={freeLimits.daily_questions_limit}
                  onChange={(e) =>
                    setFreeLimits((p) => ({ ...p, daily_questions_limit: Number(e.target.value) }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">
                  {lang === 'ar' ? 'الدروس اليومية المجانية' : 'Leçons / jour'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={freeLimits.daily_lessons_limit}
                  onChange={(e) =>
                    setFreeLimits((p) => ({ ...p, daily_lessons_limit: Number(e.target.value) }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">
                  {lang === 'ar' ? 'الاختبارات اليومية المجانية' : 'Examens / jour'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={freeLimits.daily_exams_limit}
                  onChange={(e) =>
                    setFreeLimits((p) => ({ ...p, daily_exams_limit: Number(e.target.value) }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(freeLimits.allow_official_sim)}
                  onChange={(e) =>
                    setFreeLimits((p) => ({ ...p, allow_official_sim: e.target.checked ? 1 : 0 }))
                  }
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'إتاحة المحاكاة الرسمية (70 سؤالاً) للمجاني' : 'Simulation officielle gratuite'}</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(freeLimits.allow_review_center)}
                  onChange={(e) =>
                    setFreeLimits((p) => ({ ...p, allow_review_center: e.target.checked ? 1 : 0 }))
                  }
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'إتاحة مركز المراجعة للمجاني' : 'Centre de révision gratuit'}</span>
              </label>
              <button type="submit" disabled={busyAction} className="imgsend2 !py-1.5 !px-4 !text-xs">
                {t.save}
              </button>
            </div>
          </form>

          {/* 4. Plans Management */}
          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle !mb-0 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#678813]" />
                <span>{lang === 'ar' ? 'باقات الاشتراك والأسعار' : 'Forfaits & Tarifs'}</span>
              </h2>
              <span className="px-2.5 py-1 rounded-[3px] bg-[#efefef] border border-[#cfd6da] font-bold">
                السداد · مصرفي · بنكيلي · Visa / Mastercard
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(sqlPlans.length > 0 ? sqlPlans : adminPlans).map((pl) => (
                <div key={pl.firestoreId || pl.id} className="border border-[#d8dfe2] rounded-[3px] p-3 bg-[#f7f9fa] space-y-2">
                  <div className="flex items-center justify-between font-bold text-[#384D55]">
                    <span>{lang === 'ar' ? pl.name_ar : pl.name_fr}</span>
                    <span className="tabular-nums">{pl.price_mru} MRU</span>
                  </div>
                  <div className="text-[11px] text-[#6b787e]">
                    {pl.duration_days} {lang === 'ar' ? 'يوماً' : 'j'} · {pl.active ? 'Active' : 'Inactive'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPlan({ ...pl })}
                    className="imgsend2-secondary !py-1 !px-3 !text-[11px]"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{lang === 'ar' ? 'تعديل الباقة' : 'Modifier'}</span>
                  </button>
                </div>
              ))}
            </div>

            {editingPlan && (
              <form onSubmit={handleSavePlanEdit} className="border-t border-[#d8dfe2] pt-3 space-y-3 bg-white p-3 rounded-[4px]">
                <div className="flex items-center justify-between font-bold text-[#384D55]">
                  <span>
                    {lang === 'ar' ? `تعديل باقة: ${editingPlan.name_ar}` : `Édition : ${editingPlan.name_fr}`}
                  </span>
                  <button type="button" onClick={() => setEditingPlan(null)} className="underline text-[#6b787e] cursor-pointer">
                    {t.cancel}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <input
                    required
                    value={editingPlan.name_ar}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name_ar: e.target.value })}
                    placeholder="الاسم بالعربية"
                    className="template-input"
                  />
                  <input
                    required
                    value={editingPlan.name_fr}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name_fr: e.target.value })}
                    placeholder="Nom FR"
                    className="template-input"
                  />
                  <input
                    type="number"
                    min={0}
                    value={editingPlan.price_mru}
                    onChange={(e) => setEditingPlan({ ...editingPlan, price_mru: Number(e.target.value) })}
                    placeholder="السعر MRU"
                    className="template-input tabular-nums"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={editingPlan.price_eur}
                    onChange={(e) => setEditingPlan({ ...editingPlan, price_eur: Number(e.target.value) })}
                    placeholder="EUR"
                    className="template-input tabular-nums"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingPlan.is_popular)}
                      onChange={(e) => setEditingPlan({ ...editingPlan, is_popular: e.target.checked ? 1 : 0 })}
                      className="accent-[#384D55]"
                    />
                    <span>{lang === 'ar' ? 'باقة مميزة' : 'Populaire'}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingPlan.active)}
                      onChange={(e) => setEditingPlan({ ...editingPlan, active: e.target.checked ? 1 : 0 })}
                      className="accent-[#384D55]"
                    />
                    <span>{lang === 'ar' ? 'متاحة للاشتراك' : 'Active'}</span>
                  </label>
                  <button type="submit" disabled={busyAction} className="imgsend2 !py-1.5 !px-4 !text-xs">
                    {t.save}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Subscriptions Table */}
          <div className="addressp-box !mb-0 overflow-x-auto space-y-3">
            <h3 className="ltitle2">
              {lang === 'ar' ? `اشتراكات المستخدمين (${adminSubscriptions.length})` : 'Abonnements utilisateurs'}
            </h3>
            {adminSubscriptions.length === 0 ? (
              <p className="text-[#6b787e]">{t.emptyState}</p>
            ) : (
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">{lang === 'ar' ? 'المشترك' : 'Abonné'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'الباقة' : 'Forfait'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'الحالة' : 'Statut'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'ينتهي في' : 'Expire le'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {adminSubscriptions.map((s) => {
                    const matchedUser = s.uid ? userByUid.get(s.uid) : undefined;
                    return (
                      <tr key={s.firestoreId || s.id}>
                        <td className="p-2 font-bold text-[#384D55]">
                          {matchedUser?.name || s.uid}{' '}
                          <span className="font-normal text-[#6b787e]" dir="ltr">
                            ({matchedUser?.email || ''})
                          </span>
                        </td>
                        <td className="p-2">{lang === 'ar' ? s.name_ar : s.name_fr}</td>
                        <td className="p-2">
                          <select
                            value={s.status}
                            onChange={async (e) => {
                              if (!s.firestoreId) return;
                              await updateSubscriptionStatusAdmin(s.firestoreId, e.target.value as any);
                              await loadAllAdminData();
                              flash(lang === 'ar' ? 'تم تحديث حالة الاشتراك.' : 'Statut mis à jour.');
                            }}
                            className="template-input !h-7 !w-auto text-xs"
                          >
                            <option value="active">active</option>
                            <option value="pending">pending</option>
                            <option value="expired">expired</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </td>
                        <td className="p-2 tabular-nums text-[#6b787e]">
                          {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Masked Orders Table */}
          <div className="addressp-box !mb-0 overflow-x-auto space-y-3">
            <h3 className="ltitle2">
              {lang === 'ar'
                ? `سجل معاملات الدفع الآمنة Visa / Mastercard (${adminOrders.length})`
                : 'Transactions Visa / Mastercard (masquées)'}
            </h3>
            {adminOrders.length === 0 ? (
              <p className="text-[#6b787e]">{t.emptyState}</p>
            ) : (
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">Ref</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'المستخدم' : 'Utilisateur'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'الباقة' : 'Forfait'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'البطاقة' : 'Carte'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'المبلغ' : 'Montant'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'الحالة' : 'Statut'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {adminOrders.map((tx) => (
                    <tr key={tx.firestoreId || tx.id}>
                      <td className="p-2 tabular-nums font-bold" dir="ltr">
                        {tx.provider_tx_id}
                      </td>
                      <td className="p-2">
                        {tx.user_name}{' '}
                        <span className="text-[#6b787e]" dir="ltr">
                          ({tx.user_email})
                        </span>
                      </td>
                      <td className="p-2">{lang === 'ar' ? tx.plan_name_ar : tx.plan_name_fr}</td>
                      <td className="p-2 font-mono uppercase" dir="ltr">
                        {tx.card_brand} •••• {tx.card_last4}
                      </td>
                      <td className="p-2 tabular-nums font-bold">
                        {tx.amount_mru} MRU / €{tx.amount_eur}
                      </td>
                      <td className="p-2">
                        <select
                          value={tx.status}
                          onChange={async (e) => {
                            if (!tx.firestoreId) return;
                            await updateOrderStatusAdmin(tx.firestoreId, e.target.value as any);
                            await loadAllAdminData();
                          }}
                          className="template-input !h-7 !w-auto text-xs"
                        >
                          <option value="succeeded">succeeded</option>
                          <option value="pending">pending</option>
                          <option value="failed">failed</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </td>
                      <td className="p-2 tabular-nums text-[#6b787e]">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB: TARGETED NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs items-start">
          <form onSubmit={handleSendNotification} className="addressp-box !mb-0 space-y-3">
            <h2 className="ltitle flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-[#557a16]" />
              <span>{lang === 'ar' ? 'إرسال إشعار موجه' : 'Envoyer une notification ciblée'}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">
                  {lang === 'ar' ? 'نطاق الاستهداف' : 'Cible'}
                </label>
                <select
                  value={notifScope}
                  onChange={(e) => setNotifScope(e.target.value as NotificationTargetScope)}
                  className="template-input text-xs"
                >
                  <option value="current_users">
                    {lang === 'ar'
                      ? 'المستخدمون المسجلون حالياً فقط (يستبعد المسجلين لاحقاً)'
                      : 'Utilisateurs actuels uniquement (exclut les futurs)'}
                  </option>
                  <option value="conditional">
                    {lang === 'ar'
                      ? 'استهداف شرطي (الشعبة / المستوى / الاشتراك)'
                      : 'Ciblage conditionnel (filière/niveau/offre)'}
                  </option>
                  <option value="specific_users">
                    {lang === 'ar' ? 'مستخدمون محددون بالاختيار' : 'Utilisateurs spécifiques'}
                  </option>
                  <option value="all_including_future">
                    {lang === 'ar'
                      ? 'عام للجميع (بما فيهم المسجلون مستقبلاً)'
                      : 'Tous (y compris futurs inscrits)'}
                  </option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">
                  {lang === 'ar' ? 'تصنيف التنبيه' : 'Type'}
                </label>
                <select
                  value={notifType}
                  onChange={(e) => setNotifType(e.target.value as any)}
                  className="template-input text-xs"
                >
                  <option value="info">{lang === 'ar' ? 'إخباري' : 'Information'}</option>
                  <option value="exam">{lang === 'ar' ? 'تنبيه امتحان' : 'Examen'}</option>
                  <option value="alert">{lang === 'ar' ? 'تنبيه هام' : 'Alerte'}</option>
                  <option value="offer">{lang === 'ar' ? 'عرض وباقة' : 'Offre'}</option>
                </select>
              </div>
            </div>

            {notifScope === 'conditional' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 bg-[#f7f9fa] border border-[#d8dfe2] rounded-[3px]">
                <select
                  value={notifTrack}
                  onChange={(e) => setNotifTrack(e.target.value as TrackSlug)}
                  className="template-input text-xs"
                >
                  <option value="all">{t.allTracks}</option>
                  <option value="arabic">{t.trackArabic}</option>
                  <option value="french">{t.trackFrench}</option>
                  <option value="bilingual">{t.trackBilingual}</option>
                </select>
                <select
                  value={notifLevel}
                  onChange={(e) => setNotifLevel(e.target.value as any)}
                  className="template-input text-xs"
                >
                  <option value="all">{lang === 'ar' ? 'كل المستويات' : 'Tous niveaux'}</option>
                  <option value="foundation">{t.levelFoundation}</option>
                  <option value="intermediate">{t.levelIntermediate}</option>
                  <option value="advanced">{t.levelAdvanced}</option>
                </select>
                <select
                  value={notifSubFilter}
                  onChange={(e) => setNotifSubFilter(e.target.value as any)}
                  className="template-input text-xs"
                >
                  <option value="all">{lang === 'ar' ? 'كل الاشتراكات' : 'Tous abonnements'}</option>
                  <option value="paid">{lang === 'ar' ? 'المشتركون المدفوعون' : 'Payants'}</option>
                  <option value="free">{lang === 'ar' ? 'الحسابات المجانية' : 'Gratuits'}</option>
                </select>
              </div>
            )}

            {notifScope === 'specific_users' && (
              <div className="p-2.5 bg-[#f7f9fa] border border-[#d8dfe2] rounded-[3px] max-h-40 overflow-y-auto space-y-1">
                <div className="font-bold text-[#384D55] mb-1">
                  {lang === 'ar'
                    ? `اختر المستخدمين (${notifTargetUids.length} محدد):`
                    : `Sélectionner (${notifTargetUids.length}) :`}
                </div>
                {adminUsers.map((u) => {
                  const checked = notifTargetUids.includes(u.uid);
                  return (
                    <label key={u.uid} className="flex items-center gap-2 cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNotifTargetUids((prev) =>
                            checked ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                          )
                        }
                        className="accent-[#384D55]"
                      />
                      <span>{u.name}</span>
                      <span className="text-[#6b787e]" dir="ltr">
                        ({u.email || u.uid})
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <input
              required
              value={notifTitleAr}
              onChange={(e) => setNotifTitleAr(e.target.value)}
              placeholder={lang === 'ar' ? 'عنوان الإشعار بالعربية' : 'Titre (AR)'}
              className="template-input"
            />
            <input
              value={notifTitleFr}
              onChange={(e) => setNotifTitleFr(e.target.value)}
              placeholder={lang === 'ar' ? 'عنوان الإشعار بالفرنسية (اختياري)' : 'Titre (FR)'}
              className="template-input"
            />
            <textarea
              required
              rows={2}
              value={notifBodyAr}
              onChange={(e) => setNotifBodyAr(e.target.value)}
              placeholder={lang === 'ar' ? 'نص الإشعار بالعربية' : 'Message (AR)'}
              className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-2 outline-none focus:border-[#A6CE39]"
            />
            <textarea
              rows={2}
              value={notifBodyFr}
              onChange={(e) => setNotifBodyFr(e.target.value)}
              placeholder={lang === 'ar' ? 'نص الإشعار بالفرنسية (اختياري)' : 'Message (FR)'}
              className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-2 outline-none focus:border-[#A6CE39]"
            />

            <button type="submit" disabled={busyAction} className="imgsend2 !py-2 !px-5 !text-xs">
              <Send className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إرسال الإشعار' : 'Publier'}</span>
            </button>
          </form>

          <div className="addressp-box !mb-0 space-y-2.5">
            <h3 className="ltitle2">
              {lang === 'ar'
                ? `سجل الإشعارات المرسلة (${adminNotifications.length})`
                : `Historique (${adminNotifications.length})`}
            </h3>
            {adminNotifications.length === 0 ? (
              <p className="text-[#6b787e]">{t.emptyState}</p>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto">
                {adminNotifications.map((n) => (
                  <div key={n.firestoreId || n.id} className="border border-[#d8dfe2] rounded-[3px] p-2.5 bg-[#f7f9fa] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#384D55]">
                        {lang === 'ar' ? n.title_ar : n.title_fr}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-[3px] bg-white border border-[#cfd6da] text-[10px] font-bold">
                          {n.targetScope || 'current_users'}
                        </span>
                        {n.firestoreId && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteNotificationAdmin(n.firestoreId!);
                              await loadAllAdminData();
                            }}
                            className="text-red-600 hover:bg-red-50 p-1 rounded-[3px] cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[#4a5c64]">{lang === 'ar' ? n.body_ar : n.body_fr}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: REAL-TIME SUPPORT CONVERSATIONS CHAT */}
      {activeTab === 'chat' && (
        <div className="addressp-box !mb-0 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ltitle !mb-0 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#557a16]" />
              <span>{lang === 'ar' ? 'مركز محادثات الدعم المباشر' : 'Messagerie Support Temps Réel'}</span>
            </h2>
            <div className="flex items-center gap-1.5">
              {(['all', 'open', 'pending', 'closed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setChatFilter(st)}
                  className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                    chatFilter === st
                      ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                      : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 border border-[#d8dfe2] rounded-[3px] bg-[#f7f9fa] divide-y divide-[#e2e7ea] max-h-[460px] overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-[#6b787e]">{t.emptyState}</div>
              ) : (
                filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-start p-3 cursor-pointer transition-colors ${
                      conv.id === activeConv?.id ? 'bg-[#e2efbf]' : 'hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold text-[#384D55]">
                      <span className="truncate">{conv.userName || conv.userEmail}</span>
                      {conv.unreadForAdmin > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#384D55] text-[#A6CE39] text-[10px]">
                          {conv.unreadForAdmin}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-[#557a16] truncate mt-0.5">{conv.subject}</div>
                    <div className="text-[11px] text-[#6b787e] truncate mt-0.5">
                      {conv.lastMessagePreview}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-2 border border-[#d8dfe2] rounded-[3px] bg-white flex flex-col h-[460px]">
              {activeConv ? (
                <>
                  <div className="px-3.5 py-2.5 bg-[#f4f6f7] border-b border-[#d8dfe2] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-[#384D55]">{activeConv.subject}</div>
                      <div className="text-[11px] text-[#6b787e]" dir="ltr">
                        {activeConv.userName} ({activeConv.userEmail})
                      </div>
                    </div>
                    <select
                      value={activeConv.status}
                      onChange={async (e) => {
                        await updateConversationStatusAdmin(activeConv.id, e.target.value as any);
                      }}
                      className="template-input !h-7 !w-auto text-xs"
                    >
                      <option value="open">open</option>
                      <option value="pending">pending</option>
                      <option value="closed">closed</option>
                    </select>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                    {chatMessages.map((m) => {
                      const isAdminMsg = m.senderRole === 'admin';
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[82%] px-3 py-2 rounded-[4px] border ${
                              isAdminMsg
                                ? 'bg-[#384D55] text-white border-[#384D55]'
                                : 'bg-[#f4f6f7] text-[#384D55] border-[#d8dfe2]'
                            }`}
                          >
                            <div className="text-[10px] opacity-80 font-bold mb-0.5">
                              {m.senderName} · {isAdminMsg ? 'Admin' : 'Student'}
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  <form
                    onSubmit={handleSendAdminChatReply}
                    className="p-2.5 border-t border-[#d8dfe2] bg-[#f9fafb] flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={adminChatReply}
                      onChange={(e) => setAdminChatReply(e.target.value)}
                      placeholder={lang === 'ar' ? 'اكتب ردك الفوري هنا...' : 'Répondre en direct...'}
                      className="template-input flex-1"
                    />
                    <button type="submit" disabled={!adminChatReply.trim()} className="imgsend2 !py-2 !px-4 text-xs">
                      <Send className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'إرسال' : 'Envoyer'}</span>
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#6b787e]">
                  {lang === 'ar' ? 'اختر محادثة لعرضها والرد عليها.' : 'Sélectionnez une conversation.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: QUESTION BANK CRUD + DEDUPLICATION */}
      {activeTab === 'questions' && (
        <div className="space-y-5 text-xs">
          <form onSubmit={handleCreateQuestion} className="addressp-box !mb-0 space-y-3">
            <h2 className="ltitle">
              {lang === 'ar'
                ? 'إضافة سؤال فريد لبنك الأسئلة (مع فحص التكرار التلقائي)'
                : 'Ajouter une question unique (anti-doublon actif)'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <select value={qSubject} onChange={(e) => setQSubject(e.target.value)} className="template-input text-xs">
                {catalog.subjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {lang === 'ar' ? s.name_ar : s.name_fr}
                  </option>
                ))}
              </select>
              <select value={qTrack} onChange={(e) => setQTrack(e.target.value)} className="template-input text-xs">
                <option value="all">{t.allTracks}</option>
                <option value="arabic">{t.trackArabic}</option>
                <option value="french">{t.trackFrench}</option>
                <option value="bilingual">{t.trackBilingual}</option>
              </select>
              <select value={qLevel} onChange={(e) => setQLevel(e.target.value)} className="template-input text-xs">
                <option value="foundation">{t.levelFoundation}</option>
                <option value="intermediate">{t.levelIntermediate}</option>
                <option value="advanced">{t.levelAdvanced}</option>
              </select>
              <select value={qCorrect} onChange={(e) => setQCorrect(Number(e.target.value))} className="template-input text-xs">
                <option value={0}>Correct: A (1)</option>
                <option value={1}>Correct: B (2)</option>
                <option value={2}>Correct: C (3)</option>
                <option value={3}>Correct: D (4)</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={qStemAr}
                onChange={(e) => setQStemAr(e.target.value)}
                placeholder={lang === 'ar' ? 'نص السؤال بالعربية' : 'Énoncé (AR)'}
                className="template-input"
              />
              <input
                required
                value={qStemFr}
                onChange={(e) => setQStemFr(e.target.value)}
                placeholder={lang === 'ar' ? 'نص السؤال بالفرنسية' : 'Énoncé (FR)'}
                className="template-input"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {qOptAr.map((v, i) => (
                <input
                  key={`ar-${i}`}
                  required
                  value={v}
                  onChange={(e) => {
                    const next = [...qOptAr];
                    next[i] = e.target.value;
                    setQOptAr(next);
                  }}
                  placeholder={`خيار AR ${i + 1}`}
                  className="template-input"
                />
              ))}
              {qOptFr.map((v, i) => (
                <input
                  key={`fr-${i}`}
                  required
                  value={v}
                  onChange={(e) => {
                    const next = [...qOptFr];
                    next[i] = e.target.value;
                    setQOptFr(next);
                  }}
                  placeholder={`Option FR ${i + 1}`}
                  className="template-input"
                />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={qExpAr}
                onChange={(e) => setQExpAr(e.target.value)}
                placeholder={lang === 'ar' ? 'تفسير الإجابة بالعربية' : 'Explication (AR)'}
                className="template-input"
              />
              <input
                value={qExpFr}
                onChange={(e) => setQExpFr(e.target.value)}
                placeholder={lang === 'ar' ? 'تفسير الإجابة بالفرنسية' : 'Explication (FR)'}
                className="template-input"
              />
            </div>
            <button type="submit" className="imgsend2 !py-2 !px-5 !text-xs">
              {lang === 'ar' ? 'إضافة للبنك' : 'Ajouter à la banque'}
            </button>
          </form>

          <div className="addressp-box !mb-0 space-y-2.5">
            <h3 className="ltitle2 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-[#557a16]" />
              <span>{lang === 'ar' ? 'استيراد جماعي بصيغة JSON (مع رفض المكرر)' : 'Import JSON (anti-doublon)'}</span>
            </h3>
            <textarea
              rows={3}
              dir="ltr"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='[{"subject_slug":"mathematics","stem_ar":"...","stem_fr":"...","options_ar":["...","...","...","..."],"options_fr":["...","...","...","..."],"correct_index":0}]'
              className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-2 font-mono outline-none focus:border-[#A6CE39]"
            />
            <button
              type="button"
              onClick={handleImportQuestions}
              className="px-4 py-2 rounded-[3px] bg-[#384D55] text-white font-bold cursor-pointer"
            >
              {lang === 'ar' ? 'تنفيذ الاستيراد' : 'Importer'}
            </button>
          </div>

          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="ltitle2 !mb-0 tabular-nums">
                {lang === 'ar'
                  ? `أسئلة البنك (${qTotal.toLocaleString()} سؤال · صفحة ${qPage}/${qTotalPages})`
                  : `Questions (${qTotal.toLocaleString()} · Page ${qPage}/${qTotalPages})`}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={qSearchFilter}
                  onChange={(e) => {
                    setQSearchFilter(e.target.value);
                    setQPage(1);
                  }}
                  placeholder={lang === 'ar' ? 'بحث في الأسئلة...' : 'Rechercher...'}
                  className="template-input !h-8 !w-48 text-xs"
                />
                <select
                  value={qStatusFilter}
                  onChange={(e) => {
                    setQStatusFilter(e.target.value as any);
                    setQPage(1);
                  }}
                  className="template-input !h-8 !w-auto text-xs"
                >
                  <option value="all">{lang === 'ar' ? 'كل الحالات' : 'Tous statuts'}</option>
                  <option value="published">published</option>
                  <option value="approved">approved</option>
                  <option value="review">review</option>
                  <option value="draft">draft</option>
                  <option value="archived">archived</option>
                </select>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto divide-y divide-[#efefef]">
              {questionsList.map((q) => (
                <div key={q.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex-1 min-w-[220px] truncate">
                    <span className="font-bold text-[#384D55]">#{q.id}</span> ·{' '}
                    <span className="text-[11px] text-[#557a16] font-bold">[{q.track}]</span>{' '}
                    <span>{lang === 'ar' ? q.stem_ar : q.stem_fr}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      value={q.content_status || 'published'}
                      onChange={(e) => void handleQuickQuestionStatus(q.id, e.target.value as any)}
                      className="template-input !h-7 !w-auto text-[11px]"
                    >
                      <option value="published">published</option>
                      <option value="approved">approved</option>
                      <option value="review">review</option>
                      <option value="draft">draft</option>
                      <option value="archived">archived</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditingQuestion({ ...q })}
                      className="p-1 text-[#384D55] hover:bg-[#e2efbf] rounded-[3px] cursor-pointer"
                      title={lang === 'ar' ? 'تعديل' : 'Modifier'}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteQuestion(q.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                      title={lang === 'ar' ? 'حذف' : 'Supprimer'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {qTotalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-[#efefef]">
                <button
                  type="button"
                  disabled={qPage <= 1}
                  onClick={() => setQPage((p) => Math.max(1, p - 1))}
                  className="imgsend2-secondary !py-1 !px-3 text-xs disabled:opacity-40"
                >
                  {lang === 'ar' ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  <span>{lang === 'ar' ? 'السابق' : 'Précédent'}</span>
                </button>
                <span className="font-extrabold tabular-nums">
                  {qPage} / {qTotalPages}
                </span>
                <button
                  type="button"
                  disabled={qPage >= qTotalPages}
                  onClick={() => setQPage((p) => Math.min(qTotalPages, p + 1))}
                  className="imgsend2 !py-1 !px-3 text-xs disabled:opacity-40"
                >
                  <span>{lang === 'ar' ? 'التالي' : 'Suivant'}</span>
                  {lang === 'ar' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            {editingQuestion && (
              <form
                onSubmit={handleSaveEditedQuestion}
                className="border border-[#A6CE39] bg-[#f7f9fa] rounded-[4px] p-3 space-y-2.5 mt-2"
              >
                <div className="flex items-center justify-between font-bold text-[#384D55]">
                  <span>
                    {lang === 'ar' ? `تعديل السؤال #${editingQuestion.id}` : `Modifier question #${editingQuestion.id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(null)}
                    className="text-xs underline text-[#6b787e] cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    required
                    value={editingQuestion.stem_ar}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, stem_ar: e.target.value })}
                    placeholder="نص السؤال AR"
                    className="template-input"
                  />
                  <input
                    required
                    value={editingQuestion.stem_fr}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, stem_fr: e.target.value })}
                    placeholder="Énoncé FR"
                    className="template-input"
                  />
                  <input
                    value={editingQuestion.axis_ar || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, axis_ar: e.target.value })}
                    placeholder="المحور AR"
                    className="template-input"
                  />
                  <select
                    value={editingQuestion.correct_index ?? 0}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, correct_index: Number(e.target.value) })}
                    className="template-input"
                  >
                    <option value={0}>Correct: A (1)</option>
                    <option value={1}>Correct: B (2)</option>
                    <option value={2}>Correct: C (3)</option>
                    <option value={3}>Correct: D (4)</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <textarea
                    rows={2}
                    value={editingQuestion.explanation_ar || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation_ar: e.target.value })}
                    placeholder="التفسير AR"
                    className="w-full border border-[#c9d0d3] rounded-[4px] px-2.5 py-1.5"
                  />
                  <textarea
                    rows={2}
                    value={editingQuestion.explanation_fr || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation_fr: e.target.value })}
                    placeholder="Explication FR"
                    className="w-full border border-[#c9d0d3] rounded-[4px] px-2.5 py-1.5"
                  />
                </div>
                <button type="submit" disabled={busyAction} className="imgsend2 !py-1.5 !px-4 !text-xs">
                  {t.save}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB: SITE CONFIG, GRADING POLICY & PRONUNCIATION DICTIONARY */}
      {activeTab === 'site' && (
        <div className="space-y-5 text-xs">
          <form onSubmit={handleSavePolicy} className="addressp-box !mb-0 space-y-3">
            <h2 className="ltitle flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-[#557a16]" />
              <span>{lang === 'ar' ? 'سياسة التصحيح والعلامة من 20' : 'Politique de notation /20'}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-xl">
              <div>
                <label className="block font-bold mb-1">Max Score</label>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Wrong Penalty</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="1"
                  value={wrongPenalty}
                  onChange={(e) => setWrongPenalty(Number(e.target.value))}
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Passing Score</label>
                <input
                  type="number"
                  value={passingScore}
                  onChange={(e) => setPassingScore(Number(e.target.value))}
                  className="template-input tabular-nums"
                />
              </div>
            </div>
            <button type="submit" className="imgsend2 !py-2 !px-4 !text-xs">
              {t.save}
            </button>
          </form>

          <form onSubmit={handleSaveSiteConfig} className="addressp-box !mb-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                <LayoutTemplate className="w-4 h-4 text-[#557a16]" />
                <span>
                  {lang === 'ar'
                    ? 'إعدادات الشريط العلوي وشرائح الواجهة الرئيسية'
                    : 'Configuration du bandeau défilant & des diapositives'}
                </span>
              </h2>
              <span className="text-[11px] text-[#6b787e]">
                {lang === 'ar'
                  ? 'يدعم {{questionsCount}} لعرض عدد الأسئلة و **نص** للتمييز'
                  : 'Prend en charge {{questionsCount}} et **gras**'}
              </span>
            </div>

            <div className="flex flex-wrap gap-6 py-1">
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={supportEnabled}
                  onChange={(e) => setSupportEnabled(e.target.checked)}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'تفعيل مركز الدعم المباشر' : 'Support activé'}</span>
              </label>
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'وضع الصيانة' : 'Mode maintenance'}</span>
              </label>
            </div>

            {/* Ticker Messages Editor */}
            <div className="space-y-2.5 border-t border-[#efefef] pt-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#384D55]">
                  {lang === 'ar'
                    ? `رسائل الشريط الإخباري (${editTicker.length}/6)`
                    : `Messages du bandeau (${editTicker.length}/6)`}
                </h3>
                {editTicker.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditTicker((prev) => [
                        ...prev,
                        { id: `t-${Date.now()}`, text_ar: '', text_fr: '' },
                      ])
                    }
                    className="px-2.5 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#e2efbf] text-[#384D55] font-bold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إضافة رسالة' : 'Ajouter'}</span>
                  </button>
                )}
              </div>

              {editTicker.map((tk, idx) => (
                <div key={tk.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    required
                    value={tk.text_ar}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditTicker((prev) => prev.map((x, i) => (i === idx ? { ...x, text_ar: val } : x)));
                    }}
                    placeholder={lang === 'ar' ? `نص الرسالة ${idx + 1} بالعربية` : `Texte AR ${idx + 1}`}
                    className="template-input"
                  />
                  <input
                    value={tk.text_fr}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditTicker((prev) => prev.map((x, i) => (i === idx ? { ...x, text_fr: val } : x)));
                    }}
                    placeholder={lang === 'ar' ? `نص الرسالة ${idx + 1} بالفرنسية` : `Texte FR ${idx + 1}`}
                    className="template-input"
                  />
                  {editTicker.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setEditTicker((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Hero Slides Editor */}
            <div className="space-y-3 border-t border-[#efefef] pt-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#384D55]">
                  {lang === 'ar'
                    ? `شرائح الواجهة الرئيسية (${editSlides.length}/6)`
                    : `Diapositives d'accueil (${editSlides.length}/6)`}
                </h3>
                {editSlides.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditSlides((prev) => [
                        ...prev,
                        {
                          id: `s-${Date.now()}`,
                          tag_ar: '',
                          tag_fr: '',
                          title_ar: '',
                          title_fr: '',
                          desc_ar: '',
                          desc_fr: '',
                          cta1_ar: 'ابدأ الآن',
                          cta1_fr: 'Commencer',
                          cta1_view: 'exams',
                          cta1_exam_mode: 'mock',
                          cta2_ar: 'الدروس والمقررات',
                          cta2_fr: 'Leçons & Cours',
                          cta2_view: 'lessons',
                        },
                      ])
                    }
                    className="px-2.5 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#e2efbf] text-[#384D55] font-bold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إضافة شريحة' : 'Ajouter'}</span>
                  </button>
                )}
              </div>

              {editSlides.map((slide, idx) => (
                <div key={slide.id} className="border border-[#d8dfe2] rounded-[4px] p-3 bg-[#f7f9fa] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#384D55]">
                      {lang === 'ar' ? `الشريحة #${idx + 1}` : `Diapositive #${idx + 1}`}
                    </span>
                    {editSlides.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditSlides((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={slide.tag_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, tag_ar: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'الوسم العلوي بالعربية' : 'Badge (AR)'}
                      className="template-input"
                    />
                    <input
                      value={slide.tag_fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, tag_fr: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'الوسم العلوي بالفرنسية' : 'Badge (FR)'}
                      className="template-input"
                    />
                    <input
                      required
                      value={slide.title_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, title_ar: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'العنوان الرئيسي بالعربية' : 'Titre (AR)'}
                      className="template-input"
                    />
                    <input
                      value={slide.title_fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, title_fr: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'العنوان الرئيسي بالفرنسية' : 'Titre (FR)'}
                      className="template-input"
                    />
                    <textarea
                      rows={2}
                      value={slide.desc_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, desc_ar: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'الوصف بالعربية' : 'Description (AR)'}
                      className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-1.5 outline-none focus:border-[#A6CE39]"
                    />
                    <textarea
                      rows={2}
                      value={slide.desc_fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, desc_fr: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'الوصف بالفرنسية' : 'Description (FR)'}
                      className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-1.5 outline-none focus:border-[#A6CE39]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      required
                      value={slide.cta1_ar}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, cta1_ar: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'نص الزر الأول AR' : 'Bouton 1 AR'}
                      className="template-input"
                    />
                    <input
                      value={slide.cta1_fr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, cta1_fr: v } : s)));
                      }}
                      placeholder={lang === 'ar' ? 'نص الزر الأول FR' : 'Bouton 1 FR'}
                      className="template-input"
                    />
                    <select
                      value={slide.cta1_view}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditSlides((p) =>
                          p.map((s, i) =>
                            i === idx
                              ? {
                                  ...s,
                                  cta1_view: v,
                                  cta1_exam_mode: v === 'exams' ? s.cta1_exam_mode || 'official_sim' : undefined,
                                }
                              : s
                          )
                        );
                      }}
                      className="template-input text-xs"
                    >
                      <option value="exams">exams</option>
                      <option value="lessons">lessons</option>
                      <option value="summaries">summaries</option>
                      <option value="question-bank">question-bank</option>
                      <option value="review-center">review-center</option>
                      <option value="all-subjects">all-subjects</option>
                      <option value="dashboard">dashboard</option>
                      <option value="subscriptions">subscriptions</option>
                    </select>
                    {slide.cta1_view === 'exams' ? (
                      <select
                        value={slide.cta1_exam_mode || 'official_sim'}
                        onChange={(e) => {
                          const m = e.target.value as ExamMode;
                          setEditSlides((p) => p.map((s, i) => (i === idx ? { ...s, cta1_exam_mode: m } : s)));
                        }}
                        className="template-input text-xs"
                      >
                        <option value="official_sim">official_sim</option>
                        <option value="mock">mock</option>
                        <option value="placement">placement</option>
                      </select>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={savingSiteConfig}
              className="imgsend2 !py-2 !px-5 !text-xs disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {savingSiteConfig
                  ? lang === 'ar'
                    ? 'جاري الحفظ...'
                    : 'Enregistrement...'
                  : lang === 'ar'
                    ? 'حفظ إعدادات الواجهة والشريط'
                    : 'Enregistrer la configuration'}
              </span>
            </button>
          </form>

          {/* Pronunciation Dictionary Manager */}
          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#557a16]" />
                <span>
                  {lang === 'ar'
                    ? `قاموس النطق والتشكيل الصوتي (${pronRules.length})`
                    : `Dictionnaire de prononciation TTS (${pronRules.length})`}
                </span>
              </h2>
              <span className="text-[11px] text-[#6b787e]">
                {lang === 'ar'
                  ? 'يُطبّق داخل محرك القراءة الصوتية فقط دون إظهار أي حركات في الواجهة.'
                  : 'Appliqué uniquement au moteur vocal TTS sans altérer l’affichage écrit.'}
              </span>
            </div>

            <form onSubmit={handleCreatePronRule} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
              <input
                required
                value={pPattern}
                onChange={(e) => setPPattern(e.target.value)}
                placeholder={lang === 'ar' ? 'الكلمة أو النمط' : 'Mot / Motif'}
                className="template-input"
              />
              <input
                required
                value={pReplacement}
                onChange={(e) => setPReplacement(e.target.value)}
                placeholder={lang === 'ar' ? 'النطق البديل (مشكّل)' : 'Prononciation'}
                className="template-input"
              />
              <select
                value={pLang}
                onChange={(e) => setPLang(e.target.value as any)}
                className="template-input"
              >
                <option value="ar">ar</option>
                <option value="fr">fr</option>
                <option value="all">all</option>
              </select>
              <select
                value={pMatchType}
                onChange={(e) => setPMatchType(e.target.value as any)}
                className="template-input"
              >
                <option value="word">word</option>
                <option value="exact">exact</option>
                <option value="regex">regex</option>
              </select>
              <input
                value={pNotes}
                onChange={(e) => setPNotes(e.target.value)}
                placeholder={lang === 'ar' ? 'ملاحظات' : 'Notes'}
                className="template-input"
              />
              <button type="submit" disabled={busyAction} className="imgsend2 !py-1.5 !px-3 !text-xs">
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إضافة قاعدة' : 'Ajouter'}</span>
              </button>
            </form>

            {/* Quick Voice Test */}
            <div className="flex flex-wrap items-center gap-2 bg-[#f7f9fa] border border-[#d8dfe2] rounded-[3px] p-2.5">
              <input
                value={pTestText}
                onChange={(e) => setPTestText(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'اكتب جملة لاختبار القاموس مع الأصوات الثلاثة...'
                    : 'Tester une phrase avec le dictionnaire...'
                }
                className="template-input flex-1 min-w-[200px]"
              />
              <button
                type="button"
                onClick={() => {
                  const sample = pTestText.trim();
                  if (!sample) return;
                  speechEngine.speak(sample, lang, `admin-pron-test-${Date.now()}`);
                }}
                className="imgsend2-secondary !py-1.5 !px-3 !text-xs"
              >
                <Volume2 className="w-3.5 h-3.5 text-[#557a16]" />
                <span>{lang === 'ar' ? 'تجربة النطق' : 'Tester la voix'}</span>
              </button>
            </div>

            {pronRules.length > 0 && (
              <div className="max-h-60 overflow-y-auto divide-y divide-[#efefef] border border-[#efefef] rounded-[3px]">
                {pronRules.map((rule) => (
                  <div key={rule.id} className="p-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[#384D55]">{rule.pattern}</span>
                      <span className="text-[#6b787e]">←</span>
                      <span className="font-bold text-[#557a16]">{rule.replacement}</span>
                      <span className="px-1.5 py-0.5 rounded-[3px] bg-[#efefef] text-[10px] font-mono">
                        {rule.lang} · {rule.match_type}
                      </span>
                      {rule.notes && <span className="text-[11px] text-[#6b787e]">({rule.notes})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTogglePronRuleActive(rule)}
                        className={`px-2 py-0.5 rounded-[3px] text-[11px] font-bold cursor-pointer ${
                          rule.active
                            ? 'bg-[#e2efbf] text-[#384D55]'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {rule.active ? (lang === 'ar' ? 'مفعل' : 'Actif') : (lang === 'ar' ? 'معطل' : 'Inactif')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeletePronRule(rule.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ElevenLabs Studio HD Voice Integration (Secret-Safe Server Proxy) */}
          <form onSubmit={(e) => void handleSaveElevenLabsConfig(e, false)} className="addressp-box !mb-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#557a16]" />
                <span>
                  {lang === 'ar'
                    ? 'إعدادات الصوت فائق الجودة (ElevenLabs HD Studio TTS)'
                    : 'Configuration Audio HD ElevenLabs'}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-[3px] font-bold ${
                    elevenConfig.configured
                      ? 'bg-[#e2efbf] text-[#384D55]'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {elevenConfig.configured
                    ? `${lang === 'ar' ? 'متصل' : 'Configuré'} (${elevenConfig.source || 'env'}: ${elevenConfig.maskedHint || '••••'})`
                    : lang === 'ar'
                      ? 'المفتاح غير مضبوط'
                      : 'Clé non configurée'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 py-1">
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={elevenConfig.enabled}
                  onChange={(e) => setElevenConfig((p) => ({ ...p, enabled: e.target.checked }))}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'تفعيل محرك ElevenLabs HD' : 'Activer ElevenLabs HD'}</span>
              </label>
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={elevenConfig.freeTierAllowed}
                  onChange={(e) => setElevenConfig((p) => ({ ...p, freeTierAllowed: e.target.checked }))}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'السماح للباقة المجانية أيضاً' : 'Autoriser pour la formule gratuite'}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label className="block font-bold mb-1">Voice ID (AR)</label>
                <input
                  dir="ltr"
                  value={elevenConfig.voiceIdAr}
                  onChange={(e) => setElevenConfig((p) => ({ ...p, voiceIdAr: e.target.value }))}
                  className="template-input font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Voice ID (FR)</label>
                <input
                  dir="ltr"
                  value={elevenConfig.voiceIdFr}
                  onChange={(e) => setElevenConfig((p) => ({ ...p, voiceIdFr: e.target.value }))}
                  className="template-input font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Model ID</label>
                <input
                  dir="ltr"
                  value={elevenConfig.modelId || 'eleven_multilingual_v2'}
                  onChange={(e) => setElevenConfig((p) => ({ ...p, modelId: e.target.value }))}
                  className="template-input font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">
                  {lang === 'ar' ? 'تحديث مفتاح API (اختياري، سري)' : 'Nouvelle clé API (optionnel)'}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={elevenApiKeyInput}
                  onChange={(e) => setElevenApiKeyInput(e.target.value)}
                  placeholder={elevenConfig.maskedHint || 'sk_...'}
                  className="template-input font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={savingElevenLabs}
                className="imgsend2 !py-2 !px-5 !text-xs disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{lang === 'ar' ? 'حفظ إعدادات ElevenLabs' : 'Enregistrer ElevenLabs'}</span>
              </button>
              {elevenConfig.source === 'db' && (
                <button
                  type="button"
                  disabled={savingElevenLabs}
                  onClick={(e) => void handleSaveElevenLabsConfig(e, true)}
                  className="px-3 py-2 rounded-[3px] bg-red-50 border border-red-200 text-red-700 font-bold cursor-pointer text-xs"
                >
                  {lang === 'ar' ? 'حذف المفتاح المخزن' : 'Effacer la clé'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* TAB: BACCALAUREATE COEFFICIENTS MANAGER */}
      {activeTab === 'baccalaureate' && (
        <div className="space-y-5 text-xs">
          <form onSubmit={handleSaveBacCoeff} className="addressp-box !mb-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#557a16]" />
                <span>
                  {editingBacCoeffId
                    ? lang === 'ar'
                      ? 'تعديل معامل مادة بكالوريا'
                      : 'Modifier coefficient Bac'
                    : lang === 'ar'
                      ? 'إضافة / تحديث معامل مادة البكالوريا الموريتانية'
                      : 'Ajouter / Mettre à jour un coefficient Bac'}
                </span>
              </h2>
              {editingBacCoeffId && (
                <button type="button" onClick={resetBacCoeffForm} className="underline text-[#6b787e] cursor-pointer">
                  {t.cancel}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <select
                value={bacSeriesSlug}
                disabled={Boolean(editingBacCoeffId)}
                onChange={(e) => setBacSeriesSlug(e.target.value)}
                className="template-input text-xs"
              >
                {bacSeries.length > 0 ? (
                  bacSeries.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.code} — {lang === 'ar' ? s.name_ar : s.name_fr}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="SN">SN — العلوم الطبيعية</option>
                    <option value="LO">LO — الآداب الأصلية</option>
                    <option value="LM">LM — الآداب العصرية</option>
                    <option value="M">M — الرياضيات</option>
                  </>
                )}
              </select>
              <input
                required
                dir="ltr"
                disabled={Boolean(editingBacCoeffId)}
                value={bacSubjectSlug}
                onChange={(e) => setBacSubjectSlug(e.target.value)}
                placeholder="subject_slug"
                className="template-input font-mono"
              />
              <input
                required
                value={bacSubjectAr}
                onChange={(e) => setBacSubjectAr(e.target.value)}
                placeholder={lang === 'ar' ? 'اسم المادة بالعربية' : 'Matière (AR)'}
                className="template-input"
              />
              <input
                value={bacSubjectFr}
                onChange={(e) => setBacSubjectFr(e.target.value)}
                placeholder={lang === 'ar' ? 'اسم المادة بالفرنسية' : 'Matière (FR)'}
                className="template-input"
              />
              <input
                type="number"
                step="0.5"
                min={0.5}
                max={20}
                value={bacCoeffValue}
                onChange={(e) => setBacCoeffValue(Number(e.target.value))}
                placeholder={lang === 'ar' ? 'المعامل' : 'Coeff.'}
                className="template-input tabular-nums"
              />
              <input
                type="number"
                min={10}
                max={40}
                value={bacMaxGrade}
                onChange={(e) => setBacMaxGrade(Number(e.target.value))}
                placeholder="Max / 20"
                className="template-input tabular-nums"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={bacOptional}
                  onChange={(e) => setBacOptional(e.target.checked)}
                  className="accent-[#384D55]"
                />
                <span>{lang === 'ar' ? 'مادة اختيارية' : 'Matière optionnelle'}</span>
              </label>
              <button type="submit" disabled={busyAction} className="imgsend2 !py-2 !px-5 !text-xs">
                <Plus className="w-3.5 h-3.5" />
                <span>{editingBacCoeffId ? t.save : lang === 'ar' ? 'حفظ المعامل' : 'Enregistrer'}</span>
              </button>
            </div>
          </form>

          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="ltitle2 !mb-0">
                {lang === 'ar'
                  ? `جدول المعاملات (${bacCoeffs.filter((c) => bacFilterSeries === 'all' || c.series_slug === bacFilterSeries).length})`
                  : 'Table des coefficients'}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setBacFilterSeries('all')}
                  className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                    bacFilterSeries === 'all'
                      ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                      : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                  }`}
                >
                  {lang === 'ar' ? 'كل الشعب' : 'Toutes'}
                </button>
                {bacSeries.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setBacFilterSeries(s.slug)}
                    className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                      bacFilterSeries === s.slug
                        ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                        : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                    }`}
                  >
                    {s.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">{lang === 'ar' ? 'الشعبة' : 'Série'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'المادة' : 'Matière'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'المعامل' : 'Coefficient'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'النقطة القصوى' : 'Max'}</th>
                    <th className="p-2 text-start">{lang === 'ar' ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {bacCoeffs
                    .filter((c) => bacFilterSeries === 'all' || c.series_slug === bacFilterSeries)
                    .map((c) => (
                      <tr key={c.id}>
                        <td className="p-2 font-mono font-bold text-[#384D55]">{c.series_slug}</td>
                        <td className="p-2">
                          <div className="font-bold text-[#384D55]">{lang === 'ar' ? c.subject_name_ar : c.subject_name_fr}</div>
                          <div className="text-[10.5px] font-mono text-[#6b787e]" dir="ltr">
                            {c.subject_slug} {c.is_optional ? '(option)' : ''}
                          </div>
                        </td>
                        <td className="p-2 font-extrabold text-[#557a16] tabular-nums">{c.coefficient}</td>
                        <td className="p-2 tabular-nums">/{c.max_grade}</td>
                        <td className="p-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBacCoeffId(c.id);
                              setBacSeriesSlug(c.series_slug);
                              setBacSubjectSlug(c.subject_slug);
                              setBacSubjectAr(c.subject_name_ar);
                              setBacSubjectFr(c.subject_name_fr);
                              setBacCoeffValue(c.coefficient);
                              setBacMaxGrade(c.max_grade);
                              setBacOptional(Boolean(c.is_optional));
                            }}
                            className="p-1 text-[#384D55] hover:bg-[#e2efbf] rounded-[3px] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteBacCoeff(c.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded-[3px] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: BUG & ISSUE REPORTS TRIAGE */}
      {activeTab === 'reports' && (
        <div className="addressp-box !mb-0 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ltitle !mb-0 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>
                {lang === 'ar'
                  ? `بلاغات الأعطال والمحتوى من الطلاب (${adminReports.length})`
                  : `Signalements utilisateurs (${adminReports.length})`}
              </span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'open', 'in_review', 'resolved', 'closed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setReportStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                    reportStatusFilter === st
                      ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                      : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {adminReports.filter((r) => reportStatusFilter === 'all' || r.status === reportStatusFilter).length === 0 ? (
            <p className="text-[#6b787e]">{t.emptyState}</p>
          ) : (
            <div className="space-y-3">
              {adminReports
                .filter((r) => reportStatusFilter === 'all' || r.status === reportStatusFilter)
                .map((rep) => (
                  <div key={rep.id} className="border border-[#d8dfe2] rounded-[4px] bg-[#f7f9fa] p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-extrabold text-[#384D55]">#{rep.id}</span>
                        <span className="px-2 py-0.5 rounded-[3px] bg-white border border-[#cfd6da] font-bold">
                          {rep.report_type}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-[3px] font-bold ${
                            rep.status === 'resolved'
                              ? 'bg-[#e2efbf] text-[#384D55]'
                              : rep.status === 'open'
                                ? 'bg-red-100 text-red-800'
                                : rep.status === 'in_review'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {rep.status}
                        </span>
                        <span className="font-bold text-[#384D55]">{rep.reason}</span>
                      </div>
                      <span className="text-[11px] text-[#6b787e]" dir="ltr">
                        {rep.user_name || ''} ({rep.user_email || ''}) · {new Date(rep.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-[#384D55] leading-relaxed whitespace-pre-wrap">{rep.description}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        {rep.screenshot_data_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewReportShot(rep)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] bg-white border border-[#cfd6da] font-bold cursor-pointer"
                          >
                            <Image className="w-3.5 h-3.5 text-[#557a16]" />
                            <span>{lang === 'ar' ? 'عرض اللقطة المرفقة' : 'Voir capture'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (reportEditId === rep.id) {
                              setReportEditId(null);
                            } else {
                              setReportEditId(rep.id);
                              setReportStatusInput((rep.status as any) || 'in_review');
                              setReportActionInput(rep.admin_action || '');
                              setReportReplyInput(rep.admin_reply || '');
                            }
                          }}
                          className="imgsend2-secondary !py-1 !px-3 !text-xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'معالجة والرد' : 'Traiter / Répondre'}</span>
                        </button>
                      </div>
                      {rep.admin_reply && (
                        <div className="text-[11px] text-[#557a16] font-bold">
                          {lang === 'ar' ? 'رد الإدارة:' : 'Réponse :'} {rep.admin_reply}
                        </div>
                      )}
                    </div>

                    {reportEditId === rep.id && (
                      <div className="border-t border-[#d8dfe2] pt-2.5 space-y-2 bg-white p-3 rounded-[3px]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={reportStatusInput}
                            onChange={(e) => setReportStatusInput(e.target.value as any)}
                            className="template-input text-xs"
                          >
                            <option value="open">open</option>
                            <option value="in_review">in_review</option>
                            <option value="resolved">resolved</option>
                            <option value="closed">closed</option>
                          </select>
                          <input
                            value={reportActionInput}
                            onChange={(e) => setReportActionInput(e.target.value)}
                            placeholder={lang === 'ar' ? 'الإجراء المتخذ (اختياري)...' : 'Action prise...'}
                            className="template-input"
                          />
                        </div>
                        <textarea
                          rows={2}
                          value={reportReplyInput}
                          onChange={(e) => setReportReplyInput(e.target.value)}
                          placeholder={lang === 'ar' ? 'الرد على الطالب (سيصله في الإشعارات)...' : 'Réponse au candidat...'}
                          className="w-full border border-[#c9d0d3] rounded-[4px] px-3 py-1.5 outline-none focus:border-[#A6CE39]"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReportEditId(null)}
                            className="px-3 py-1.5 rounded-[3px] border border-[#cfd6da] cursor-pointer"
                          >
                            {t.cancel}
                          </button>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleSaveReportUpdate(rep.id)}
                            className="imgsend2 !py-1.5 !px-4 !text-xs"
                          >
                            {t.save}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: CONTACT US MESSAGES */}
      {activeTab === 'contact' && (
        <div className="addressp-box !mb-0 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ltitle !mb-0 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-[#557a16]" />
              <span>
                {tr(
                  lang,
                  `رسائل نموذج تواصل بنا (${contactMessages.length})`,
                  `Messages du formulaire Contact (${contactMessages.length})`,
                  `Contact Form Messages (${contactMessages.length})`
                )}
              </span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'unread', 'read', 'replied', 'archived'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setContactFilter(st)}
                  className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                    contactFilter === st
                      ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                      : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {contactMessages.filter((m) => contactFilter === 'all' || m.status === contactFilter).length === 0 ? (
            <p className="text-[#6b787e]">{t.emptyState}</p>
          ) : (
            <div className="space-y-3">
              {contactMessages
                .filter((m) => contactFilter === 'all' || m.status === contactFilter)
                .map((cm) => (
                  <div key={cm.id} className="border border-[#d8dfe2] rounded-[4px] bg-[#f7f9fa] p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-extrabold text-[#384D55]">#{cm.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded-[3px] font-bold ${
                            cm.status === 'unread'
                              ? 'bg-red-100 text-red-800'
                              : cm.status === 'replied'
                                ? 'bg-[#e2efbf] text-[#384D55]'
                                : cm.status === 'read'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {cm.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-[3px] bg-white border border-[#cfd6da] font-bold">
                          {cm.category}
                        </span>
                        <span className="font-extrabold text-[#384D55]">{cm.subject}</span>
                      </div>
                      <span className="text-[11px] text-[#6b787e]" dir="ltr">
                        {new Date(cm.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#5d6e75]">
                      <span>
                        <strong>{tr(lang, 'المرسل:', 'De :', 'From:')}</strong> {cm.name}
                      </span>
                      <span dir="ltr">{cm.email}</span>
                      {cm.phone && <span dir="ltr">{cm.phone}</span>}
                    </div>

                    <p className="text-[#384D55] leading-relaxed whitespace-pre-wrap">{cm.message}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (contactEditId === cm.id) {
                            setContactEditId(null);
                          } else {
                            setContactEditId(cm.id);
                            setContactStatusInput(
                              (['unread', 'read', 'replied', 'archived'].includes(cm.status)
                                ? cm.status
                                : 'read') as 'unread' | 'read' | 'replied' | 'archived'
                            );
                            setContactNoteInput(cm.admin_note || '');
                          }
                        }}
                        className="imgsend2-secondary !py-1 !px-3 !text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{tr(lang, 'تحديث الحالة وإضافة ملاحظة', 'Gérer / Note', 'Update & Note')}</span>
                      </button>

                      {cm.admin_note && (
                        <div className="text-[11px] text-[#557a16] font-bold">
                          {tr(lang, 'ملاحظة الإدارة:', 'Note :', 'Admin note:')} {cm.admin_note}
                        </div>
                      )}
                    </div>

                    {contactEditId === cm.id && (
                      <div className="border-t border-[#d8dfe2] pt-2.5 space-y-2 bg-white p-3 rounded-[3px]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={contactStatusInput}
                            onChange={(e) => setContactStatusInput(e.target.value as any)}
                            className="template-input text-xs"
                          >
                            <option value="unread">unread</option>
                            <option value="read">read</option>
                            <option value="replied">replied</option>
                            <option value="archived">archived</option>
                          </select>
                          <input
                            value={contactNoteInput}
                            onChange={(e) => setContactNoteInput(e.target.value)}
                            placeholder={tr(lang, 'ملاحظة إدارية داخلية أو ملخص الرد...', 'Note interne...', 'Internal admin note...')}
                            className="template-input sm:col-span-2"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setContactEditId(null)}
                            className="px-3 py-1.5 rounded-[3px] border border-[#cfd6da] cursor-pointer"
                          >
                            {t.cancel}
                          </button>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleSaveContactUpdate(cm.id)}
                            className="imgsend2 !py-1.5 !px-4 !text-xs"
                          >
                            {t.save}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: REFERRALS & POINTS PROGRAM */}
      {activeTab === 'referrals' && (
        <div className="space-y-5 text-xs">
          <form onSubmit={handleSaveReferralSettings} className="addressp-box !mb-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle !mb-0 flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-[#557a16]" />
                <span>
                  {tr(
                    lang,
                    'إعدادات برنامج الإحالات والنقاط',
                    'Configuration du programme de parrainage',
                    'Referral & Points Program Settings'
                  )}
                </span>
              </h2>
              <label className="inline-flex items-center gap-2 font-bold text-[#384D55] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(referralSettings.enabled)}
                  onChange={(e) =>
                    setReferralSettings((prev) => ({ ...prev, enabled: e.target.checked ? 1 : 0 }))
                  }
                  className="accent-[#384D55]"
                />
                <span>{tr(lang, 'تفعيل نظام الإحالات', 'Activer le parrainage', 'Enable Referrals')}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {tr(lang, 'النقاط لكل إحالة مؤكدة', 'Points / parrainage', 'Points / Referral')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={referralSettings.points_per_referral}
                  onChange={(e) =>
                    setReferralSettings((prev) => ({
                      ...prev,
                      points_per_referral: Number(e.target.value),
                    }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {tr(lang, 'حد النقاط للاستبدال', 'Seuil d’échange', 'Redeem Threshold')}
                </label>
                <input
                  type="number"
                  min={10}
                  max={10000}
                  value={referralSettings.reward_threshold_points}
                  onChange={(e) =>
                    setReferralSettings((prev) => ({
                      ...prev,
                      reward_threshold_points: Number(e.target.value),
                    }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {tr(lang, 'مدة المكافأة (أيام)', 'Durée (jours)', 'Reward Days')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={referralSettings.reward_duration_days}
                  onChange={(e) =>
                    setReferralSettings((prev) => ({
                      ...prev,
                      reward_duration_days: Number(e.target.value),
                    }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {tr(lang, 'نقاط ترحيبية للمدعو', 'Bonus bienvenue', 'Welcome Bonus')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={referralSettings.welcome_bonus_points}
                  onChange={(e) =>
                    setReferralSettings((prev) => ({
                      ...prev,
                      welcome_bonus_points: Number(e.target.value),
                    }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {tr(lang, 'الحد الأقصى للمكافآت/مستخدم', 'Max récompenses/compte', 'Max Rewards / User')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={referralSettings.max_rewards_per_user}
                  onChange={(e) =>
                    setReferralSettings((prev) => ({
                      ...prev,
                      max_rewards_per_user: Number(e.target.value),
                    }))
                  }
                  className="template-input tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={savingReferralSettings} className="imgsend2 !py-2 !px-5 !text-xs">
                {savingReferralSettings
                  ? t.loading
                  : tr(lang, 'حفظ إعدادات الإحالات', 'Enregistrer', 'Save Referral Settings')}
              </button>
            </div>
          </form>

          <div className="addressp-box !mb-0 overflow-x-auto space-y-3">
            <h3 className="ltitle2">
              {tr(
                lang,
                `سجل الدعوات والإحالات (${referralLogs.length})`,
                `Historique des parrainages (${referralLogs.length})`,
                `Referral Logs (${referralLogs.length})`
              )}
            </h3>
            {referralLogs.length === 0 ? (
              <p className="text-[#6b787e]">{t.emptyState}</p>
            ) : (
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">{tr(lang, 'الداعي', 'Parrain', 'Referrer')}</th>
                    <th className="p-2 text-start">{tr(lang, 'المدعو', 'Filleul', 'Referred')}</th>
                    <th className="p-2 text-start">{tr(lang, 'الكود', 'Code', 'Code')}</th>
                    <th className="p-2 text-start">{tr(lang, 'الحالة', 'Statut', 'Status')}</th>
                    <th className="p-2 text-start">{tr(lang, 'النقاط', 'Points', 'Points')}</th>
                    <th className="p-2 text-start">{tr(lang, 'التاريخ', 'Date', 'Date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {referralLogs.map((rl) => (
                    <tr key={rl.id}>
                      <td className="p-2">
                        <div className="font-bold text-[#384D55]">{rl.referrer_name || `#${rl.referrer_user_id}`}</div>
                        {rl.referrer_email && (
                          <div className="text-[10.5px] text-[#6b787e]" dir="ltr">
                            {rl.referrer_email}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="font-bold text-[#384D55]">{rl.referred_name || `#${rl.referred_user_id}`}</div>
                        {rl.referred_email && (
                          <div className="text-[10.5px] text-[#6b787e]" dir="ltr">
                            {rl.referred_email}
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-mono font-bold text-[#384D55]" dir="ltr">
                        {rl.referral_code}
                      </td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 rounded-[3px] font-bold ${
                            rl.status === 'verified_rewarded'
                              ? 'bg-[#e2efbf] text-[#1c2a0e]'
                              : rl.status === 'pending_verification'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {rl.status}
                        </span>
                      </td>
                      <td className="p-2 font-extrabold tabular-nums text-[#557a16]">{rl.points_awarded}</td>
                      <td className="p-2 text-[#6b787e] tabular-nums" dir="ltr">
                        {new Date(rl.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="addressp-box !mb-0 overflow-x-auto space-y-3">
            <h3 className="ltitle2">
              {tr(
                lang,
                `سجل استبدال المكافآت (${referralRewards.length})`,
                `Récompenses échangées (${referralRewards.length})`,
                `Redeemed Rewards (${referralRewards.length})`
              )}
            </h3>
            {referralRewards.length === 0 ? (
              <p className="text-[#6b787e]">{t.emptyState}</p>
            ) : (
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">{tr(lang, 'المستفيد', 'Utilisateur', 'User')}</th>
                    <th className="p-2 text-start">{tr(lang, 'النقاط المستبدلة', 'Points dépensés', 'Points Spent')}</th>
                    <th className="p-2 text-start">{tr(lang, 'المدة', 'Durée', 'Duration')}</th>
                    <th className="p-2 text-start">{tr(lang, 'الباقة', 'Offre', 'Plan')}</th>
                    <th className="p-2 text-start">{tr(lang, 'التاريخ', 'Date', 'Date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {referralRewards.map((rw) => (
                    <tr key={rw.id}>
                      <td className="p-2">
                        <div className="font-bold text-[#384D55]">{rw.user_name || `#${rw.user_id}`}</div>
                        {rw.user_email && (
                          <div className="text-[10.5px] text-[#6b787e]" dir="ltr">
                            {rw.user_email}
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-extrabold tabular-nums text-[#384D55]">{rw.points_spent}</td>
                      <td className="p-2 tabular-nums">
                        {rw.duration_days} {tr(lang, 'يوماً', 'jours', 'days')}
                      </td>
                      <td className="p-2 font-mono">{rw.plan_slug}</td>
                      <td className="p-2 text-[#6b787e] tabular-nums" dir="ltr">
                        {new Date(rw.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB: ANALYTICS & INTRO VIDEO */}
      {activeTab === 'analytics' && (
        <div className="space-y-5 text-xs">
          <div className="addressp-box !mb-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ltitle flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-[#557a16]" />
                <span>
                  {tr(
                    lang,
                    'إحصائيات الزيارات والتصفح والنقرات',
                    'Analytiques du site (visites, vues, clics)',
                    'Site Analytics (Visits, Page Views & Clicks)'
                  )}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => void loadAllAdminData()}
                className="imgsend2-secondary !py-1.5 !px-3 !text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{tr(lang, 'تحديث', 'Actualiser', 'Refresh')}</span>
              </button>
            </div>

            {!analyticsData ? (
              <p className="text-[#6b787e]">{t.loading}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    {
                      label: tr(lang, 'زيارات اليوم', "Visites d'aujourd'hui", 'Daily Visits'),
                      val: analyticsData.site.dailyVisits,
                    },
                    {
                      label: tr(lang, 'زيارات الأسبوع', 'Visites hebdo', 'Weekly Visits'),
                      val: analyticsData.site.weeklyVisits,
                    },
                    {
                      label: tr(lang, 'زيارات الشهر', 'Visites mensuelles', 'Monthly Visits'),
                      val: analyticsData.site.monthlyVisits,
                    },
                    {
                      label: tr(lang, 'مشاهدات الصفحات', 'Pages vues', 'Total Page Views'),
                      val: analyticsData.site.totalPageViews,
                    },
                    {
                      label: tr(lang, 'إجمالي النقرات', 'Clics totaux', 'Total Clicks'),
                      val: analyticsData.site.totalClicks,
                    },
                  ].map((stat, i) => (
                    <div key={i} className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[4px] p-3">
                      <div className="text-[11px] text-[#6b787e] font-bold">{stat.label}</div>
                      <div className="text-xl font-black text-[#384D55] tabular-nums mt-1">{stat.val}</div>
                    </div>
                  ))}
                </div>

                {analyticsData.site.topPages.length > 0 && (
                  <div>
                    <h3 className="ltitle2 mb-2">
                      {tr(lang, 'أكثر الصفحات زيارة', 'Pages les plus consultées', 'Top Visited Pages')}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {analyticsData.site.topPages.map((tp) => (
                        <div
                          key={tp.page}
                          className="flex items-center justify-between bg-[#f7f9fa] border border-[#d8dfe2] rounded-[3px] px-3 py-2"
                        >
                          <span className="font-mono font-bold text-[#384D55]" dir="ltr">
                            {tp.page}
                          </span>
                          <span className="font-extrabold text-[#557a16] tabular-nums">{tp.views}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {analyticsData && (
            <div className="addressp-box !mb-0 space-y-4">
              <h2 className="ltitle flex items-center gap-1.5">
                <Film className="w-4 h-4 text-[#557a16]" />
                <span>
                  {tr(
                    lang,
                    'إحصائيات الفيديو التعريفي للمنصة (4K)',
                    'Télémétrie de la vidéo de présentation',
                    'Platform Intro Video Telemetry'
                  )}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: tr(lang, 'مرات الظهور', 'Impressions', 'Impressions'), val: analyticsData.introVideo.impressions },
                  { label: tr(lang, 'النقرات', 'Clics', 'Clicks'), val: analyticsData.introVideo.clicks },
                  { label: tr(lang, 'التشغيل', 'Lectures', 'Plays'), val: analyticsData.introVideo.plays },
                  { label: tr(lang, 'الإيقاف المؤقت', 'Pauses', 'Pauses'), val: analyticsData.introVideo.pauses },
                  { label: tr(lang, 'الاستئناف', 'Reprises', 'Resumes'), val: analyticsData.introVideo.resumes },
                  { label: tr(lang, 'تفعيل الصوت', 'Sons activés', 'Unmutes'), val: analyticsData.introVideo.unmutes },
                  { label: tr(lang, 'إكمال الفيديو', 'Complétions', 'Completions'), val: analyticsData.introVideo.completions },
                  { label: tr(lang, 'مشاهدون فريدون', 'Spectateurs uniques', 'Unique Watchers'), val: analyticsData.introVideo.uniqueWatchers },
                  {
                    label: tr(lang, 'مجموع المشاهدة (ث)', 'Durée totale (s)', 'Total Watch (s)'),
                    val: Math.round(analyticsData.introVideo.totalWatchSeconds || 0),
                  },
                  {
                    label: tr(lang, 'متوسط نسبة المشاهدة', 'Taux moyen (%)', 'Avg Watch %'),
                    val: `${Math.round(analyticsData.introVideo.avgWatchPercent || 0)}%`,
                  },
                ].map((vStat, idx) => (
                  <div key={idx} className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[4px] p-3">
                    <div className="text-[11px] text-[#6b787e] font-bold">{vStat.label}</div>
                    <div className="text-xl font-black text-[#1a4430] tabular-nums mt-1">{vStat.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: SECURITY & RISK LOG */}
      {activeTab === 'security' && (
        <div className="addressp-box !mb-0 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ltitle flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>
                {tr(
                  lang,
                  'سجل المخالفات ومحاولات التلاعب في الإيصالات',
                  'Journal de sécurité et risques de fraude',
                  'Security Events & Receipt Fraud Log'
                )}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'fraud_rejected', 'suspicious', 'warning', 'normal'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSecurityRiskFilter(lvl)}
                  className={`px-2.5 py-1 rounded-[3px] border font-bold cursor-pointer ${
                    securityRiskFilter === lvl
                      ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                      : 'bg-[#efefef] text-[#384D55] border-[#d8dfe2]'
                  }`}
                >
                  {lvl === 'all' ? tr(lang, 'الكل', 'Tous', 'All') : lvl}
                </button>
              ))}
            </div>
          </div>

          {securityEvents.filter((e) => securityRiskFilter === 'all' || e.risk_level === securityRiskFilter).length ===
          0 ? (
            <div className="p-4 bg-[#f7f9fa] border border-[#d8dfe2] rounded-[4px] text-[#6b787e] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#557a16]" />
              <span>{tr(lang, 'لا توجد أحداث أمنية مطابقة للتصفية الحالية.', 'Aucun événement de sécurité.', 'No matching security events.')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                    <th className="p-2 text-start">{tr(lang, 'المستوى', 'Niveau', 'Risk')}</th>
                    <th className="p-2 text-start">{tr(lang, 'المستخدم', 'Utilisateur', 'User')}</th>
                    <th className="p-2 text-start">{tr(lang, 'الهاتف والوسيلة', 'Téléphone & Moyen', 'Phone & Method')}</th>
                    <th className="p-2 text-start">{tr(lang, 'نوع الحدث', 'Activité', 'Activity')}</th>
                    <th className="p-2 text-start">{tr(lang, 'السبب والتفاصيل', 'Motif & Détails', 'Reason & Details')}</th>
                    <th className="p-2 text-start">{tr(lang, 'التاريخ', 'Date', 'Date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {securityEvents
                    .filter((e) => securityRiskFilter === 'all' || e.risk_level === securityRiskFilter)
                    .map((ev) => (
                      <tr key={ev.id}>
                        <td className="p-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-[3px] font-extrabold ${
                              ev.risk_level === 'fraud_rejected'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : ev.risk_level === 'suspicious'
                                  ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                  : ev.risk_level === 'warning'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-[#e2efbf] text-[#1c2a0e]'
                            }`}
                          >
                            {ev.risk_level}
                          </span>
                        </td>
                        <td className="p-2">
                          <div className="font-bold text-[#384D55]">{ev.user_name || ev.uid || `#${ev.user_id}`}</div>
                          {ev.user_email && (
                            <div className="text-[11px] text-[#6b787e]" dir="ltr">
                              {ev.user_email}
                            </div>
                          )}
                          {ev.uid && (
                            <div className="text-[10px] font-mono text-[#6b787e]" dir="ltr">
                              UID: {ev.uid.slice(0, 12)}...
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="font-mono font-bold text-[#384D55]" dir="ltr">
                            {ev.sender_phone || '—'}
                          </div>
                          <div className="uppercase text-[11px] text-[#6b787e]">{ev.payment_method || '—'}</div>
                          {ev.linked_request_id && (
                            <div className="text-[10px] font-mono text-[#557a16]" dir="ltr">
                              {ev.linked_request_id}
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-mono font-bold text-[#384D55]">{ev.activity_type}</td>
                        <td className="p-2 max-w-[300px]">
                          <div className="font-bold text-[#384D55]">{ev.reason || '—'}</div>
                          {ev.details_json && (
                            <div className="text-[10.5px] text-[#6b787e] truncate" title={ev.details_json}>
                              {ev.details_json}
                            </div>
                          )}
                        </td>
                        <td className="p-2 tabular-nums text-[#6b787e]" dir="ltr">
                          {new Date(ev.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="addressp-box !mb-0 overflow-x-auto text-xs">
          <h2 className="ltitle flex items-center gap-1.5">
            <History className="w-4 h-4 text-[#557a16]" />
            <span>{tr(lang, 'سجل التدقيق والعمليات الإدارية', "Journal d'audit Firestore", 'Firestore Audit Logs')}</span>
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-[#6b787e]">{t.emptyState}</p>
          ) : (
            <table className="w-full text-start">
              <thead>
                <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2]">
                  <th className="p-2 text-start">Actor</th>
                  <th className="p-2 text-start">Action</th>
                  <th className="p-2 text-start">Target</th>
                  <th className="p-2 text-start">Details</th>
                  <th className="p-2 text-start">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefef]">
                {auditLogs.map((l, idx) => (
                  <tr key={l.firestoreId || idx}>
                    <td className="p-2" dir="ltr">
                      {l.actor_email}
                    </td>
                    <td className="p-2 font-bold">{l.action}</td>
                    <td className="p-2">
                      {l.target_type} #{l.target_id}
                    </td>
                    <td className="p-2 text-[#6b787e]">{l.details}</td>
                    <td className="p-2 tabular-nums text-[#6b787e]">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: BACKUP */}
      {activeTab === 'backup' && (
        <div className="addressp-box !mb-0 space-y-4 text-xs">
          <h2 className="ltitle flex items-center gap-1.5">
            <Database className="w-4 h-4 text-[#557a16]" />
            <span>{tr(lang, 'النسخ الاحتياطي الكامل لقاعدة البيانات', 'Sauvegarde complète JSON', 'Full JSON Database Backup')}</span>
          </h2>
          <p className="text-[#6b787e]">
            {tr(
              lang,
              'قم بتصدير بيانات Firestore وبنك الأسئلة وإعدادات الاختبار في ملف JSON موثق.',
              'Exportez toutes les données pédagogiques (Firestore + banque de questions) au format JSON.',
              'Export all Firestore data, question bank, and exam configurations as JSON.'
            )}
          </p>
          <button
            type="button"
            onClick={() => void handleDownloadBackup()}
            className="imgsend2 !py-2.5 !px-5 !text-xs"
          >
            <Download className="w-4 h-4" />
            <span>{tr(lang, 'تنزيل نسخة احتياطية الآن', 'Télécharger la sauvegarde JSON', 'Download JSON Backup Now')}</span>
          </button>
        </div>
      )}

      {/* Receipt Proof Screenshot Modal */}
      {previewProofReq && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2217]/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#c9d0d3] rounded-[6px] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#efefef] pb-2">
              <div className="font-extrabold text-[#384D55]">
                {lang === 'ar' ? 'إيصال الدفع للطلب:' : 'Justificatif :'}{' '}
                <span className="font-mono" dir="ltr">
                  {previewProofReq.subscription_request_id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProofReq(null)}
                className="p-1 text-[#6b787e] hover:text-[#384D55] cursor-pointer"
                aria-label={t.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#f7f9fa] border border-[#d8dfe2] rounded-[3px] p-2.5">
              <div>
                <div className="text-[#6b787e]">{lang === 'ar' ? 'الطالب' : 'Candidat'}</div>
                <div className="font-bold">{previewProofReq.user_name}</div>
              </div>
              <div>
                <div className="text-[#6b787e]">{lang === 'ar' ? 'المبلغ المطلوب / المدفوع' : 'Requis / Payé'}</div>
                <div className="font-extrabold text-[#557a16]">
                  {previewProofReq.amount} / {previewProofReq.paid_amount ?? previewProofReq.amount}{' '}
                  {previewProofReq.currency}
                </div>
              </div>
              <div>
                <div className="text-[#6b787e]">{lang === 'ar' ? 'رقم العملية' : 'ID Transaction'}</div>
                <div className="font-mono font-bold" dir="ltr">
                  {previewProofReq.transaction_id || '—'}
                  {previewProofReq.second_transaction_id ? ` (+ ${previewProofReq.second_transaction_id})` : ''}
                </div>
              </div>
              <div>
                <div className="text-[#6b787e]">{lang === 'ar' ? 'مرجع المعاملة' : 'Référence'}</div>
                <div className="font-mono font-bold" dir="ltr">
                  {previewProofReq.transaction_reference || '—'}
                </div>
              </div>
            </div>

            {previewProofReq.proof_data_url && (
              <div className="border border-[#d8dfe2] rounded-[4px] bg-[#f4f6f7] p-2 space-y-1 text-center">
                <div className="text-[11px] font-bold text-[#6b787e]">
                  {lang === 'ar' ? 'الإيصال الأساسي:' : 'Reçu principal :'}
                </div>
                <img
                  src={previewProofReq.proof_data_url}
                  alt={previewProofReq.subscription_request_id}
                  className="max-h-[380px] mx-auto w-auto object-contain rounded-[3px]"
                />
              </div>
            )}

            {previewProofReq.second_proof_data_url && (
              <div className="border border-[#A6CE39] rounded-[4px] bg-[#e2efbf]/30 p-2 space-y-1 text-center">
                <div className="text-[11px] font-bold text-[#1a4430]">
                  {lang === 'ar' ? 'الإيصال المكمّل للباقي:' : 'Justificatif complémentaire :'}
                </div>
                <img
                  src={previewProofReq.second_proof_data_url}
                  alt={`${previewProofReq.subscription_request_id}-2`}
                  className="max-h-[380px] mx-auto w-auto object-contain rounded-[3px]"
                />
              </div>
            )}

            {['pending_review', 'manual_review', 'partial_pending', 'needs_info'].includes(previewProofReq.status) && (
              <div className="space-y-2 pt-2 border-t border-[#efefef]">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input
                    type="text"
                    value={rejectReasonInput}
                    onChange={(e) => setRejectReasonInput(e.target.value)}
                    placeholder={lang === 'ar' ? 'سبب الرفض (عند الرفض)...' : 'Motif de refus...'}
                    className="template-input flex-1 min-w-[180px]"
                  />
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleRejectPaymentRequest(previewProofReq)}
                    className="px-3 py-2 rounded-[3px] bg-red-600 text-white font-bold cursor-pointer"
                  >
                    {lang === 'ar' ? 'رفض الطلب' : 'Refuser'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() =>
                      void handleApprovePaymentRequest(
                        previewProofReq,
                        (previewProofReq.paid_amount ?? previewProofReq.amount) + 0.01 < previewProofReq.amount
                      )
                    }
                    className="imgsend2 !py-2 !px-4 !text-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {(previewProofReq.paid_amount ?? previewProofReq.amount) + 0.01 < previewProofReq.amount
                        ? lang === 'ar'
                          ? 'اعتماد يدوي وتفعيل'
                          : 'Approuver (manuel)'
                        : lang === 'ar'
                          ? 'اعتماد وتفعيل الاشتراك'
                          : 'Approuver & activer'}
                    </span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={clarifyNoteInput}
                    onChange={(e) => setClarifyNoteInput(e.target.value)}
                    placeholder={lang === 'ar' ? 'أو أرسل طلب توضيح للطالب...' : 'Ou demander un complément...'}
                    className="template-input flex-1 min-w-[180px]"
                  />
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleRequestInfoPaymentRequest(previewProofReq)}
                    className="px-3 py-2 rounded-[3px] bg-blue-600 text-white font-bold cursor-pointer"
                  >
                    {lang === 'ar' ? 'إرسال طلب توضيح' : 'Demander précision'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report Screenshot Preview Modal */}
      {previewReportShot && previewReportShot.screenshot_data_url && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2217]/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#c9d0d3] rounded-[6px] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#efefef] pb-2">
              <div className="font-extrabold text-[#384D55]">
                {lang === 'ar' ? `صورة البلاغ #${previewReportShot.id}` : `Capture #${previewReportShot.id}`}
              </div>
              <button
                type="button"
                onClick={() => setPreviewReportShot(null)}
                className="p-1 text-[#6b787e] hover:text-[#384D55] cursor-pointer"
                aria-label={t.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewReportShot.screenshot_data_url}
              alt={`Report #${previewReportShot.id}`}
              className="max-h-[520px] mx-auto w-auto object-contain rounded-[3px]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
