import React from 'react';
import { HelpCircle } from 'lucide-react';
import { AnimatedRingSvg, subjectSlugToIconKey } from '../components/AnimatedRingIcons';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { TrackSlug } from '../types';

export const AllSubjectsPage: React.FC = () => {
  const { lang, selectedTrack, setSelectedTrack, catalog, navigate } = useApp();
  const t = getT(lang);

  const countMap = new Map<string, number>();
  catalog.bankStats.bySubject.forEach((s) => countMap.set(s.subject_slug, s.count));

  const lessonCountMap = new Map<string, number>();
  catalog.lessons.forEach((l) => {
    lessonCountMap.set(l.subject_slug, (lessonCountMap.get(l.subject_slug) || 0) + 1);
  });

  const filteredSubjects = catalog.subjects.filter(
    (s) => selectedTrack === 'all' || s.tracks.includes('all') || s.tracks.includes(selectedTrack)
  );

  return (
    <div className="ht-icons">
      <div className="wrap">
        <div className="head justify-between flex-wrap">
          <div className="flex items-baseline gap-3">
            <h2>{t.allSubjectsTitle}</h2>
            <button type="button" onClick={() => navigate('lessons')}>
              {t.seeMore}
            </button>
          </div>
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value as TrackSlug)}
            className="template-pill-select px-3 py-1.5 text-xs font-bold border border-[#d8dfe2] outline-none cursor-pointer"
            aria-label={t.navTracks}
          >
            <option value="all">{t.allTracks}</option>
            <option value="arabic">{t.trackArabic}</option>
            <option value="french">{t.trackFrench}</option>
            <option value="bilingual">{t.trackBilingual}</option>
          </select>
        </div>

        <div className="grid">
          {filteredSubjects.map((sub, idx) => {
            const qCount = countMap.get(sub.slug) || 0;
            const lCount = lessonCountMap.get(sub.slug) || 0;

            return (
              <div
                key={sub.id}
                className="item"
                style={{ '--i': idx } as React.CSSProperties}
              >
                <button
                  type="button"
                  onClick={() => navigate('lessons', { subjectSlug: sub.slug })}
                  className="ring cursor-pointer bg-transparent border-0 p-0"
                  aria-label={lang === 'ar' ? sub.name_ar : sub.name_fr}
                >
                  <AnimatedRingSvg
                    iconKey={subjectSlugToIconKey(sub.slug)}
                    uid={`allsub-${sub.slug}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('lessons', { subjectSlug: sub.slug })}
                  className="lbl cursor-pointer bg-transparent border-0 p-0"
                >
                  {lang === 'ar' ? sub.name_ar : sub.name_fr}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('question-bank', { subjectSlug: sub.slug })}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6f7468] hover:text-[#5c7a2b] cursor-pointer bg-transparent border-0 p-0 tabular-nums"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>
                    {lCount} {lang === 'ar' ? 'درس' : 'leçons'} · {qCount} {lang === 'ar' ? 'سؤال' : 'Q'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
