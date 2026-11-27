import React, { useMemo, useState } from 'react';
import { Check, Printer, Search } from 'lucide-react';
import { AnimatedRingSvg, subjectSlugToIconKey } from '../components/AnimatedRingIcons';
import { AudioPlayerBar } from '../components/AudioPlayerBar';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { TrackSlug } from '../types';

export const SummariesPage: React.FC = () => {
  const { lang, selectedTrack, setSelectedTrack, catalog, viewParams } = useApp();
  const t = getT(lang);

  const [subjectFilter, setSubjectFilter] = useState(viewParams.subjectSlug || 'all');
  const [search, setSearch] = useState(viewParams.search || '');

  React.useEffect(() => {
    if (viewParams.subjectSlug !== undefined) setSubjectFilter(viewParams.subjectSlug);
    if (viewParams.search !== undefined) setSearch(viewParams.search);
  }, [viewParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.summaries.filter((sm) => {
      const trackMatch =
        selectedTrack === 'all' ||
        sm.track === 'all' ||
        sm.track === selectedTrack ||
        (selectedTrack === 'bilingual' && (sm.track === 'arabic' || sm.track === 'french' || sm.track === 'bilingual'));
      const subMatch = subjectFilter === 'all' || sm.subject_slug === subjectFilter;
      const qMatch =
        !q ||
        sm.title_ar.toLowerCase().includes(q) ||
        sm.title_fr.toLowerCase().includes(q) ||
        sm.content_ar.toLowerCase().includes(q) ||
        sm.content_fr.toLowerCase().includes(q);
      return trackMatch && subMatch && qMatch;
    });
  }, [catalog.summaries, selectedTrack, subjectFilter, search]);

  const subjectName = (slug: string) => {
    const sub = catalog.subjects.find((s) => s.slug === slug);
    return sub ? (lang === 'ar' ? sub.name_ar : sub.name_fr) : slug;
  };

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box mb-0">
        <div className="rotator-box-header">
          <span>{t.navSummaries}</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="imgsend2-secondary text-xs py-1.5 px-3"
          >
            <Printer className="w-4 h-4 text-[#557a16]" />
            <span>{lang === 'ar' ? 'طباعة / حفظ كملف PDF' : 'Imprimer / Exporter PDF'}</span>
          </button>
        </div>

        <p className="text-xs text-[#6b787e] mb-3">
          {lang === 'ar'
            ? 'ملخصات مركزة للمراجعة السريعة قبل المسابقة مع النقاط الأساسية والقراءة الصوتية.'
            : 'Fiches de révision synthétiques avec points essentiels, impression et lecture audio.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#6b787e] absolute top-2.5 start-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="template-input ps-8"
            />
          </div>
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value as TrackSlug)}
            className="template-input"
          >
            <option value="all">{t.allTracks}</option>
            <option value="arabic">{t.trackArabic}</option>
            <option value="french">{t.trackFrench}</option>
            <option value="bilingual">{t.trackBilingual}</option>
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="template-input"
          >
            <option value="all">{lang === 'ar' ? 'كل المواد' : 'Toutes les matières'}</option>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {lang === 'ar' ? s.name_ar : s.name_fr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="addressp-box text-center text-sm text-[#6b787e]">{t.emptyState}</div>
      ) : (
        <div className="ht-icons edu-copy-protected">
          <div className="ht-grid2">
            {filtered.map((sm, idx) => (
              <article
                key={sm.id}
                className="ht-card !items-stretch !text-start"
                style={{ '--i': idx } as React.CSSProperties}
              >
                <div className="flex flex-col items-center text-center gap-2 pb-2 border-b border-[#eceee6]">
                  <div className="ring">
                    <AnimatedRingSvg
                      iconKey={subjectSlugToIconKey(sm.subject_slug)}
                      uid={`sum-page-${sm.id}`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-[#6f7468]">
                    <span className="text-[#5c7a2b]">{subjectName(sm.subject_slug)}</span>
                    <span>·</span>
                    <span>{sm.level}</span>
                  </div>
                  <h2 className="text-base font-extrabold text-[#3d3d3d]">
                    {lang === 'ar' ? sm.title_ar : sm.title_fr}
                  </h2>
                </div>

                <p className="text-xs sm:text-sm text-[#4a5c64] leading-relaxed">
                  {lang === 'ar' ? sm.content_ar : sm.content_fr}
                </p>

                {sm.key_points?.length > 0 && (
                  <ul className="bg-[#f7f8f4] border border-[#e2e7d8] rounded-[10px] p-3 space-y-1.5">
                    {sm.key_points.map((kp, kIdx) => (
                      <li key={kIdx} className="flex items-start gap-2 text-xs text-[#3d3d3d]">
                        <Check className="w-3.5 h-3.5 text-[#a4c93a] shrink-0 mt-0.5" />
                        <span>{lang === 'ar' ? kp.ar : kp.fr}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto pt-2">
                  <AudioPlayerBar
                    compact
                    audioId={`summary-${sm.id}`}
                    arabicSpeechText={`${sm.title_ar}. ${sm.content_speech_ar || sm.content_ar}`}
                    arabicFallbackText={`${sm.title_ar}. ${sm.content_ar}`}
                    frenchText={`${sm.title_fr}. ${sm.content_fr}`}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
