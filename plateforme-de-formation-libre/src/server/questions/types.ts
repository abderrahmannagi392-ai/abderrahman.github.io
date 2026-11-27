export type QuestionType = 'mcq' | 'true_false' | 'short_answer' | 'essay';
export type ContentStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

export interface ExtendedSeedQuestion {
  subject_slug: string;
  track: 'arabic' | 'french' | 'bilingual' | 'all';
  level: 'foundation' | 'intermediate' | 'advanced';
  axis_ar?: string;
  axis_fr?: string;
  lesson_id?: number | null;
  topic_ar: string;
  topic_fr: string;
  skill_ar: string;
  skill_fr: string;
  question_type?: QuestionType;
  difficulty: 'easy' | 'medium' | 'hard';
  stem_ar: string;
  stem_speech_ar?: string;
  stem_fr: string;
  options_ar: string[];
  options_speech_ar?: string[];
  options_fr: string[];
  correct_index: number;
  answer_ar?: string;
  answer_speech_ar?: string;
  answer_fr?: string;
  explanation_ar: string;
  explanation_speech_ar?: string;
  explanation_fr: string;
  exam_ref?: string;
  target_competition?: string;
  content_status?: ContentStatus;
}
