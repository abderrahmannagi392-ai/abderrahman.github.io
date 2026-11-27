import type { Language, LevelSlug } from '../types';

export interface LevelOption {
  value: LevelSlug;
  ar: string;
  fr: string;
  en: string;
}

export const ALL_USER_LEVEL_OPTIONS: LevelOption[] = [
  { value: 'foundation', ar: 'المستوى التأسيسي (التدريب الحر)', fr: 'Niveau Fondamental', en: 'Foundation Level' },
  { value: 'intermediate', ar: 'المستوى المتوسط (التدريب الحر)', fr: 'Niveau Intermédiaire', en: 'Intermediate Level' },
  { value: 'advanced', ar: 'المستوى المتقدم (التدريب الحر)', fr: 'Niveau Avancé', en: 'Advanced Level' },
  { value: 'prep_student', ar: 'تلميذ (الإعدادية)', fr: 'Élève (Collège)', en: 'Middle School Student' },
  { value: 'highschool_student', ar: 'طالب ثانوي (الثانوية)', fr: 'Lycéen (Secondaire)', en: 'High School Student' },
  { value: 'university_student', ar: 'طالب جامعي', fr: 'Étudiant Universitaire', en: 'University Student' },
  { value: 'teacher', ar: 'معلم (تربية / تعليم أساسي)', fr: 'Instituteur / Enseignant', en: 'School Teacher' },
  { value: 'professor', ar: 'أستاذ (تعليم ثانوي / عالي)', fr: 'Professeur', en: 'Professor / Lecturer' },
];

export const TEACHER_CATEGORY_OPTIONS: Array<{ value: 'bilingual' | 'arabic' | 'french'; ar: string; fr: string; en: string }> = [
  { value: 'bilingual', ar: 'معلم مزدوج (عربي / فرنسي)', fr: 'Instituteur Bilingue', en: 'Bilingual Teacher' },
  { value: 'arabic', ar: 'معلم عربي', fr: 'Instituteur Arabe', en: 'Arabic Track Teacher' },
  { value: 'french', ar: 'معلم فرنسي', fr: 'Instituteur Français', en: 'French Track Teacher' },
];

export const PROFESSOR_SPECIALTY_OPTIONS: Array<{ value: string; ar: string; fr: string; en: string }> = [
  { value: 'mathematics', ar: 'الرياضيات', fr: 'Mathématiques', en: 'Mathematics' },
  { value: 'physics_chemistry', ar: 'الفيزياء والكيمياء', fr: 'Physique-Chimie', en: 'Physics & Chemistry' },
  { value: 'natural_sciences', ar: 'العلوم الطبيعية', fr: 'Sciences Naturelles', en: 'Natural Sciences' },
  { value: 'arabic_literature', ar: 'اللغة والأدب العربي', fr: 'Langue et Littérature Arabe', en: 'Arabic Language & Literature' },
  { value: 'french_language', ar: 'اللغة الفرنسية', fr: 'Langue Française', en: 'French Language' },
  { value: 'english_language', ar: 'اللغة الإنجليزية', fr: 'Langue Anglaise', en: 'English Language' },
  { value: 'islamic_education', ar: 'التربية الإسلامية', fr: 'Éducation Islamique', en: 'Islamic Education' },
  { value: 'philosophy', ar: 'الفلسفة', fr: 'Philosophie', en: 'Philosophy' },
  { value: 'history_geography', ar: 'التاريخ والجغرافيا', fr: 'Histoire-Géographie', en: 'History & Geography' },
  { value: 'computer_science', ar: 'المعلوماتية', fr: 'Informatique', en: 'Computer Science' },
  { value: 'other', ar: 'تخصص آخر', fr: 'Autre spécialité', en: 'Other Specialty' },
];

export function formatUserLevelLabel(
  level: string | undefined | null,
  teacherCategory?: string | null,
  professorSpecialty?: string | null,
  lang: Language = 'ar'
): string {
  const found = ALL_USER_LEVEL_OPTIONS.find((o) => o.value === level);
  const base = found ? (lang === 'fr' ? found.fr : lang === 'en' ? found.en : found.ar) : level || '—';

  if (level === 'teacher' && teacherCategory) {
    const tc = TEACHER_CATEGORY_OPTIONS.find((c) => c.value === teacherCategory);
    if (tc) {
      return `${base} — ${lang === 'fr' ? tc.fr : lang === 'en' ? tc.en : tc.ar}`;
    }
  }
  if (level === 'professor' && professorSpecialty?.trim()) {
    const sp = PROFESSOR_SPECIALTY_OPTIONS.find((s) => s.value === professorSpecialty.trim());
    const spLabel = sp ? (lang === 'fr' ? sp.fr : lang === 'en' ? sp.en : sp.ar) : professorSpecialty.trim();
    return `${base} — ${spLabel}`;
  }
  return base;
}

export function formatUserLevelDisplay(
  lang: Language,
  level: string | undefined | null,
  teacherCategory?: string | null,
  professorSpecialty?: string | null
): string {
  return formatUserLevelLabel(level, teacherCategory, professorSpecialty, lang);
}
