import React, { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { CheckCircle2, PhoneCall, ShieldCheck, UserCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { auth } from '../lib/firebase';
import {
  fetchMyPrivateInfoDoc,
  updateMyPrivateContactDoc,
  updateMyProfileDoc,
} from '../lib/firestoreService';
import type { Language, LevelSlug } from '../types';
import { apiRequest } from '../utils/api';
import { ALL_USER_LEVEL_OPTIONS, TEACHER_CATEGORY_OPTIONS } from '../utils/levelLabels';

export const AccountCompletionPage: React.FC = () => {
  const { lang, setLang, user, firebaseUser, refreshUser, navigate } = useApp();
  const isAr = lang === 'ar';

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [wilaya, setWilaya] = useState(user?.wilaya || '');
  const [city, setCity] = useState(user?.city || '');
  const [track, setTrack] = useState<'arabic' | 'french' | 'bilingual'>(user?.track || 'bilingual');
  const [level, setLevel] = useState<LevelSlug>(user?.level || 'foundation');
  const [teacherCategory, setTeacherCategory] = useState<'bilingual' | 'arabic' | 'french'>(
    (user?.teacher_category as 'bilingual' | 'arabic' | 'french') || 'bilingual'
  );
  const [professorSpecialty, setProfessorSpecialty] = useState(user?.professor_specialty || '');
  const [preferredLang, setPreferredLang] = useState<Language>(user?.preferred_lang || lang);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(Boolean(user?.acceptedPrivacyAt));
  const [acceptedTerms, setAcceptedTerms] = useState(Boolean(user?.acceptedTermsAt));
  const [referralCode, setReferralCode] = useState<string>(() => {
    try {
      return localStorage.getItem('tadribi_pending_ref') || '';
    } catch {
      return '';
    }
  });
  const [referralStatus, setReferralStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setTrack(user.track || 'bilingual');
    setLevel(user.level || 'foundation');
    setPreferredLang(user.preferred_lang || lang);
    void fetchMyPrivateInfoDoc(user.uid).then((info) => {
      if (info.phone) setPhone(info.phone);
      if (info.wilaya) setWilaya(info.wilaya);
      if (info.city) setCity(info.city);
    });
  }, [user, lang]);

  useEffect(() => {
    const clean = referralCode.trim().toUpperCase();
    if (!clean || clean.length < 4) {
      setReferralStatus('idle');
      return;
    }
    const timer = window.setTimeout(() => {
      apiRequest<{ valid: boolean }>(`/api/referrals/validate?code=${encodeURIComponent(clean)}`)
        .then((res) => setReferralStatus(res.valid ? 'valid' : 'invalid'))
        .catch(() => setReferralStatus('idle'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [referralCode]);

  if (!user || !firebaseUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-[#6b787e]">
          {isAr ? 'يرجى تسجيل الدخول أولاً.' : 'Veuillez vous connecter d’abord.'}
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    if (cleanName.length < 2) {
      setError(isAr ? 'يرجى كتابة الاسم الكامل.' : 'Veuillez saisir votre nom complet.');
      return;
    }
    if (cleanPhone.length < 6) {
      setError(
        isAr
          ? 'يرجى إدخال رقم هاتف صالح للتواصل وتوثيق الاشتراكات.'
          : 'Veuillez saisir un numéro de téléphone valide.'
      );
      return;
    }
    if (!acceptedPrivacy || !acceptedTerms) {
      setError(
        isAr
          ? 'يجب الموافقة على سياسة الخصوصية واتفاقية الاستخدام للمتابعة.'
          : 'Vous devez accepter la politique de confidentialité et les conditions d’utilisation.'
      );
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      if (firebaseUser.displayName !== cleanName && auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
      }

      if (firebaseUser.emailVerified) {
        await updateMyProfileDoc(user.uid, {
          name: cleanName,
          track,
          preferredLang,
          level,
          profileCompleted: true,
          acceptedTermsAt: user.acceptedTermsAt || nowIso,
          acceptedPrivacyAt: user.acceptedPrivacyAt || nowIso,
        });
        await updateMyPrivateContactDoc(user.uid, {
          phone: cleanPhone,
          wilaya: wilaya.trim(),
          city: city.trim(),
        }).catch(() => {});
      }

      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        json: {
          name: cleanName,
          phone: cleanPhone,
          track,
          preferred_lang: preferredLang,
          level,
          teacher_category: level === 'teacher' ? teacherCategory : '',
          professor_specialty: level === 'professor' ? professorSpecialty.trim() : '',
        },
      }).catch(() => {});

      const cleanRef = referralCode.trim().toUpperCase();
      if (cleanRef) {
        await apiRequest('/api/referrals/claim', {
          method: 'POST',
          json: { code: cleanRef },
        })
          .then(() => {
            try {
              localStorage.removeItem('tadribi_pending_ref');
            } catch {
              // ignore
            }
          })
          .catch(() => {});
      }

      setLang(preferredLang);
      await refreshUser();
      navigate('dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر حفظ البيانات. حاول مرة أخرى.'
            : 'Erreur lors de la sauvegarde.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="addressp-box-white space-y-5">
        <div className="flex items-start gap-3 pb-3 border-b border-[#d8dfe2]">
          <div className="w-10 h-10 rounded-full bg-[#e2efbf] text-[#384D55] flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#384D55]">
              {isAr ? 'إكمال بيانات الحساب' : 'Compléter les informations du compte'}
            </h1>
            <p className="text-xs text-[#6b787e] mt-1">
              {isAr
                ? 'مرحباً بك! لإكمال تفعيل حسابك عبر Google / Apple، يرجى تأكيد بياناتك والشعبة والموافقة على شروط المنصة.'
                : 'Bienvenue ! Pour finaliser votre compte Google / Apple, confirmez vos coordonnées, votre filière et nos conditions.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'الاسم الكامل' : 'Nom complet'} <span className="required">*</span>
              </label>
              <input
                type="text"
                className="template-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                <span className="inline-flex items-center gap-1">
                  <PhoneCall className="w-3.5 h-3.5 text-[#83a329]" />
                  {isAr ? 'رقم الهاتف (موريتانيا أو دولي)' : 'Numéro de téléphone'}
                </span>{' '}
                <span className="required">*</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                className="template-input"
                placeholder="22 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'الشعبة / المسار' : 'Filière / Parcours'}
              </label>
              <select
                className="template-input"
                value={track}
                onChange={(e) => setTrack(e.target.value as 'arabic' | 'french' | 'bilingual')}
              >
                <option value="arabic">{isAr ? 'معلم عربي' : 'Instituteur Arabe'}</option>
                <option value="french">{isAr ? 'معلم فرنسي' : 'Instituteur Français'}</option>
                <option value="bilingual">{isAr ? 'معلم مزدوج' : 'Instituteur Bilingue'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'المستوى / الصفة التعليمية' : 'Niveau / Statut'}
              </label>
              <select
                className="template-input"
                value={level}
                onChange={(e) => setLevel(e.target.value as LevelSlug)}
              >
                {ALL_USER_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {lang === 'fr' ? opt.fr : lang === 'en' ? opt.en : opt.ar}
                  </option>
                ))}
              </select>
            </div>

            {level === 'teacher' && (
              <div>
                <label className="block text-xs font-bold text-[#384D55] mb-1">
                  {isAr ? 'التخصص التعليمي للمعلم' : 'Catégorie enseignant'}
                </label>
                <select
                  className="template-input"
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
              <div>
                <label className="block text-xs font-bold text-[#384D55] mb-1">
                  {isAr ? 'تخصص الأستاذ' : 'Spécialité du professeur'}
                </label>
                <input
                  type="text"
                  className="template-input"
                  placeholder={isAr ? 'مثال: الرياضيات / الفيزياء' : 'Ex : Mathématiques'}
                  value={professorSpecialty}
                  onChange={(e) => setProfessorSpecialty(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'لغة الواجهة المفضلة' : 'Langue préférée'}
              </label>
              <select
                className="template-input"
                value={preferredLang}
                onChange={(e) => setPreferredLang(e.target.value as Language)}
              >
                <option value="ar">العربية</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'الولاية / المدينة (اختياري)' : 'Wilaya / Ville (optionnel)'}
              </label>
              <input
                type="text"
                className="template-input"
                value={wilaya}
                placeholder={isAr ? 'مثال: نواكشوط' : 'Ex : Nouakchott'}
                onChange={(e) => {
                  setWilaya(e.target.value);
                  setCity(e.target.value);
                }}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'كود الإحالة (اختياري)' : 'Code de parrainage (optionnel)'}
              </label>
              <input
                type="text"
                dir="ltr"
                className="template-input"
                placeholder="TD-XXXXXXXX"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              />
              {referralStatus === 'valid' && (
                <p className="text-[11px] font-bold text-[#557a16] mt-1">
                  {isAr ? 'كود الإحالة صالح وسيتم ربطه بحسابك.' : 'Code valide.'}
                </p>
              )}
              {referralStatus === 'invalid' && (
                <p className="text-[11px] font-bold text-red-700 mt-1">
                  {isAr ? 'كود الإحالة غير صحيح.' : 'Code invalide.'}
                </p>
              )}
            </div>
          </div>

          <div className="bg-[#f7f9fa] border border-[#d8dfe2] rounded-[6px] p-3.5 space-y-2.5 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                className="mt-0.5 accent-[#83a329]"
              />
              <span className="text-[#384D55]">
                {isAr ? 'أوافق على ' : 'J’accepte la '}
                <button
                  type="button"
                  onClick={() => navigate('privacy')}
                  className="text-[#83a329] font-bold underline cursor-pointer"
                >
                  {isAr ? 'سياسة الخصوصية' : 'Politique de confidentialité'}
                </button>
                <span className="required">*</span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 accent-[#83a329]"
              />
              <span className="text-[#384D55]">
                {isAr ? 'أوافق على ' : 'J’accepte les '}
                <button
                  type="button"
                  onClick={() => navigate('terms')}
                  className="text-[#83a329] font-bold underline cursor-pointer"
                >
                  {isAr ? 'اتفاقية الاستخدام' : 'Conditions d’utilisation'}
                </button>
                <span className="required">*</span>
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-[11px] text-[#6b787e] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#83a329]" />
              <span>
                {isAr ? 'بياناتك محمية ومرتبطة بحسابك فقط.' : 'Vos données restent privées et sécurisées.'}
              </span>
            </div>
            <button type="submit" disabled={saving} className="imgsend2">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {saving
                  ? isAr
                    ? 'جارٍ الحفظ...'
                    : 'Enregistrement...'
                  : isAr
                    ? 'حفظ وإكمال الحساب'
                    : 'Enregistrer et continuer'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
