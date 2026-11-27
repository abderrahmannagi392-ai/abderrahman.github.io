import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  ActiveSubscriptionSummary,
  AuditLog,
  BillingCycle,
  ChatConversation,
  ChatMessage,
  Language,
  Lesson,
  LessonSection,
  LevelSlug,
  NotificationItem,
  NotificationTargetScope,
  PaymentTransaction,
  SiteConfig,
  Subject,
  SubscriptionPlan,
  TrackSlug,
  User,
  UserSubscription,
} from '../types';
import {
  auth,
  db,
  handleFirestoreError,
  isOfficialAdminEmail,
  OFFICIAL_ADMIN_EMAIL,
  OperationType,
} from './firebase';

function tsToIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function tsToMs(val: unknown): number {
  if (!val) return 0;
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function clip(val: string | undefined | null, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || `id_${Date.now()}`;
}

export interface EnsureProfileInput {
  name?: string;
  track?: 'arabic' | 'french' | 'bilingual';
  preferredLang?: Language;
  level?: LevelSlug;
  profileCompleted?: boolean;
  authProvider?: string;
  acceptedTermsAt?: string | null;
  acceptedPrivacyAt?: string | null;
}

const pendingSignupOverridesByEmail = new Map<string, EnsureProfileInput>();
const ensureUserLocks = new Map<string, Promise<User>>();

export function setPendingSignupOverrides(email: string, overrides: EnsureProfileInput): void {
  const key = email.trim().toLowerCase();
  if (key) {
    pendingSignupOverridesByEmail.set(key, overrides);
  }
}

async function runEnsureUserDocuments(
  fbUser: FirebaseUser,
  overrides?: EnsureProfileInput
): Promise<User> {
  const uid = fbUser.uid;
  const email = (fbUser.email || '').trim().toLowerCase();
  const effectiveOverrides =
    overrides || (email ? pendingSignupOverridesByEmail.get(email) : undefined);
  if (email && pendingSignupOverridesByEmail.has(email)) {
    pendingSignupOverridesByEmail.delete(email);
  }

  const isOfficialAdmin = isOfficialAdminEmail(email) && fbUser.emailVerified;
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const fallbackName =
    clip(
      effectiveOverrides?.name || fbUser.displayName || email.split('@')[0] || 'مترشح جديد',
      120
    ) || 'مترشح جديد';
  const safeName = fallbackName.length >= 2 ? fallbackName : `${fallbackName} *`;

  const detectedProvider =
    effectiveOverrides?.authProvider ||
    fbUser.providerData?.[0]?.providerId ||
    'password';
  const isOAuthProvider = detectedProvider === 'google.com' || detectedProvider === 'apple.com';

  if (!snap.exists()) {
    if (fbUser.emailVerified) {
      await fbUser.getIdToken(true).catch(() => {});
    }
    const defaultProfileCompleted =
      typeof effectiveOverrides?.profileCompleted === 'boolean'
        ? effectiveOverrides.profileCompleted
        : isOfficialAdmin
          ? true
          : !isOAuthProvider;
    const profilePayload = {
      uid,
      name: safeName,
      role: isOfficialAdmin ? ('admin' as const) : ('student' as const),
      track: effectiveOverrides?.track || 'bilingual',
      preferredLang: effectiveOverrides?.preferredLang || 'ar',
      level: effectiveOverrides?.level || 'foundation',
      emailVerified: Boolean(fbUser.emailVerified),
      disabled: false,
      profileCompleted: defaultProfileCompleted,
      authProvider: clip(detectedProvider, 40),
      ...(effectiveOverrides?.acceptedTermsAt
        ? { acceptedTermsAt: clip(effectiveOverrides.acceptedTermsAt, 64) }
        : {}),
      ...(effectiveOverrides?.acceptedPrivacyAt
        ? { acceptedPrivacyAt: clip(effectiveOverrides.acceptedPrivacyAt, 64) }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(userRef, profilePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }

    try {
      await setDoc(privateRef, {
        uid,
        email: clip(email, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/private/info`);
    }
  } else {
    const data = snap.data();
    const needsVerifiedSync =
      Boolean(data.emailVerified) !== Boolean(fbUser.emailVerified) && fbUser.emailVerified;
    const needsAdminSync = isOfficialAdmin && data.role !== 'admin';

    if (needsVerifiedSync || needsAdminSync) {
      // Force fresh ID token so request.auth.token.email_verified matches fbUser.emailVerified
      await fbUser.getIdToken(true).catch(() => {});
      try {
        await updateDoc(userRef, {
          ...(needsAdminSync ? { role: 'admin' as const } : {}),
          emailVerified: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      }
    }

    try {
      const pSnap = await getDoc(privateRef);
      if (!pSnap.exists() && email) {
        await setDoc(privateRef, {
          uid,
          email: clip(email, 200),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
    }
  }

  if (isOfficialAdmin) {
    const adminRef = doc(db, 'admins', uid);
    try {
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          uid,
          email: OFFICIAL_ADMIN_EMAIL,
          grantedAt: serverTimestamp(),
          note: 'Official single platform administrator',
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
    }
  }

  let latestSnap;
  try {
    latestSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  const d = latestSnap.data() || {};
  const adminConfirmed = isOfficialAdmin && d.role === 'admin';
  const storedProvider = String(d.authProvider || detectedProvider || 'password');
  let privateContact: { phone?: string; wilaya?: string; city?: string; institution?: string } = {};
  try {
    const pSnap = await getDoc(privateRef);
    if (pSnap.exists()) {
      const pd = pSnap.data() || {};
      privateContact = {
        phone: pd.phone ? String(pd.phone) : undefined,
        wilaya: pd.wilaya ? String(pd.wilaya) : undefined,
        city: pd.city ? String(pd.city) : undefined,
        institution: pd.institution ? String(pd.institution) : undefined,
      };
    }
  } catch {
    // ignore private contact read fallback
  }

  const oauthNeedsCompletion =
    !adminConfirmed &&
    (storedProvider === 'google.com' || storedProvider === 'apple.com') &&
    (d.profileCompleted !== true ||
      !privateContact.phone ||
      !d.acceptedTermsAt ||
      !d.acceptedPrivacyAt);

  const computedProfileCompleted =
    adminConfirmed
      ? true
      : d.profileCompleted === false
        ? false
        : oauthNeedsCompletion
          ? false
          : true;

  return {
    id: 0,
    uid,
    name: String(d.name || safeName),
    email,
    emailVerified: Boolean(fbUser.emailVerified),
    isAdmin: adminConfirmed,
    disabled: Boolean(d.disabled),
    role: adminConfirmed ? 'admin' : 'student',
    track: (d.track as User['track']) || 'bilingual',
    preferred_lang: (d.preferredLang as Language) || 'ar',
    level: (d.level as LevelSlug) || 'foundation',
    profileCompleted: computedProfileCompleted,
    authProvider: storedProvider,
    acceptedTermsAt: d.acceptedTermsAt ? String(d.acceptedTermsAt) : null,
    acceptedPrivacyAt: d.acceptedPrivacyAt ? String(d.acceptedPrivacyAt) : null,
    phone: privateContact.phone,
    wilaya: privateContact.wilaya,
    city: privateContact.city,
    institution: privateContact.institution,
    created_at: tsToIso(d.createdAt),
  };
}

export async function ensureUserDocuments(
  fbUser: FirebaseUser,
  overrides?: EnsureProfileInput
): Promise<User> {
  const uid = fbUser.uid;
  const previous = ensureUserLocks.get(uid) || Promise.resolve(null as unknown as User);
  const current = previous
    .catch(() => null as unknown as User)
    .then(() => runEnsureUserDocuments(fbUser, overrides));

  ensureUserLocks.set(uid, current);
  try {
    return await current;
  } finally {
    if (ensureUserLocks.get(uid) === current) {
      ensureUserLocks.delete(uid);
    }
  }
}

export async function updateMyProfileDoc(
  uid: string,
  patch: {
    name: string;
    track: 'arabic' | 'french' | 'bilingual';
    preferredLang: Language;
    level: LevelSlug;
    profileCompleted?: boolean;
    acceptedTermsAt?: string | null;
    acceptedPrivacyAt?: string | null;
  }
): Promise<void> {
  const safeName = clip(patch.name, 120);
  if (safeName.length < 2) {
    throw new Error('Name must be at least 2 characters.');
  }
  const updatePayload: Record<string, unknown> = {
    name: safeName,
    track: patch.track,
    preferredLang: patch.preferredLang,
    level: patch.level,
    emailVerified: Boolean(auth.currentUser?.emailVerified),
    updatedAt: serverTimestamp(),
  };
  if (typeof patch.profileCompleted === 'boolean') {
    updatePayload.profileCompleted = patch.profileCompleted;
  }
  if (patch.acceptedTermsAt !== undefined) {
    updatePayload.acceptedTermsAt = patch.acceptedTermsAt ? clip(patch.acceptedTermsAt, 64) : null;
  }
  if (patch.acceptedPrivacyAt !== undefined) {
    updatePayload.acceptedPrivacyAt = patch.acceptedPrivacyAt
      ? clip(patch.acceptedPrivacyAt, 64)
      : null;
  }
  try {
    await updateDoc(doc(db, 'users', uid), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function fetchMyPrivateInfoDoc(
  uid: string
): Promise<{ phone: string; wilaya: string; city: string; institution: string }> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    if (!snap.exists()) return { phone: '', wilaya: '', city: '', institution: '' };
    const d = snap.data() || {};
    return {
      phone: String(d.phone || ''),
      wilaya: String(d.wilaya || ''),
      city: String(d.city || ''),
      institution: String(d.institution || ''),
    };
  } catch {
    return { phone: '', wilaya: '', city: '', institution: '' };
  }
}

export async function updateMyPrivateContactDoc(
  uid: string,
  patch: { phone?: string; wilaya?: string; city?: string; institution?: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
      phone: clip(patch.phone, 40),
      wilaya: clip(patch.wilaya, 100),
      city: clip(patch.city, 100),
      institution: clip(patch.institution, 140),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/private/info`);
  }
}

export async function setLessonProgressDoc(
  uid: string,
  lessonIdKey: string,
  completed: boolean,
  isFavorite: boolean
): Promise<void> {
  const safeLessonId = sanitizeId(lessonIdKey);
  const ref = doc(db, 'users', uid, 'lessonProgress', safeLessonId);
  try {
    await setDoc(ref, {
      uid,
      lessonId: safeLessonId,
      completed: Boolean(completed),
      isFavorite: Boolean(isFavorite),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/lessonProgress/${safeLessonId}`);
  }
}

export function subscribeLessonProgress(
  uid: string,
  onUpdate: (map: Record<string, { completed: boolean; isFavorite: boolean }>) => void
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'lessonProgress'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const next: Record<string, { completed: boolean; isFavorite: boolean }> = {};
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        next[docSnap.id] = {
          completed: Boolean(d.completed),
          isFavorite: Boolean(d.isFavorite),
        };
      });
      onUpdate(next);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${uid}/lessonProgress`);
    }
  );
}

export function subscribeMyActiveSubscription(
  uid: string,
  onUpdate: (sub: ActiveSubscriptionSummary | null) => void
): Unsubscribe {
  const q = query(collection(db, 'subscriptions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: Array<{ ms: number; sub: ActiveSubscriptionSummary }> = [];
      const nowMs = Date.now();
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const expiresMs = d.expiresAt ? tsToMs(d.expiresAt) : null;
        if (d.status === 'active' && (!expiresMs || expiresMs > nowMs)) {
          items.push({
            ms: tsToMs(d.createdAt),
            sub: {
              id: 0,
              firestoreId: docSnap.id,
              plan_id: 0,
              planFirestoreId: String(d.planId || ''),
              plan_slug: String(d.planSlug || ''),
              name_ar: String(d.planNameAr || ''),
              name_fr: String(d.planNameFr || ''),
              billing_cycle: d.billingCycle || 'monthly',
              status: 'active',
              starts_at: tsToIso(d.startsAt),
              expires_at: d.expiresAt ? tsToIso(d.expiresAt) : null,
            },
          });
        }
      });
      items.sort((a, b) => b.ms - a.ms);
      onUpdate(items[0]?.sub || null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `subscriptions`);
    }
  );
}

// =========================================================================
// PUBLIC CATALOG & ADMIN SEEDING
// =========================================================================

export async function fetchFirestorePlans(): Promise<SubscriptionPlan[]> {
  try {
    const snap = await getDocs(query(collection(db, 'plans'), where('active', '==', true)));
    const plans: SubscriptionPlan[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      plans.push({
        id: typeof d.numericId === 'number' ? d.numericId : Number(docSnap.id) || plans.length + 1,
        firestoreId: docSnap.id,
        slug: String(d.slug || docSnap.id),
        name_ar: String(d.nameAr || ''),
        name_fr: String(d.nameFr || ''),
        description_ar: String(d.descriptionAr || ''),
        description_fr: String(d.descriptionFr || ''),
        price_mru: Number(d.priceMru || 0),
        price_eur: Number(d.priceEur || 0),
        currency: String(d.currency || 'MRU'),
        duration_days: Number(d.durationDays || 30),
        billing_cycle: d.billingCycle || 'monthly',
        features_ar: Array.isArray(d.featuresAr) ? d.featuresAr : [],
        features_fr: Array.isArray(d.featuresFr) ? d.featuresFr : [],
        is_popular: d.isPopular ? 1 : 0,
        active: d.active ? 1 : 0,
        display_order: Number(d.displayOrder || 0),
      });
    });
    return plans.sort((a, b) => a.display_order - b.display_order);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'plans');
  }
}

export async function fetchFirestoreLessonSections(includeInactive = false): Promise<LessonSection[]> {
  try {
    const q = includeInactive
      ? collection(db, 'lessonSections')
      : query(collection(db, 'lessonSections'), where('active', '==', true));
    const snap = await getDocs(q);
    const list: LessonSection[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        id: docSnap.id,
        titleAr: String(d.titleAr || ''),
        titleFr: String(d.titleFr || ''),
        descriptionAr: String(d.descriptionAr || ''),
        descriptionFr: String(d.descriptionFr || ''),
        subjectSlug: String(d.subjectSlug || ''),
        track: (d.track as TrackSlug) || 'all',
        level: (d.level as LevelSlug) || 'foundation',
        displayOrder: Number(d.displayOrder || 1),
        active: Boolean(d.active),
        createdAt: tsToIso(d.createdAt),
        updatedAt: tsToIso(d.updatedAt),
      });
    });
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'lessonSections');
  }
}

export async function fetchFirestoreLessons(includeInactive = false): Promise<Lesson[]> {
  try {
    const q = includeInactive
      ? collection(db, 'lessons')
      : query(collection(db, 'lessons'), where('active', '==', true));
    const snap = await getDocs(q);
    const list: Lesson[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        id: typeof d.numericId === 'number' ? d.numericId : Number(docSnap.id) || list.length + 1000,
        firestoreId: docSnap.id,
        sectionId: d.sectionId || null,
        subject_slug: String(d.subjectSlug || ''),
        track: (d.track as TrackSlug) || 'all',
        level: (d.level as LevelSlug) || 'foundation',
        lesson_order: Number(d.lessonOrder || 1),
        title_ar: String(d.titleAr || ''),
        title_fr: String(d.titleFr || ''),
        summary_ar: String(d.summaryAr || ''),
        summary_fr: String(d.summaryFr || ''),
        explanation_ar: String(d.explanationAr || ''),
        explanation_speech_ar: String(d.explanationSpeechAr || d.explanationAr || ''),
        explanation_fr: String(d.explanationFr || ''),
        examples: Array.isArray(d.examples) ? d.examples : [],
        exercises: Array.isArray(d.exercises) ? d.exercises : [],
        mcq: Array.isArray(d.mcq) ? d.mcq : [],
        active: Boolean(d.active),
        created_at: tsToIso(d.createdAt),
      });
    });
    return list.sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'lessons');
  }
}

export async function fetchFirestoreSiteConfig(): Promise<
  (SiteConfig & { gradingPolicy?: { maxScore: number; wrongPenalty: number; passingScore: number } }) | null
> {
  try {
    const snap = await getDoc(doc(db, 'siteConfig', 'main'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      tickerMessages: Array.isArray(d.tickerMessages) ? d.tickerMessages : [],
      heroSlides: Array.isArray(d.heroSlides) ? d.heroSlides : [],
      gradingPolicy: d.gradingPolicy,
      supportEnabled: typeof d.supportEnabled === 'boolean' ? d.supportEnabled : true,
      maintenanceMode: typeof d.maintenanceMode === 'boolean' ? d.maintenanceMode : false,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'siteConfig/main');
  }
}

export async function seedFirestoreCatalogIfNeeded(params: {
  subjects: Subject[];
  lessons: Lesson[];
  plans: SubscriptionPlan[];
  siteConfig: SiteConfig;
  gradingPolicy: { maxScore: number; wrongPenalty: number; passingScore: number };
}): Promise<{ seeded: boolean }> {
  try {
    const existingPlans = await getDocs(collection(db, 'plans'));
    const existingLessons = await getDocs(collection(db, 'lessons'));
    const existingConfig = await getDoc(doc(db, 'siteConfig', 'main'));

    if (!existingPlans.empty && !existingLessons.empty && existingConfig.exists()) {
      return { seeded: false };
    }

    const batch = writeBatch(db);

    if (existingPlans.empty) {
      for (const p of params.plans) {
        const planDocId = sanitizeId(p.slug || String(p.id));
        batch.set(doc(db, 'plans', planDocId), {
          numericId: p.id,
          slug: clip(p.slug, 64),
          nameAr: clip(p.name_ar, 160),
          nameFr: clip(p.name_fr, 160),
          descriptionAr: clip(p.description_ar, 500),
          descriptionFr: clip(p.description_fr, 500),
          priceMru: Number(p.price_mru || 0),
          priceEur: Number(p.price_eur || 0),
          currency: clip(p.currency || 'MRU', 10),
          durationDays: Number(p.duration_days || 30),
          billingCycle: p.billing_cycle || 'monthly',
          featuresAr: Array.isArray(p.features_ar) ? p.features_ar.slice(0, 20) : [],
          featuresFr: Array.isArray(p.features_fr) ? p.features_fr.slice(0, 20) : [],
          isPopular: Boolean(p.is_popular),
          active: true,
          displayOrder: Number(p.display_order || 1),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const existingSubjects = await getDocs(collection(db, 'subjects'));
    if (existingSubjects.empty) {
      for (const s of params.subjects) {
        const subDocId = sanitizeId(s.slug);
        batch.set(doc(db, 'subjects', subDocId), {
          slug: clip(s.slug, 80),
          nameAr: clip(s.name_ar, 140),
          nameFr: clip(s.name_fr, 140),
          tracks: Array.isArray(s.tracks) && s.tracks.length > 0 ? s.tracks.slice(0, 5) : ['bilingual'],
          officialProgramRef: clip(s.official_program_ref, 120),
          iconName: clip(s.icon_name || 'BookOpen', 60),
          displayOrder: Number(s.display_order || 1),
          active: true,
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (existingLessons.empty) {
      for (const l of params.lessons) {
        const lessonDocId = `lesson_${l.id}`;
        batch.set(doc(db, 'lessons', lessonDocId), {
          numericId: l.id,
          subjectSlug: clip(l.subject_slug, 80),
          sectionId: null,
          track: l.track || 'all',
          level: l.level || 'foundation',
          lessonOrder: Number(l.lesson_order || l.id),
          titleAr: clip(l.title_ar, 220),
          titleFr: clip(l.title_fr, 220),
          summaryAr: clip(l.summary_ar, 1000),
          summaryFr: clip(l.summary_fr, 1000),
          explanationAr: clip(l.explanation_ar, 15000) || '-',
          explanationSpeechAr: clip(l.explanation_speech_ar || l.explanation_ar, 15000),
          explanationFr: clip(l.explanation_fr, 15000),
          examples: Array.isArray(l.examples) ? l.examples.slice(0, 20) : [],
          exercises: Array.isArray(l.exercises) ? l.exercises.slice(0, 20) : [],
          mcq: Array.isArray(l.mcq) ? l.mcq.slice(0, 30) : [],
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (!existingConfig.exists()) {
      batch.set(doc(db, 'siteConfig', 'main'), {
        tickerMessages: (params.siteConfig.tickerMessages || []).slice(0, 10),
        heroSlides: (params.siteConfig.heroSlides || []).slice(0, 10),
        gradingPolicy: params.gradingPolicy,
        supportEnabled: true,
        maintenanceMode: false,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { seeded: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'catalogSeed');
  }
}

// =========================================================================
// MANUAL-REVIEW SUBSCRIPTION REQUESTS, PAYMENT PROOFS & ADMIN APPROVAL
// =========================================================================

export async function submitSubscriptionRequestInFirestore(params: {
  uid: string;
  userEmail: string;
  userName: string;
  subscriptionRequestId: string;
  planId: string;
  planSlug: string;
  planName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionId: string;
  transactionReference: string;
  transactionAt: string;
  beneficiaryName: string;
  proofHash: string;
  proofDataUrl: string;
  uploadedAt: string;
  status?: 'pending_review' | 'partial_pending';
  paidAmount?: number;
  remainingAmount?: number;
}): Promise<void> {
  const reqId = sanitizeId(params.subscriptionRequestId);
  const reqRef = doc(db, 'subscriptionRequests', reqId);
  const proofRef = doc(db, 'paymentProofs', reqId);
  const targetAmount = Math.max(0, Number(params.amount || 0));
  const paidAmount = Math.max(0, Number(params.paidAmount ?? targetAmount));
  const remainingAmount = Math.max(0, Number(params.remainingAmount ?? Math.max(0, targetAmount - paidAmount)));
  const mirrorStatus = params.status === 'partial_pending' ? 'partial_pending' : 'pending_review';

  try {
    const batch = writeBatch(db);
    batch.set(reqRef, {
      subscriptionRequestId: reqId,
      userId: params.uid,
      uid: params.uid,
      userEmail: clip(params.userEmail, 200),
      userName: clip(params.userName, 140),
      planId: clip(params.planId, 128),
      planSlug: clip(params.planSlug, 64),
      planName: clip(params.planName, 160),
      amount: targetAmount,
      paidAmount,
      remainingAmount,
      currency: clip(params.currency || 'MRU', 10),
      paymentMethod: clip(params.paymentMethod, 40),
      status: mirrorStatus,
      transactionId: clip(params.transactionId, 120),
      transactionReference: clip(params.transactionReference, 120),
      transactionAt: clip(params.transactionAt, 64),
      beneficiaryName: clip(params.beneficiaryName, 140),
      proofHash: clip(params.proofHash, 128),
      proofRefId: reqId,
      uploadedAt: clip(params.uploadedAt, 64),
      expiresAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(proofRef, {
      subscriptionRequestId: reqId,
      uid: params.uid,
      paymentMethod: clip(params.paymentMethod, 40),
      transactionId: clip(params.transactionId, 120),
      transactionReference: clip(params.transactionReference, 120),
      proofHash: clip(params.proofHash, 128),
      proofDataUrl: clip(params.proofDataUrl, 900000),
      uploadedAt: clip(params.uploadedAt, 64),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    // Non-blocking mirror: SQLite backend already persists full request + proof
    console.warn('Firestore subscriptionRequest mirror failed:', err);
  }
}

export async function approveSubscriptionRequestInFirestore(params: {
  subscriptionRequestId: string;
  userUid?: string;
  planSlug: string;
  planNameAr: string;
  planNameFr: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  transactionId: string;
  approvedBy: string;
  approvedAtIso: string;
  expiresAtIso: string;
  paymentId: string;
}): Promise<void> {
  const reqId = sanitizeId(params.subscriptionRequestId);
  const reqRef = doc(db, 'subscriptionRequests', reqId);
  const expiresDate = new Date(params.expiresAtIso);
  const startsDate = new Date(params.approvedAtIso);

  try {
    const snap = await getDoc(reqRef).catch(() => null);
    const existingData = snap && snap.exists() ? snap.data() : null;
    const targetUid = String(existingData?.uid || existingData?.userId || params.userUid || '').trim();
    if (!targetUid) return;

    const batch = writeBatch(db);
    if (snap && snap.exists()) {
      batch.update(reqRef, {
        status: 'approved',
        approvedBy: clip(params.approvedBy, 200),
        approvedAt: clip(params.approvedAtIso, 64),
        startsAt: clip(params.approvedAtIso, 64),
        expiresAt: Timestamp.fromDate(expiresDate),
        updatedAt: serverTimestamp(),
      });
    }

    const subRef = doc(collection(db, 'subscriptions'));
    batch.set(subRef, {
      uid: targetUid,
      planId: sanitizeId(params.planSlug),
      planSlug: clip(params.planSlug, 64),
      planNameAr: clip(params.planNameAr, 160),
      planNameFr: clip(params.planNameFr || params.planNameAr, 160),
      billingCycle: params.billingCycle || 'monthly',
      status: 'active',
      orderId: reqId,
      startsAt: Timestamp.fromDate(startsDate),
      expiresAt: Timestamp.fromDate(expiresDate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const payRef = doc(db, 'payments', sanitizeId(params.paymentId));
    batch.set(payRef, {
      paymentId: sanitizeId(params.paymentId),
      subscriptionRequestId: reqId,
      uid: targetUid,
      planSlug: clip(params.planSlug, 64),
      amount: Math.max(0, Number(params.amount || 0)),
      currency: clip(params.currency || 'MRU', 10),
      paymentMethod: clip(params.paymentMethod, 40),
      transactionReference: clip(params.transactionReference, 120),
      transactionId: clip(params.transactionId, 120),
      approvedBy: clip(params.approvedBy, 200),
      approvedAt: clip(params.approvedAtIso, 64),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    console.warn('Firestore approval mirror warning:', err);
  }
}

export async function rejectSubscriptionRequestInFirestore(params: {
  subscriptionRequestId: string;
  rejectionReason: string;
  approvedBy: string;
}): Promise<void> {
  const reqId = sanitizeId(params.subscriptionRequestId);
  const reqRef = doc(db, 'subscriptionRequests', reqId);
  try {
    const snap = await getDoc(reqRef).catch(() => null);
    if (!snap || !snap.exists()) return;
    await updateDoc(reqRef, {
      status: 'rejected',
      rejectionReason: clip(params.rejectionReason, 500),
      approvedBy: clip(params.approvedBy, 200),
      approvedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore rejection mirror warning:', err);
  }
}

export async function activateFreePlanInFirestore(uid: string, plan: SubscriptionPlan): Promise<void> {
  const planId = plan.firestoreId || sanitizeId(plan.slug);
  const subRef = doc(collection(db, 'subscriptions'));
  const expiresDate = new Date(Date.now() + Math.max(30, Number(plan.duration_days || 365)) * 86400000);
  try {
    await setDoc(subRef, {
      uid,
      planId,
      planSlug: clip(plan.slug, 64),
      planNameAr: clip(plan.name_ar, 160),
      planNameFr: clip(plan.name_fr, 160),
      billingCycle: 'free',
      status: 'active',
      orderId: null,
      startsAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresDate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `subscriptions/${subRef.id}`);
  }
}

// =========================================================================
// TARGETED NOTIFICATIONS + FUTURE-USER EXCLUSION
// =========================================================================

export function subscribeUserNotifications(params: {
  uid: string;
  userCreatedAtMs: number;
  userTrack: TrackSlug;
  userLevel: LevelSlug;
  hasPaidSub: boolean;
  onUpdate: (items: NotificationItem[]) => void;
}): Unsubscribe {
  let scopeDocs: Array<{ id: string; data: Record<string, any> }> = [];
  let directDocs: Array<{ id: string; data: Record<string, any> }> = [];
  let readSet = new Set<string>();

  const emit = () => {
    const merged = new Map<string, Record<string, any>>();
    for (const item of scopeDocs) merged.set(item.id, item.data);
    for (const item of directDocs) merged.set(item.id, item.data);

    const out: NotificationItem[] = [];
    merged.forEach((d, docId) => {
      const scope = (d.targetScope || 'current_users') as NotificationTargetScope;
      const createdAtMs = tsToMs(d.createdAt);
      const eligibleBeforeMs = d.eligibleBefore ? tsToMs(d.eligibleBefore) : null;

      // Critical Rule: users registered AFTER a 'current_users' notification MUST NEVER see it
      if (scope === 'current_users') {
        const cutoff = eligibleBeforeMs || createdAtMs;
        if (cutoff > 0 && params.userCreatedAtMs > cutoff) {
          return;
        }
      } else if (scope === 'conditional') {
        if (eligibleBeforeMs && params.userCreatedAtMs > eligibleBeforeMs) {
          return;
        }
        if (d.targetTrack && d.targetTrack !== 'all' && d.targetTrack !== params.userTrack) {
          return;
        }
        if (d.targetLevel && d.targetLevel !== 'all' && d.targetLevel !== params.userLevel) {
          return;
        }
        if (d.targetSubscription === 'paid' && !params.hasPaidSub) return;
        if (d.targetSubscription === 'free' && params.hasPaidSub) return;
      } else if (scope === 'specific_users') {
        const list = Array.isArray(d.targetUserIds) ? d.targetUserIds : [];
        if (!list.includes(params.uid)) return;
      }

      out.push({
        id: 0,
        firestoreId: docId,
        user_id: null,
        title_ar: String(d.titleAr || ''),
        title_fr: String(d.titleFr || d.titleAr || ''),
        body_ar: String(d.bodyAr || ''),
        body_fr: String(d.bodyFr || d.bodyAr || ''),
        type: d.type || 'info',
        targetScope: scope,
        targetTrack: d.targetTrack || 'all',
        targetLevel: d.targetLevel || 'all',
        targetSubscription: d.targetSubscription || 'all',
        targetUserIds: Array.isArray(d.targetUserIds) ? d.targetUserIds : [],
        eligibleBeforeMs,
        createdAtMs,
        is_read: readSet.has(docId) ? 1 : 0,
        created_at: tsToIso(d.createdAt),
      });
    });

    out.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    params.onUpdate(out);
  };

  const qScope = query(
    collection(db, 'notifications'),
    where('targetScope', 'in', ['current_users', 'conditional', 'all_including_future'])
  );
  const qDirect = query(
    collection(db, 'notifications'),
    where('targetUserIds', 'array-contains', params.uid)
  );
  const qReads = query(
    collection(db, 'users', params.uid, 'notificationReads'),
    where('uid', '==', params.uid)
  );

  const unsub1 = onSnapshot(
    qScope,
    (snap) => {
      scopeDocs = snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));
      emit();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
  );

  const unsub2 = onSnapshot(
    qDirect,
    (snap) => {
      directDocs = snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));
      emit();
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
  );

  const unsub3 = onSnapshot(
    qReads,
    (snap) => {
      readSet = new Set(snap.docs.map((docSnap) => docSnap.id));
      emit();
    },
    (error) =>
      handleFirestoreError(error, OperationType.LIST, `users/${params.uid}/notificationReads`)
  );

  return () => {
    unsub1();
    unsub2();
    unsub3();
  };
}

export async function markNotificationsReadInFirestore(
  uid: string,
  notificationIds: string[]
): Promise<void> {
  const ids = notificationIds.filter(Boolean).slice(0, 40);
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const rawId of ids) {
      const safeId = sanitizeId(rawId);
      batch.set(doc(db, 'users', uid, 'notificationReads', safeId), {
        uid,
        notificationId: safeId,
        readAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/notificationReads`);
  }
}

// =========================================================================
// REAL-TIME SUPPORT CHAT (VERIFIED USER <-> OFFICIAL ADMIN)
// =========================================================================

export function subscribeUserConversations(
  uid: string,
  onUpdate: (items: ChatConversation[]) => void
): Unsubscribe {
  const q = query(collection(db, 'conversations'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: ChatConversation[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          uid: String(d.uid || ''),
          userName: String(d.userName || ''),
          userEmail: String(d.userEmail || ''),
          subject: String(d.subject || ''),
          status: (d.status as ChatConversation['status']) || 'open',
          lastMessagePreview: String(d.lastMessagePreview || ''),
          lastSenderRole: d.lastSenderRole === 'admin' ? 'admin' : 'user',
          unreadForUser: Number(d.unreadForUser || 0),
          unreadForAdmin: Number(d.unreadForAdmin || 0),
          createdAt: tsToIso(d.createdAt),
          updatedAt: tsToIso(d.updatedAt),
          updatedAtMs: tsToMs(d.updatedAt),
        };
      });
      list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onUpdate(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'conversations')
  );
}

export function subscribeAllConversationsForAdmin(
  onUpdate: (items: ChatConversation[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'conversations'),
    (snap) => {
      const list: ChatConversation[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          uid: String(d.uid || ''),
          userName: String(d.userName || ''),
          userEmail: String(d.userEmail || ''),
          subject: String(d.subject || ''),
          status: (d.status as ChatConversation['status']) || 'open',
          lastMessagePreview: String(d.lastMessagePreview || ''),
          lastSenderRole: d.lastSenderRole === 'admin' ? 'admin' : 'user',
          unreadForUser: Number(d.unreadForUser || 0),
          unreadForAdmin: Number(d.unreadForAdmin || 0),
          createdAt: tsToIso(d.createdAt),
          updatedAt: tsToIso(d.updatedAt),
          updatedAtMs: tsToMs(d.updatedAt),
        };
      });
      list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onUpdate(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'conversations')
  );
}

export function subscribeConversationMessages(
  conversationId: string,
  ownerUid: string,
  isAdminViewer: boolean,
  onUpdate: (items: ChatMessage[]) => void
): Unsubscribe {
  const colRef = collection(db, 'conversations', conversationId, 'messages');
  const q = isAdminViewer ? colRef : query(colRef, where('conversationOwnerUid', '==', ownerUid));
  return onSnapshot(
    q,
    (snap) => {
      const list: ChatMessage[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          conversationId: String(d.conversationId || conversationId),
          conversationOwnerUid: String(d.conversationOwnerUid || ownerUid),
          senderUid: String(d.senderUid || ''),
          senderName: String(d.senderName || ''),
          senderRole: d.senderRole === 'admin' ? 'admin' : 'user',
          text: String(d.text || ''),
          createdAt: tsToIso(d.createdAt),
          createdAtMs: tsToMs(d.createdAt),
        };
      });
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onUpdate(list);
    },
    (error) =>
      handleFirestoreError(error, OperationType.LIST, `conversations/${conversationId}/messages`)
  );
}

export async function createSupportConversation(params: {
  uid: string;
  userName: string;
  userEmail: string;
  subject: string;
  initialMessage: string;
}): Promise<string> {
  const convRef = doc(collection(db, 'conversations'));
  const msgRef = doc(collection(db, 'conversations', convRef.id, 'messages'));
  const cleanSubject = clip(params.subject, 200) || 'استفسار دعم فني';
  const cleanText = clip(params.initialMessage, 4000);
  if (!cleanText) throw new Error('Message text is required.');

  try {
    const batch = writeBatch(db);
    batch.set(convRef, {
      uid: params.uid,
      userName: clip(params.userName, 140),
      userEmail: clip(params.userEmail, 200),
      subject: cleanSubject,
      status: 'open',
      lastMessagePreview: clip(cleanText, 300),
      lastSenderRole: 'user',
      unreadForUser: 0,
      unreadForAdmin: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(msgRef, {
      conversationId: convRef.id,
      conversationOwnerUid: params.uid,
      senderUid: params.uid,
      senderName: clip(params.userName, 140),
      senderRole: 'user',
      text: cleanText,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return convRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convRef.id}`);
  }
}

export async function sendSupportChatMessage(params: {
  conversation: ChatConversation;
  senderUid: string;
  senderName: string;
  senderRole: 'user' | 'admin';
  text: string;
}): Promise<void> {
  const cleanText = clip(params.text, 4000);
  if (!cleanText) return;
  const convRef = doc(db, 'conversations', params.conversation.id);
  const msgRef = doc(collection(db, 'conversations', params.conversation.id, 'messages'));

  try {
    const batch = writeBatch(db);
    batch.set(msgRef, {
      conversationId: params.conversation.id,
      conversationOwnerUid: params.conversation.uid,
      senderUid: params.senderUid,
      senderName: clip(params.senderName, 140),
      senderRole: params.senderRole,
      text: cleanText,
      createdAt: serverTimestamp(),
    });
    if (params.senderRole === 'admin') {
      batch.update(convRef, {
        lastMessagePreview: clip(cleanText, 300),
        lastSenderRole: 'admin',
        unreadForUser: (params.conversation.unreadForUser || 0) + 1,
        unreadForAdmin: 0,
        status: params.conversation.status === 'closed' ? 'open' : params.conversation.status,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(convRef, {
        lastMessagePreview: clip(cleanText, 300),
        lastSenderRole: 'user',
        unreadForAdmin: (params.conversation.unreadForAdmin || 0) + 1,
        unreadForUser: 0,
        status: 'open',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `conversations/${params.conversation.id}/messages/${msgRef.id}`
    );
  }
}

export async function markConversationReadByRole(
  conversationId: string,
  role: 'user' | 'admin'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      ...(role === 'admin' ? { unreadForAdmin: 0 } : { unreadForUser: 0 }),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${conversationId}`);
  }
}

export async function updateConversationStatusAdmin(
  conversationId: string,
  status: 'open' | 'pending' | 'closed'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${conversationId}`);
  }
}

// =========================================================================
// ADMIN DASHBOARD CRUD HELPERS (OFFICIAL ADMIN ONLY)
// =========================================================================

export async function writeAdminAuditLog(params: {
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
}): Promise<void> {
  const ref = doc(collection(db, 'auditLogs'));
  try {
    await setDoc(ref, {
      actorUid: params.actorUid,
      actorEmail: clip(params.actorEmail, 200),
      action: clip(params.action, 80),
      targetType: clip(params.targetType, 80),
      targetId: clip(params.targetId, 128),
      details: clip(params.details, 600),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `auditLogs/${ref.id}`);
  }
}

export interface AdminUserRecord {
  uid: string;
  name: string;
  email: string;
  role: 'student' | 'admin';
  track: 'arabic' | 'french' | 'bilingual';
  preferredLang: Language;
  level: LevelSlug;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  createdAtMs: number;
}

export async function fetchAllUsersForAdmin(): Promise<AdminUserRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users: AdminUserRecord[] = [];
    for (const uDoc of snap.docs) {
      const d = uDoc.data();
      let email = '';
      try {
        const privSnap = await getDoc(doc(db, 'users', uDoc.id, 'private', 'info'));
        email = String(privSnap.data()?.email || '');
      } catch {
        // ignore if missing
      }
      users.push({
        uid: uDoc.id,
        name: String(d.name || ''),
        email,
        role: d.role === 'admin' ? 'admin' : 'student',
        track: d.track || 'bilingual',
        preferredLang:
          d.preferredLang === 'fr' || d.preferredLang === 'en' ? d.preferredLang : 'ar',
        level: d.level || 'foundation',
        emailVerified: Boolean(d.emailVerified),
        disabled: Boolean(d.disabled),
        createdAt: tsToIso(d.createdAt),
        createdAtMs: tsToMs(d.createdAt),
      });
    }
    return users.sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function setUserDisabledAdmin(
  targetUid: string,
  disabled: boolean,
  actorUid: string,
  actorEmail: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      disabled,
      updatedAt: serverTimestamp(),
    });
    await writeAdminAuditLog({
      actorUid,
      actorEmail,
      action: disabled ? 'DISABLE_USER' : 'ENABLE_USER',
      targetType: 'user',
      targetId: targetUid,
      details: `disabled=${disabled}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function createLessonSectionAdmin(params: {
  titleAr: string;
  titleFr: string;
  descriptionAr: string;
  descriptionFr: string;
  subjectSlug: string;
  track: TrackSlug;
  level: LevelSlug;
  displayOrder: number;
  active: boolean;
}): Promise<string> {
  const ref = doc(collection(db, 'lessonSections'));
  try {
    await setDoc(ref, {
      titleAr: clip(params.titleAr, 160),
      titleFr: clip(params.titleFr, 160),
      descriptionAr: clip(params.descriptionAr, 500),
      descriptionFr: clip(params.descriptionFr, 500),
      subjectSlug: clip(params.subjectSlug, 80),
      track: params.track,
      level: params.level,
      displayOrder: Number(params.displayOrder || 1),
      active: Boolean(params.active),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `lessonSections/${ref.id}`);
  }
}

export async function updateLessonSectionAdmin(
  sectionId: string,
  patch: Partial<{
    titleAr: string;
    titleFr: string;
    descriptionAr: string;
    descriptionFr: string;
    subjectSlug: string;
    track: TrackSlug;
    level: LevelSlug;
    displayOrder: number;
    active: boolean;
  }>
): Promise<void> {
  const ref = doc(db, 'lessonSections', sectionId);
  try {
    const snap = await getDoc(ref);
    const existing = snap.data() || {};
    await updateDoc(ref, {
      titleAr: clip(patch.titleAr ?? existing.titleAr, 160),
      titleFr: clip(patch.titleFr ?? existing.titleFr, 160),
      descriptionAr: clip(patch.descriptionAr ?? existing.descriptionAr, 500),
      descriptionFr: clip(patch.descriptionFr ?? existing.descriptionFr, 500),
      subjectSlug: clip(patch.subjectSlug ?? existing.subjectSlug, 80),
      track: patch.track ?? existing.track ?? 'all',
      level: patch.level ?? existing.level ?? 'foundation',
      displayOrder: Number(patch.displayOrder ?? existing.displayOrder ?? 1),
      active: typeof patch.active === 'boolean' ? patch.active : Boolean(existing.active),
      createdAt: existing.createdAt,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `lessonSections/${sectionId}`);
  }
}

export async function deleteLessonSectionAdmin(sectionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'lessonSections', sectionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `lessonSections/${sectionId}`);
  }
}

export async function createOrUpdateLessonAdmin(params: {
  id?: string;
  numericId?: number;
  subjectSlug: string;
  sectionId?: string | null;
  track: TrackSlug;
  level: LevelSlug;
  lessonOrder: number;
  titleAr: string;
  titleFr: string;
  summaryAr: string;
  summaryFr: string;
  explanationAr: string;
  explanationFr: string;
  active: boolean;
}): Promise<string> {
  const isNew = !params.id;
  const ref = params.id ? doc(db, 'lessons', params.id) : doc(collection(db, 'lessons'));
  try {
    if (isNew) {
      await setDoc(ref, {
        numericId: params.numericId || Math.floor(10000 + Math.random() * 89999),
        subjectSlug: clip(params.subjectSlug, 80),
        sectionId: params.sectionId || null,
        track: params.track || 'all',
        level: params.level || 'foundation',
        lessonOrder: Number(params.lessonOrder || 1),
        titleAr: clip(params.titleAr, 220),
        titleFr: clip(params.titleFr || params.titleAr, 220),
        summaryAr: clip(params.summaryAr, 1000),
        summaryFr: clip(params.summaryFr, 1000),
        explanationAr: clip(params.explanationAr, 15000),
        explanationSpeechAr: clip(params.explanationAr, 15000),
        explanationFr: clip(params.explanationFr, 15000),
        examples: [],
        exercises: [],
        mcq: [],
        active: Boolean(params.active),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const snap = await getDoc(ref);
      const existing = snap.data() || {};
      await updateDoc(ref, {
        numericId: existing.numericId || params.numericId || 1,
        subjectSlug: clip(params.subjectSlug, 80),
        sectionId: params.sectionId ?? existing.sectionId ?? null,
        track: params.track || 'all',
        level: params.level || 'foundation',
        lessonOrder: Number(params.lessonOrder || existing.lessonOrder || 1),
        titleAr: clip(params.titleAr, 220),
        titleFr: clip(params.titleFr || params.titleAr, 220),
        summaryAr: clip(params.summaryAr, 1000),
        summaryFr: clip(params.summaryFr, 1000),
        explanationAr: clip(params.explanationAr, 15000),
        explanationSpeechAr: clip(params.explanationAr, 15000),
        explanationFr: clip(params.explanationFr, 15000),
        examples: Array.isArray(existing.examples) ? existing.examples : [],
        exercises: Array.isArray(existing.exercises) ? existing.exercises : [],
        mcq: Array.isArray(existing.mcq) ? existing.mcq : [],
        active: Boolean(params.active),
        createdAt: existing.createdAt,
        updatedAt: serverTimestamp(),
      });
    }
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `lessons/${ref.id}`);
  }
}

export async function deleteLessonAdmin(lessonId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'lessons', lessonId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `lessons/${lessonId}`);
  }
}

export async function savePlanAdmin(params: {
  id?: string;
  numericId?: number;
  slug: string;
  nameAr: string;
  nameFr: string;
  descriptionAr: string;
  descriptionFr: string;
  priceMru: number;
  priceEur: number;
  durationDays: number;
  billingCycle: BillingCycle;
  featuresAr: string[];
  featuresFr: string[];
  isPopular: boolean;
  active: boolean;
  displayOrder: number;
}): Promise<string> {
  const docId = sanitizeId(params.id || params.slug);
  const ref = doc(db, 'plans', docId);
  try {
    await setDoc(ref, {
      numericId: params.numericId || Math.floor(100 + Math.random() * 899),
      slug: clip(params.slug, 64),
      nameAr: clip(params.nameAr, 160),
      nameFr: clip(params.nameFr, 160),
      descriptionAr: clip(params.descriptionAr, 500),
      descriptionFr: clip(params.descriptionFr, 500),
      priceMru: Math.max(0, Number(params.priceMru || 0)),
      priceEur: Math.max(0, Number(params.priceEur || 0)),
      currency: 'MRU',
      durationDays: Math.max(1, Number(params.durationDays || 30)),
      billingCycle: params.billingCycle,
      featuresAr: params.featuresAr.slice(0, 20),
      featuresFr: params.featuresFr.slice(0, 20),
      isPopular: Boolean(params.isPopular),
      active: Boolean(params.active),
      displayOrder: Number(params.displayOrder || 1),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `plans/${docId}`);
  }
}

export async function fetchAllOrdersAndSubscriptionsAdmin(): Promise<{
  orders: PaymentTransaction[];
  subscriptions: Array<UserSubscription & { userEmail?: string; userName?: string }>;
  plans: SubscriptionPlan[];
}> {
  try {
    const [oSnap, sSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'subscriptions')),
      getDocs(collection(db, 'plans')),
    ]);

    const orders: PaymentTransaction[] = oSnap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: 0,
        firestoreId: docSnap.id,
        uid: String(d.uid || ''),
        user_id: 0,
        user_email: String(d.userEmail || ''),
        user_name: String(d.userName || ''),
        plan_id: 0,
        planFirestoreId: String(d.planId || ''),
        plan_name_ar: String(d.planNameAr || ''),
        plan_name_fr: String(d.planNameFr || ''),
        amount_mru: Number(d.amountMru || 0),
        amount_eur: Number(d.amountEur || 0),
        currency: String(d.currency || 'MRU'),
        card_brand: d.cardBrand === 'mastercard' ? 'mastercard' : 'visa',
        card_last4: String(d.cardLast4 || '0000'),
        card_exp_month: 0,
        card_exp_year: 0,
        cardholder_name: String(d.cardholderName || ''),
        phone: String(d.phone || ''),
        wilaya: String(d.wilaya || ''),
        city: String(d.city || ''),
        provider: 'firebase_gateway',
        provider_tx_id: String(d.transactionRef || ''),
        status: d.status || 'succeeded',
        created_at: tsToIso(d.createdAt),
      };
    });

    const subscriptions = sSnap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: 0,
        firestoreId: docSnap.id,
        uid: String(d.uid || ''),
        user_id: 0,
        plan_id: 0,
        planFirestoreId: String(d.planId || ''),
        plan_slug: String(d.planSlug || ''),
        name_ar: String(d.planNameAr || ''),
        name_fr: String(d.planNameFr || ''),
        billing_cycle: String(d.billingCycle || ''),
        status: d.status || 'active',
        starts_at: tsToIso(d.startsAt),
        expires_at: d.expiresAt ? tsToIso(d.expiresAt) : null,
        payment_tx_id: null,
        orderId: d.orderId || null,
        created_at: tsToIso(d.createdAt),
      };
    });

    const plans: SubscriptionPlan[] = pSnap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: typeof d.numericId === 'number' ? d.numericId : 1,
          firestoreId: docSnap.id,
          slug: String(d.slug || docSnap.id),
          name_ar: String(d.nameAr || ''),
          name_fr: String(d.nameFr || ''),
          description_ar: String(d.descriptionAr || ''),
          description_fr: String(d.descriptionFr || ''),
          price_mru: Number(d.priceMru || 0),
          price_eur: Number(d.priceEur || 0),
          currency: String(d.currency || 'MRU'),
          duration_days: Number(d.durationDays || 30),
          billing_cycle: d.billingCycle || 'monthly',
          features_ar: Array.isArray(d.featuresAr) ? d.featuresAr : [],
          features_fr: Array.isArray(d.featuresFr) ? d.featuresFr : [],
          is_popular: d.isPopular ? 1 : 0,
          active: d.active ? 1 : 0,
          display_order: Number(d.displayOrder || 1),
        };
      })
      .sort((a, b) => a.display_order - b.display_order);

    orders.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    subscriptions.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    return { orders, subscriptions, plans };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'orders_subscriptions');
  }
}

export async function updateOrderStatusAdmin(
  orderId: string,
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled'
): Promise<void> {
  const ref = doc(db, 'orders', orderId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function updateSubscriptionStatusAdmin(
  subId: string,
  status: 'pending' | 'active' | 'expired' | 'cancelled'
): Promise<void> {
  const ref = doc(db, 'subscriptions', subId);
  try {
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${subId}`);
  }
}

export async function sendTargetedNotificationAdmin(params: {
  createdByUid: string;
  titleAr: string;
  titleFr: string;
  bodyAr: string;
  bodyFr: string;
  type: 'info' | 'exam' | 'alert' | 'offer';
  targetScope: NotificationTargetScope;
  targetTrack: TrackSlug;
  targetLevel: 'all' | LevelSlug;
  targetSubscription: 'all' | 'paid' | 'free';
  targetUserIds: string[];
}): Promise<string> {
  const ref = doc(collection(db, 'notifications'));
  try {
    const nowTs = serverTimestamp();
    await setDoc(ref, {
      titleAr: clip(params.titleAr, 180),
      titleFr: clip(params.titleFr || params.titleAr, 180),
      bodyAr: clip(params.bodyAr, 2000),
      bodyFr: clip(params.bodyFr || params.bodyAr, 2000),
      type: params.type,
      targetScope: params.targetScope,
      targetTrack: params.targetTrack,
      targetLevel: params.targetLevel,
      targetSubscription: params.targetSubscription,
      targetUserIds: params.targetUserIds.slice(0, 100),
      eligibleBefore: params.targetScope === 'all_including_future' ? null : nowTs,
      createdByUid: params.createdByUid,
      createdAt: nowTs,
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${ref.id}`);
  }
}

export async function fetchAllNotificationsAdmin(): Promise<NotificationItem[]> {
  try {
    const snap = await getDocs(collection(db, 'notifications'));
    const list: NotificationItem[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: 0,
        firestoreId: docSnap.id,
        user_id: null,
        title_ar: String(d.titleAr || ''),
        title_fr: String(d.titleFr || ''),
        body_ar: String(d.bodyAr || ''),
        body_fr: String(d.bodyFr || ''),
        type: d.type || 'info',
        targetScope: d.targetScope || 'current_users',
        targetTrack: d.targetTrack || 'all',
        targetLevel: d.targetLevel || 'all',
        targetSubscription: d.targetSubscription || 'all',
        targetUserIds: Array.isArray(d.targetUserIds) ? d.targetUserIds : [],
        createdAtMs: tsToMs(d.createdAt),
        is_read: 1,
        created_at: tsToIso(d.createdAt),
      };
    });
    return list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'notifications');
  }
}

export async function deleteNotificationAdmin(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function saveSiteConfigAdmin(params: {
  tickerMessages: SiteConfig['tickerMessages'];
  heroSlides: SiteConfig['heroSlides'];
  gradingPolicy?: { maxScore: number; wrongPenalty: number; passingScore: number };
  supportEnabled?: boolean;
  maintenanceMode?: boolean;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'siteConfig', 'main'), {
      tickerMessages: params.tickerMessages.slice(0, 10),
      heroSlides: params.heroSlides.slice(0, 10),
      ...(params.gradingPolicy ? { gradingPolicy: params.gradingPolicy } : {}),
      supportEnabled: params.supportEnabled ?? true,
      maintenanceMode: params.maintenanceMode ?? false,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'siteConfig/main');
  }
}

export async function fetchAuditLogsAdmin(): Promise<AuditLog[]> {
  try {
    const snap = await getDocs(collection(db, 'auditLogs'));
    const list: AuditLog[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: 0,
        firestoreId: docSnap.id,
        actor_id: null,
        actor_email: String(d.actorEmail || ''),
        action: String(d.action || ''),
        target_type: String(d.targetType || ''),
        target_id: String(d.targetId || ''),
        details: String(d.details || ''),
        created_at: tsToIso(d.createdAt),
      };
    });
    return list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 150);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'auditLogs');
  }
}
