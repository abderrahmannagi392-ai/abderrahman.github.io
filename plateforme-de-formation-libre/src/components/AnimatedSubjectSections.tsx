import React from 'react';
import { useApp } from '../context/AppContext';
import { AnimatedRingSvg, subjectSlugToIconKey } from './AnimatedRingIcons';

const FALLBACK_SLUGS = [
  'arabic-lang',
  'mathematics',
  'natural-sciences',
  'islamic-education',
  'education-sciences',
  'educational-psychology',
];

export const AnimatedSubjectSections: React.FC = () => {
  const { lang, selectedTrack, catalog, navigate } = useApp();

  const visibleSubjects = catalog.subjects
    .filter((sub) => selectedTrack === 'all' || sub.tracks.length === 0 || sub.tracks.includes(selectedTrack))
    .slice(0, 6);

  return (
    <div className="ht-icons">
      <div className="wrap !pt-4 !pb-6">
        <section>
          <div className="head">
            <h2>{lang === 'ar' ? 'المواد والتخصصات الرسمية' : 'Matières et spécialités officielles'}</h2>
            <button type="button" onClick={() => navigate('all-subjects')}>
              {lang === 'ar' ? 'مشاهدة المزيد »' : 'Voir plus »'}
            </button>
          </div>

          <div className="grid">
            {visibleSubjects.length > 0
              ? visibleSubjects.map((sub, idx) => (
                  <button
                    key={sub.slug}
                    type="button"
                    className="item"
                    style={{ '--i': idx } as React.CSSProperties}
                    onClick={() => navigate('lessons', { subjectSlug: sub.slug })}
                  >
                    <div className="ring">
                      <AnimatedRingSvg iconKey={subjectSlugToIconKey(sub.slug)} uid={`sub-${sub.slug}`} />
                    </div>
                    <span className="lbl">{lang === 'ar' ? sub.name_ar : sub.name_fr}</span>
                  </button>
                ))
              : FALLBACK_SLUGS.map((slug, idx) => (
                  <button
                    key={slug}
                    type="button"
                    className="item"
                    style={{ '--i': idx } as React.CSSProperties}
                    onClick={() => navigate('lessons', { subjectSlug: slug })}
                  >
                    <div className="ring">
                      <AnimatedRingSvg iconKey={subjectSlugToIconKey(slug)} uid={`sub-fb-${slug}`} />
                    </div>
                    <span className="lbl">{slug}</span>
                  </button>
                ))}
          </div>
        </section>
      </div>
    </div>
  );
};

