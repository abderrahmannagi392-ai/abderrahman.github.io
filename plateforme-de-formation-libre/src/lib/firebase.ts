import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Language } from '../types';

export const OFFICIAL_ADMIN_EMAIL = 'elalyatalebjidou@gmail.com';

export function isOfficialAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === OFFICIAL_ADMIN_EMAIL);
}

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// CRITICAL: pass firebaseConfig.firestoreDatabaseId to connect to the provisioned named database
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

export { firebaseConfig };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
export async function testConnection(): Promise<{ ok: boolean; offlineError?: boolean }> {
  if (connectionTested) return { ok: true };
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { ok: false, offlineError: true };
    }
    return { ok: true };
  }
}

export function translateFirebaseAuthError(error: unknown, lang: Language): string {
  const code = (error as { code?: string; message?: string })?.code || '';
  const msg = String((error as { message?: string })?.message || '');

  switch (code) {
    case 'auth/email-already-in-use':
      return lang === 'ar'
        ? 'هذا البريد الإلكتروني مسجل مسبقاً. يمكنك تسجيل الدخول أو استعادة كلمة المرور.'
        : 'Cette adresse e-mail est déjà utilisée. Connectez-vous ou réinitialisez votre mot de passe.';
    case 'auth/invalid-email':
      return lang === 'ar' ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Adresse e-mail invalide.';
    case 'auth/weak-password':
      return lang === 'ar'
        ? 'كلمة المرور ضعيفة، يجب أن تتكون من 6 أحرف على الأقل.'
        : 'Mot de passe trop faible (minimum 6 caractères).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return lang === 'ar'
        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
        : 'E-mail ou mot de passe incorrect.';
    case 'auth/user-not-found':
      return lang === 'ar'
        ? 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.'
        : 'Aucun compte trouvé avec cet e-mail.';
    case 'auth/user-disabled':
      return lang === 'ar'
        ? 'تم إيقاف هذا الحساب مؤقتاً من قبل الإدارة. تواصل مع الدعم.'
        : 'Ce compte a été désactivé par l’administration.';
    case 'auth/too-many-requests':
      return lang === 'ar'
        ? 'تم تجاوز عدد المحاولات المسموح به. يرجى الانتظار قليلاً ثم المحاولة مجدداً.'
        : 'Trop de tentatives. Veuillez patienter avant de réessayer.';
    case 'auth/popup-closed-by-user':
      return lang === 'ar'
        ? 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.'
        : 'La fenêtre de connexion a été fermée avant la fin.';
    case 'auth/cancelled-popup-request':
      return lang === 'ar'
        ? 'تم إلغاء طلب النافذة المنبثقة لوجود نافذة أخرى مفتوحة.'
        : 'Demande de fenêtre contextuelle annulée.';
    case 'auth/popup-blocked':
      return lang === 'ar'
        ? 'المتصفح منع النافذة المنبثقة. الرجاء السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مجدداً.'
        : 'Fenêtre contextuelle bloquée par le navigateur. Veuillez autoriser les pop-ups.';
    case 'auth/account-exists-with-different-credential':
      return lang === 'ar'
        ? 'هذا البريد مرتبط بطريقة تسجيل دخول أخرى. سجّل الدخول بالطريقة السابقة.'
        : 'Un compte existe déjà avec cet e-mail via une autre méthode de connexion.';
    case 'auth/operation-not-allowed':
      return lang === 'ar'
        ? 'طريقة تسجيل الدخول هذه (البريد / Google / Apple) غير مفعّلة في إعدادات Firebase Authentication.'
        : 'Cette méthode de connexion (E-mail / Google / Apple) n’est pas encore activée dans Firebase Authentication.';
    case 'auth/unauthorized-domain':
      return lang === 'ar'
        ? 'نطاق الموقع الحالي غير مضاف في Authorized domains داخل إعدادات Firebase Authentication.'
        : 'Ce domaine n’est pas encore autorisé dans Firebase Authentication.';
    case 'auth/requires-recent-login':
      return lang === 'ar'
        ? 'لأسباب أمنية، يرجى إعادة إدخال كلمة المرور الحالية أو إعادة تسجيل الدخول لتنفيذ هذا التغيير.'
        : 'Pour des raisons de sécurité, veuillez confirmer votre mot de passe actuel.';
    case 'auth/network-request-failed':
      return lang === 'ar'
        ? 'تعذر الاتصال بخدمة المصادقة. تحقق من اتصال الإنترنت.'
        : 'Erreur réseau lors de la connexion au service d’authentification.';
    default:
      if (msg.includes('Quota exceeded')) {
        return lang === 'ar'
          ? 'تم الوصول إلى الحد اليومي المجاني لقاعدة البيانات. يرجى المحاولة لاحقاً.'
          : 'Quota journalier Firestore dépassé.';
      }
      return lang === 'ar'
        ? 'حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى.'
        : 'Une erreur est survenue. Veuillez réessayer.';
  }
}
