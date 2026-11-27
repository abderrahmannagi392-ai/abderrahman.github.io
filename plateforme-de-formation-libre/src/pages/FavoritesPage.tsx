import React from 'react';
import { BookOpen, Heart, HeartOff, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { setLessonProgressDoc } from '../lib/firestoreService';

export const FavoritesPage: React.FC = () => {
  const { lang, catalog, user, firebaseUser, navigate } = useApp();
  const isAr = lang === 'ar';

  const favoriteLessons = catalog.lessons.filter((l) => Boolean(l.is_favorite));

  const toggleFavorite = async (lessonIdKey: string, completed: boolean) => {
    if (!firebaseUser) return;
    await setLessonProgressDoc(firebaseUser.uid, lessonIdKey, completed, false).catch(() => {});
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-5">
      <div className="addressp-box-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#e2efbf] text-[#384D55] flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-[#83a329]" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#384D55]">
              {isAr ? 'الدروس والموضوعات المفضلة' : 'Leçons favorites'}
            </h1>
            <p className="text-xs text-[#6b787e]">
              {isAr
                ? 'احتفظ بالدروس المهمة للعودة السريعة إليها أثناء المراجعة.'
                : 'Retrouvez rapidement vos leçons enregistrées pour la révision.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('lessons')}
          className="imgsend2-secondary text-xs"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{isAr ? 'استعراض جميع الدروس' : 'Toutes les leçons'}</span>
        </button>
      </div>

      {!user ? (
        <div className="addressp-box-white text-center py-10 space-y-3">
          <p className="text-sm font-bold text-[#384D55]">
            {isAr
              ? 'سجّل الدخول لحفظ الدروس في المفضلة ومزامنتها عبر أجهزتك.'
              : 'Connectez-vous pour enregistrer et synchroniser vos favoris.'}
          </p>
          <button type="button" onClick={() => navigate('login')} className="imgsend2 text-xs">
            {isAr ? 'تسجيل الدخول' : 'Connexion'}
          </button>
        </div>
      ) : favoriteLessons.length === 0 ? (
        <div className="addressp-box-white text-center py-12 space-y-3">
          <Heart className="w-10 h-10 text-[#6b787e] mx-auto opacity-60" />
          <p className="text-sm font-bold text-[#384D55]">
            {isAr ? 'لا توجد دروس في المفضلة حالياً.' : 'Aucune leçon dans vos favoris.'}
          </p>
          <p className="text-xs text-[#6b787e]">
            {isAr
              ? 'اضغط على أيقونة القلب داخل أي درس لإضافته هنا.'
              : 'Cliquez sur le cœur dans une leçon pour l’ajouter ici.'}
          </p>
          <button type="button" onClick={() => navigate('lessons')} className="imgsend2 text-xs">
            {isAr ? 'الانتقال إلى الدروس' : 'Aller aux leçons'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {favoriteLessons.map((lesson) => {
            const lessonKey = lesson.firestoreId || String(lesson.id);
            return (
              <div
                key={lessonKey}
                className="bg-white border border-[#d8dfe2] rounded-[6px] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#6b787e]">
                    <span className="px-2 py-0.5 rounded bg-[#efefef] font-bold text-[#384D55]">
                      {lesson.subject_slug}
                    </span>
                    <span className="font-semibold">
                      {lesson.level === 'advanced'
                        ? isAr
                          ? 'متقدم'
                          : 'Avancé'
                        : lesson.level === 'intermediate'
                          ? isAr
                            ? 'متوسط'
                            : 'Intermédiaire'
                          : isAr
                            ? 'تأسيسي'
                            : 'Fondamental'}
                    </span>
                  </div>
                  <h2 className="text-sm font-extrabold text-[#384D55]">
                    {isAr ? lesson.title_ar : lesson.title_fr || lesson.title_ar}
                  </h2>
                  <p className="text-xs text-[#6b787e] line-clamp-2">
                    {isAr ? lesson.summary_ar : lesson.summary_fr || lesson.summary_ar}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#efefef]">
                  <button
                    type="button"
                    onClick={() => navigate('lessons', { lessonId: lesson.id })}
                    className="imgsend2 text-xs flex-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isAr ? 'فتح الدرس' : 'Ouvrir'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(lessonKey, Boolean(lesson.completed))}
                    className="imgsend2-secondary text-xs text-red-600"
                    title={isAr ? 'إزالة من المفضلة' : 'Retirer'}
                  >
                    <HeartOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
