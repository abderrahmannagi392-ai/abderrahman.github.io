export type Language = 'ar' | 'fr' | 'en';
export type TrackSlug = 'arabic' | 'french' | 'bilingual' | 'all';
export type LevelSlug =
  | 'foundation'
  | 'intermediate'
  | 'advanced'
  | 'prep_student'
  | 'highschool_student'
  | 'university_student'
  | 'teacher'
  | 'professor';
export type UserRole = 'admin' | 'editor' | 'teacher' | 'student';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ExamMode = 'mock' | 'official_sim' | 'placement';

export type AdminPermission =
  | 'dashboard'
  | 'users'
  | 'students'
  | 'teachers'
  | 'professors'
  | 'schools'
  | 'departments'
  | 'lessons'
  | 'questions'
  | 'exams'
  | 'baccalaureate'
  | 'subscriptions'
  | 'payments'
  | 'receipts'
  | 'transactions'
  | 'notifications'
  | 'verification'
  | 'reports'
  | 'content'
  | 'files'
  | 'administrators'
  | 'permissions'
  | 'audit_logs'
  | 'settings';

export type BillingCycle = 'free' | 'monthly' | 'quarterly' | 'season' | 'annual';

export interface ActiveSubscriptionSummary {
  id: number;
  firestoreId?: string;
  plan_id: number;
  planFirestoreId?: string;
  plan_slug: string;
  name_ar: string;
  name_fr: string;
  billing_cycle: BillingCycle;
  status: 'active' | 'expired' | 'pending' | 'cancelled';
  starts_at: string;
  expires_at: string | null;
}

export interface User {
  id: number;
  uid: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  email_verified?: number | boolean;
  isAdmin?: boolean;
  permissions?: AdminPermission[];
  canCopy?: boolean;
  disabled?: boolean;
  role: UserRole;
  track: 'arabic' | 'french' | 'bilingual';
  preferred_lang: Language;
  level: LevelSlug;
  teacher_category?: 'bilingual' | 'arabic' | 'french' | '' | null;
  professor_specialty?: string | null;
  verified_account?: number | boolean;
  verified_badge_label?: string | null;
  followers_count?: number;
  following_count?: number;
  notification_sound_enabled?: number | boolean;
  last_login_at?: string | null;
  profileCompleted?: boolean;
  authProvider?: string;
  acceptedTermsAt?: string | null;
  acceptedPrivacyAt?: string | null;
  phone?: string;
  wilaya?: string;
  city?: string;
  institution?: string;
  referral_code?: string;
  referral_points?: number;
  geo_permission_status?: 'prompt' | 'granted' | 'denied' | string;
  last_geo_lat?: number | null;
  last_geo_lng?: number | null;
  last_geo_label?: string | null;
  last_geo_is_approx?: boolean | number;
  last_geo_updated_at?: string | null;
  notification_permission_status?: 'default' | 'granted' | 'denied' | string;
  last_profile_updated_at?: string | null;
  last_password_updated_at?: string | null;
  last_active_at?: string | null;
  created_at: string;
  activeSubscription?: ActiveSubscriptionSummary | null;
  latestExpiredSubscription?: ActiveSubscriptionSummary | null;
}

export interface Track {
  id: number;
  slug: string;
  name_ar: string;
  name_fr: string;
  description_ar: string;
  description_fr: string;
  active: number;
}

export interface Subject {
  id: number;
  firestoreId?: string;
  slug: string;
  name_ar: string;
  name_fr: string;
  tracks: string[];
  official_program_ref: string;
  icon_name: string;
  display_order: number;
}

export interface LessonSection {
  id: string;
  titleAr: string;
  titleFr: string;
  descriptionAr: string;
  descriptionFr: string;
  subjectSlug: string;
  track: TrackSlug;
  level: LevelSlug;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonExample {
  title_ar: string;
  title_fr: string;
  content_ar: string;
  content_fr: string;
}

export interface LessonExercise {
  prompt_ar: string;
  prompt_fr: string;
  solution_ar: string;
  solution_fr: string;
}

export interface LessonMcq {
  stem_ar: string;
  stem_speech_ar: string;
  stem_fr: string;
  options_ar: string[];
  options_fr: string[];
  correct_index: number;
  explanation_ar: string;
  explanation_speech_ar: string;
  explanation_fr: string;
}

export interface Lesson {
  id: number;
  firestoreId?: string;
  sectionId?: string | null;
  subject_slug: string;
  series_slugs?: string[];
  track: TrackSlug;
  level: LevelSlug;
  title_ar: string;
  title_fr: string;
  summary_ar: string;
  summary_fr: string;
  explanation_ar: string;
  explanation_speech_ar: string;
  explanation_fr: string;
  examples: LessonExample[];
  exercises: LessonExercise[];
  mcq: LessonMcq[];
  lesson_order?: number;
  is_free?: boolean;
  is_starter_free?: boolean;
  active?: boolean;
  completed?: boolean;
  is_favorite?: boolean;
  created_at: string;
}

export interface SummaryItem {
  id: number;
  subject_slug: string;
  track: TrackSlug;
  level: LevelSlug;
  title_ar: string;
  title_fr: string;
  content_ar: string;
  content_speech_ar: string;
  content_fr: string;
  key_points: { ar: string; fr: string }[];
  file_url?: string;
  created_at: string;
}

export interface Question {
  id: number;
  subject_slug: string;
  track: TrackSlug;
  level: LevelSlug;
  axis_ar?: string;
  axis_fr?: string;
  lesson_id?: number | null;
  topic_ar: string;
  topic_fr: string;
  skill_ar: string;
  skill_fr: string;
  question_type?: 'mcq' | 'true_false' | 'short_answer' | 'essay' | string;
  difficulty: Difficulty;
  stem_ar: string;
  stem_speech_ar: string;
  stem_fr: string;
  options_ar: string[];
  options_speech_ar: string[];
  options_fr: string[];
  correct_index?: number;
  answer_ar?: string;
  answer_speech_ar?: string;
  answer_fr?: string;
  explanation_ar?: string;
  explanation_speech_ar?: string;
  explanation_fr?: string;
  exam_ref?: string;
  target_competition?: string;
  content_status?: 'draft' | 'review' | 'approved' | 'published' | 'archived';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  verified: number;
  seen_before?: boolean;
}

export interface ExamConfig {
  id: number;
  title_ar: string;
  title_fr: string;
  mode: ExamMode;
  track: TrackSlug;
  subject_slug: string;
  level: string;
  question_count: number;
  duration_minutes: number;
  max_score: number;
  require_camera_check: number;
  is_active: number;
  available_unique_questions?: number;
  is_official_complete?: boolean;
}

export interface TopicStat {
  topic_ar: string;
  topic_fr: string;
  subject_slug: string;
  total: number;
  correct: number;
  percentage: number;
}

export interface SubjectStat {
  subject_slug: string;
  total: number;
  correct: number;
  percentage: number;
}

export interface ExamAttempt {
  id: number;
  user_id: number;
  config_id: number;
  title_ar?: string;
  title_fr?: string;
  mode: ExamMode;
  track: string;
  subject_slug: string;
  level: string;
  question_ids: number[];
  answers: Record<string, number>;
  flagged?: number[];
  started_at: string;
  submitted_at?: string;
  time_spent_seconds: number;
  duration_minutes: number;
  status: 'in_progress' | 'submitted';
  score_20?: number;
  correct_count?: number;
  wrong_count?: number;
  unanswered_count?: number;
  percentage?: number;
  topic_breakdown?: TopicStat[];
  subject_breakdown?: SubjectStat[];
  camera_checked: number;
  camera_photo_data_url?: string | null;
  device_mode: string;
}

export type NotificationTargetScope =
  | 'current_users'
  | 'conditional'
  | 'specific_users'
  | 'all_including_future';

export interface NotificationItem {
  id: number;
  firestoreId?: string;
  user_id: number | null;
  title_ar: string;
  title_fr: string;
  body_ar: string;
  body_fr: string;
  type: 'info' | 'exam' | 'alert' | 'offer';
  targetScope?: NotificationTargetScope;
  targetTrack?: TrackSlug;
  targetLevel?: 'all' | LevelSlug;
  targetSubscription?: 'all' | 'paid' | 'free';
  targetUserIds?: string[];
  eligibleBeforeMs?: number | null;
  createdAtMs?: number;
  is_read: number;
  created_at: string;
}

export interface SupportTicket {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  admin_reply: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  uid: string;
  userName: string;
  userEmail: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  lastMessagePreview: string;
  lastSenderRole: 'user' | 'admin';
  unreadForUser: number;
  unreadForAdmin: number;
  createdAt: string;
  updatedAt: string;
  updatedAtMs: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  conversationOwnerUid: string;
  senderUid: string;
  senderName: string;
  senderRole: 'user' | 'admin';
  text: string;
  createdAt: string;
  createdAtMs: number;
}

export interface AuditLog {
  id: number;
  firestoreId?: string;
  actor_id: number | null;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface SubscriptionPlan {
  id: number;
  firestoreId?: string;
  slug: string;
  name_ar: string;
  name_fr: string;
  description_ar: string;
  description_fr: string;
  price_mru: number;
  price_eur: number;
  currency: string;
  duration_days: number;
  billing_cycle: BillingCycle;
  features_ar: string[];
  features_fr: string[];
  is_popular: number;
  active: number;
  display_order: number;
}

export interface UserSubscription {
  id: number;
  firestoreId?: string;
  uid?: string;
  user_id: number;
  plan_id: number;
  planFirestoreId?: string;
  plan_slug?: string;
  name_ar?: string;
  name_fr?: string;
  billing_cycle?: string;
  status: 'active' | 'expired' | 'pending' | 'cancelled';
  starts_at: string;
  expires_at: string | null;
  payment_tx_id: number | null;
  orderId?: string | null;
  created_at: string;
}

export interface PaymentTransaction {
  id: number;
  firestoreId?: string;
  uid?: string;
  user_id: number;
  user_email?: string;
  user_name?: string;
  plan_id: number;
  planFirestoreId?: string;
  plan_name_ar?: string;
  plan_name_fr?: string;
  amount_mru: number;
  amount_eur: number;
  currency: string;
  card_brand: 'visa' | 'mastercard' | 'nardopay' | 'card' | string;
  card_last4: string;
  card_exp_month: number;
  card_exp_year: number;
  cardholder_name: string;
  phone?: string;
  wilaya?: string;
  city?: string;
  provider: string;
  provider_tx_id: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  failure_reason?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  verify_sig?: string;
  verify_url?: string;
  created_at: string;
}

export interface TickerMessage {
  id: string;
  text_ar: string;
  text_fr: string;
}

export interface HeroSlide {
  id: string;
  tag_ar: string;
  tag_fr: string;
  title_ar: string;
  title_fr: string;
  desc_ar: string;
  desc_fr: string;
  cta1_ar: string;
  cta1_fr: string;
  cta1_view: string;
  cta1_exam_mode?: ExamMode;
  cta2_ar: string;
  cta2_fr: string;
  cta2_view: string;
  cta2_exam_mode?: ExamMode;
}

export interface SiteConfig {
  tickerMessages: TickerMessage[];
  heroSlides: HeroSlide[];
  supportEnabled?: boolean;
  maintenanceMode?: boolean;
}

export interface PaymentMethodConfig {
  code: string;
  name_ar: string;
  name_fr: string;
  beneficiary_name: string;
  account_number: string;
  instructions_ar: string;
  instructions_fr: string;
  requires_receipt: number;
  active: number;
  display_order: number;
  updated_at?: string;
}

export type SubscriptionRequestStatus =
  | 'pending_review'
  | 'manual_review'
  | 'partial_pending'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'expired';

export interface SubscriptionRequest {
  id: number;
  subscription_request_id: string;
  user_id: number;
  user_name?: string;
  user_email?: string;
  plan_id: number;
  plan_slug: string;
  plan_name: string;
  amount: number;
  paid_amount?: number;
  remaining_amount?: number;
  currency: string;
  payment_method: string;
  beneficiary_name: string;
  transaction_reference: string;
  transaction_id: string;
  transaction_at: string;
  proof_data_url?: string;
  proof_hash?: string;
  sender_phone?: string;
  extracted_amount?: number | null;
  extracted_currency?: string;
  extraction_confidence?: number;
  risk_level?: 'normal' | 'warning' | 'suspicious' | 'fraud_rejected' | string;
  inspection_status?: string;
  uploaded_at: string;
  second_payment_method?: string | null;
  second_transaction_id?: string | null;
  second_transaction_reference?: string | null;
  second_transaction_at?: string | null;
  second_proof_data_url?: string | null;
  second_proof_hash?: string | null;
  second_sender_phone?: string | null;
  second_extracted_amount?: number | null;
  second_uploaded_at?: string | null;
  admin_clarification_note?: string | null;
  clarification_requested_at?: string | null;
  status: SubscriptionRequestStatus;
  rejection_reason?: string;
  approved_by?: string;
  approved_at?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  verify_sig?: string;
  verify_url?: string;
  created_at: string;
}

export interface RejectionIssue {
  code: string;
  field: 'app' | 'status' | 'transaction_id' | 'duplicate' | 'date' | 'amount' | 'beneficiary' | 'file';
  foundValue?: string;
  expectedValue?: string;
  messageAr: string;
  messageFr: string;
  messageEn: string;
}

export interface ReceiptInspectionResult {
  inspectionId: string;
  verdict: 'verified' | 'underpaid' | 'manual_review' | 'rejected';
  status?: 'verified' | 'underpaid' | 'manual_review' | 'rejected';
  reason: string;
  reasonFr?: string;
  reasonEn?: string;
  rejectionIssues?: RejectionIssue[];
  requiredAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  warnings: string[];
  stagesCompleted?: number;
  extracted: {
    appDetected?: string | null;
    paymentMethodDetected?: string | null;
    transactionId: string;
    transactionReference: string;
    transactionAt: string | null;
    amount: number | null;
    currency: string | null;
    beneficiaryName?: string | null;
    beneficiaryAccount?: string | null;
    amountComparison?: 'match' | 'exact' | 'overpaid' | 'underpaid' | 'unreadable';
    mimeType?: string;
    dimensions?: { width: number; height: number } | null;
  };
}

export interface SecurityEventItem {
  id: number;
  uid: string;
  user_id: number | null;
  user_name: string;
  user_email: string;
  sender_phone: string;
  payment_method: string;
  activity_type: string;
  risk_level: 'normal' | 'warning' | 'suspicious' | 'fraud_rejected';
  reason: string;
  details_json: string;
  linked_request_id: string;
  created_at: string;
}

export interface AdminAnalyticsData {
  site: {
    dailyVisits: number;
    weeklyVisits: number;
    monthlyVisits: number;
    totalPageViews: number;
    totalClicks: number;
    topPages: Array<{ page: string; views: number }>;
  };
  introVideo: {
    impressions: number;
    clicks: number;
    plays: number;
    pauses: number;
    resumes: number;
    unmutes: number;
    completions: number;
    uniqueWatchers: number;
    totalWatchSeconds: number;
    avgWatchPercent: number;
  };
}

export interface PlanLimitsConfig {
  plan_tier: 'free' | 'paid';
  daily_questions_limit: number;
  daily_lessons_limit: number;
  daily_exams_limit: number;
  allow_official_sim: number;
  allow_review_center: number;
  updated_at?: string;
}

export interface AnnualSavingsSummary {
  monthlyPrice: number;
  annualPrice: number;
  twelveMonthsCost: number;
  savingsAmount: number;
  savingsPercent: number;
}

export interface BackendVoiceProfile {
  id: 'voice1' | 'voice2' | 'voice3';
  label_ar: string;
  label_fr: string;
  label_en?: string;
  description_ar: string;
  description_fr: string;
  description_en?: string;
}

export interface PronunciationRuleItem {
  id: number;
  pattern: string;
  replacement: string;
  lang: 'ar' | 'fr' | 'en' | 'all';
  match_type: 'word' | 'exact' | 'regex';
  is_regex: number;
  enabled: number;
  active: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BacSeriesItem {
  id: number;
  slug: string;
  code: string;
  name_ar: string;
  name_fr: string;
  description_ar: string;
  description_fr: string;
  display_order: number;
  active: number;
}

export interface BacCoefficientItem {
  id: number;
  series_slug: string;
  subject_slug: string;
  subject_name_ar: string;
  subject_name_fr: string;
  coefficient: number;
  max_grade: number;
  is_optional: number;
  display_order: number;
}

export interface IssueReportItem {
  id: number;
  user_id?: number | null;
  firebase_uid?: string;
  user_name?: string;
  user_email?: string;
  report_type: 'bug' | 'content_error' | 'payment_issue' | 'account' | 'suggestion' | string;
  reason: string;
  description: string;
  screenshot_data_url?: string | null;
  has_screenshot?: number;
  status: 'open' | 'in_review' | 'resolved' | 'closed' | string;
  admin_reply?: string;
  admin_action?: string;
  created_at: string;
  updated_at: string;
}

export interface StudentStudyGoals {
  user_id?: number;
  daily_target_minutes: number;
  daily_questions_target: number;
  exam_goal_score: number;
  streak_days: number;
  last_study_date: string | null;
  completed_pomodoros: number;
  total_study_minutes: number;
  updated_at?: string;
}

export interface ElevenLabsStatus {
  enabled: boolean;
  configured: boolean;
  freeTierAllowed: boolean;
  voiceIdAr: string;
  voiceIdFr: string;
  tierPermitted?: boolean;
  modelId?: string;
  source?: 'env' | 'db' | 'none';
  maskedHint?: string | null;
}

export interface UserSessionItem {
  id: number;
  session_id: string;
  device_name: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | string;
  browser: string;
  os: string;
  approx_location: string;
  is_current: boolean;
  is_revoked: number;
  created_at: string;
  last_active_at: string;
}

export interface ContactMessageItem {
  id: number;
  user_id?: number | null;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  category: string;
  message: string;
  status: 'unread' | 'read' | 'replied' | 'archived' | string;
  admin_note?: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralSettings {
  id?: number;
  enabled: number;
  points_per_referral: number;
  reward_threshold_points: number;
  reward_duration_days: number;
  welcome_bonus_points: number;
  max_rewards_per_user: number;
  updated_at?: string;
}

export interface ReferralLogItem {
  id: number;
  referrer_user_id: number;
  referred_user_id: number;
  referral_code: string;
  status: 'pending_verification' | 'verified_rewarded' | 'blocked' | string;
  points_awarded: number;
  reason?: string;
  referred_name?: string;
  referred_email?: string;
  referrer_name?: string;
  referrer_email?: string;
  verified_at?: string | null;
  created_at: string;
}

export interface ReferralRewardItem {
  id: number;
  user_id: number;
  points_spent: number;
  duration_days: number;
  plan_slug: string;
  status: string;
  user_name?: string;
  user_email?: string;
  created_at: string;
}

export interface ReferralSummary {
  referralCode: string;
  inviteUrl?: string;
  referralPoints: number;
  settings: ReferralSettings;
  invitedCount: number;
  verifiedCount: number;
  pendingCount: number;
  canRedeem: boolean;
  remainingPointsToReward: number;
  recentLogs: ReferralLogItem[];
  rewards: ReferralRewardItem[];
}

export interface TeacherSection {
  id: number;
  teacher_user_id: number;
  school_id?: number | null;
  school_name?: string;
  name?: string;
  title?: string;
  subject_name?: string;
  subject_slug?: string;
  level?: string;
  description: string;
  visibility: 'public' | 'private';
  share_code: string;
  share_url?: string;
  allow_student_invites?: number | boolean;
  active?: number;
  status?: 'active' | 'archived' | string;
  teacher_name?: string;
  teacher_verified?: number;
  teacher_badge_label?: string;
  member_count?: number;
  members_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface SectionContentItem {
  id: number;
  section_id: number;
  author_user_id: number;
  author_name?: string;
  title: string;
  content_type: 'lesson' | 'explanation' | 'pdf' | 'image' | 'audio' | 'file' | 'announcement';
  body: string;
  file_id?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  created_at: string;
}

export interface SectionTestQuestion {
  id?: number;
  stem: string;
  options: string[];
  correctIndex?: number;
  correct_index?: number;
  points?: number;
}

export interface SectionTestItem {
  id: number;
  section_id: number;
  title: string;
  description: string;
  duration_minutes: number;
  max_score: number;
  questions: SectionTestQuestion[];
  active?: number;
  published?: number;
  mySubmission?: {
    score: number;
    max_score: number;
    submitted_at?: string;
  } | null;
  created_at: string;
}

export interface SchoolItem {
  id: number;
  owner_user_id: number;
  owner_name?: string;
  owner_email?: string;
  name: string;
  school_type?: string;
  city: string;
  wilaya?: string;
  description: string;
  contact_email?: string;
  contact_phone?: string;
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'suspended';
  verified_account: number;
  followers_count?: number;
  teachers_count?: number;
  students_count?: number;
  departments_count?: number;
  rejection_reason?: string;
  created_at: string;
  approved_at?: string | null;
}

export interface PaymentOrderItem {
  id: number;
  order_id: string;
  user_id: number;
  user_name?: string;
  user_email?: string;
  plan_id: number;
  plan_name_ar?: string;
  provider: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
  provider_session_id?: string;
  provider_tx_id?: string;
  checkout_url?: string;
  failure_reason?: string;
  verified_at?: string | null;
  created_at: string;
}

export interface VerificationRequestItem {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  user_level?: string;
  account_type: string;
  full_name: string;
  organization: string;
  specialty: string;
  notes: string;
  document_file_id?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface StoredFileItem {
  id: string;
  owner_user_id: number;
  owner_name?: string;
  owner_email?: string;
  entity_type: string;
  entity_id: string;
  visibility: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_provider: string;
  storage_key: string;
  created_at: string;
}

export interface EducatorItem {
  id: number;
  name: string;
  email?: string;
  role: string;
  level: LevelSlug;
  teacher_category: string;
  professor_specialty: string;
  verified_account: number;
  verified_badge_label: string;
  followers_count: number;
  following_count: number;
  sections_count?: number;
  is_following?: boolean;
}

export type EducatorCard = EducatorItem;

export interface StudentInstitutionalSummary {
  pendingInvitations: Array<{
    member_id: number;
    section_id: number;
    title: string;
    share_code?: string;
    teacher_name: string;
    teacher_verified?: number | boolean;
    school_name?: string;
  }>;
  joinedSections: TeacherSection[];
  evaluations: Array<{
    id: number;
    section_id?: number;
    section_title: string;
    score?: number | null;
    max_score?: number;
    comment?: string;
    note?: string;
    created_at?: string;
  }>;
  followedEducators: EducatorItem[];
  followedSchools: SchoolItem[];
}

