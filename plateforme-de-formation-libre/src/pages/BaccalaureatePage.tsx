import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  GraduationCap,
  Image as ImageIcon,
  Play,
  Plus,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { BacCoefficientItem, BacSeriesItem, Lesson } from '../types';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';
import {
  downloadBacResultJpg,
  printBacResult,
  type BacResultExportData,
} from '../utils/receiptDocument';

interface CustomBacSubject {
  id: string;
  name: string;
  coefficient: number;
  grade: string;
}

function playCelebrationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.075, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.38);
    });
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Web Audio unavailable or blocked by autoplay policy
  }
}

export const BaccalaureatePage: React.FC = () => {
  const { lang, viewParams, navigate } = useApp();
  const isAr = lang === 'ar';

  const [seriesList, setSeriesList] = useState<BacSeriesItem[]>([]);
  const [coefficients, setCoefficients] = useState<BacCoefficientItem[]>([]);
  const [bacLessons, setBacLessons] = useState<Lesson[]>([]);
  const [bacQuestionsCount, setBacQuestionsCount] = useState(0);
  const [selectedSeries, setSelectedSeries] = useState<string>(viewParams.bacSeries || 'bac-sn');
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [allowCustomCoeffs, setAllowCustomCoeffs] = useState(false);
  const [customCoeffs, setCustomCoeffs] = useState<Record<number, string>>({});
  const [customSubjectsBySeries, setCustomSubjectsBySeries] = useState<Record<string, CustomBacSubject[]>>({});
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCoeff, setNewSubjCoeff] = useState('2');
  const [newSubjGrade, setNewSubjGrade] = useState('');
  const [exportBusy, setExportBusy] = useState<'pdf' | 'jpg' | 'print' | null>(null);
  const [loading, setLoading] = useState(true);
  const prevPassingRef = useRef(false);

  useEffect(() => {
    let active = true;
    apiRequest<{
      series: BacSeriesItem[];
      coefficients: BacCoefficientItem[];
      lessons: Lesson[];
      bacQuestionsCount: number;
    }>('/api/baccalaureate/catalog')
      .then((res) => {
        if (!active) return;
        setSeriesList(res.series || []);
        setCoefficients(res.coefficients || []);
        setBacLessons(res.lessons || []);
        setBacQuestionsCount(Number(res.bacQuestionsCount || 0));
        if (viewParams.bacSeries && res.series?.some((s) => s.slug === viewParams.bacSeries)) {
          setSelectedSeries(viewParams.bacSeries);
        } else if (res.series?.[0]) {
          setSelectedSeries((prev) =>
            res.series.some((s) => s.slug === prev) ? prev : res.series[0].slug
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [viewParams.bacSeries]);

  const seriesCoeffs = useMemo(
    () => coefficients.filter((c) => c.series_slug === selectedSeries),
    [coefficients, selectedSeries]
  );

  const customSubjects = useMemo(
    () => customSubjectsBySeries[selectedSeries] || [],
    [customSubjectsBySeries, selectedSeries]
  );

  const seriesLessons = useMemo(
    () =>
      bacLessons.filter(
        (l) =>
          l.series_slugs?.includes(selectedSeries) ||
          l.subject_slug === selectedSeries ||
          l.subject_slug.startsWith(selectedSeries)
      ),
    [bacLessons, selectedSeries]
  );

  const getEffectiveCoeff = (c: BacCoefficientItem) => {
    if (!allowCustomCoeffs) return c.coefficient;
    const raw = customCoeffs[c.id];
    if (raw === undefined || raw === '') return c.coefficient;
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return c.coefficient;
    return Math.min(20, parsed);
  };

  const handleAddCustomSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSubjName.trim();
    if (!cleanName) return;
    const parsedCoeff = Number(newSubjCoeff);
    const coeff =
      Number.isFinite(parsedCoeff) && parsedCoeff > 0 ? Math.min(20, Math.max(0.5, parsedCoeff)) : 2;
    const newRow: CustomBacSubject = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      coefficient: coeff,
      grade: newSubjGrade.trim(),
    };
    setCustomSubjectsBySeries((prev) => ({
      ...prev,
      [selectedSeries]: [...(prev[selectedSeries] || []), newRow],
    }));
    setNewSubjName('');
    setNewSubjCoeff('2');
    setNewSubjGrade('');
    setAddingSubject(false);
  };

  const handleUpdateCustomSubject = (
    id: string,
    patch: Partial<Pick<CustomBacSubject, 'coefficient' | 'grade'>>
  ) => {
    setCustomSubjectsBySeries((prev) => ({
      ...prev,
      [selectedSeries]: (prev[selectedSeries] || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  };

  const handleRemoveCustomSubject = (id: string) => {
    setCustomSubjectsBySeries((prev) => ({
      ...prev,
      [selectedSeries]: (prev[selectedSeries] || []).filter((item) => item.id !== id),
    }));
  };

  const gpaStats = useMemo(() => {
    let weightedSum = 0;
    let totalCoeff = 0;
    let bonusPoints = 0;
    let enteredCount = 0;

    for (const c of seriesCoeffs) {
      const effCoeff = getEffectiveCoeff(c);
      const raw = Number(grades[c.subject_slug]);
      if (Number.isNaN(raw) || grades[c.subject_slug] === undefined || grades[c.subject_slug] === '') {
        continue;
      }
      enteredCount++;
      const clamped = Math.max(0, Math.min(c.max_grade || 20, raw));
      if (c.is_optional) {
        if (clamped > 10) {
          bonusPoints += (clamped - 10) * effCoeff;
        }
      } else {
        weightedSum += clamped * effCoeff;
        totalCoeff += effCoeff;
      }
    }

    for (const cs of customSubjects) {
      const raw = Number(cs.grade);
      if (cs.grade === '' || Number.isNaN(raw)) continue;
      enteredCount++;
      const clamped = Math.max(0, Math.min(20, raw));
      const coeff = Math.max(0.5, Math.min(20, cs.coefficient || 1));
      weightedSum += clamped * coeff;
      totalCoeff += coeff;
    }

    const totalPossibleCoeff =
      seriesCoeffs
        .filter((c) => !c.is_optional)
        .reduce((acc, c) => acc + getEffectiveCoeff(c), 0) +
      customSubjects.reduce((acc, cs) => acc + Math.max(0.5, Math.min(20, cs.coefficient || 1)), 0);

    const denominator = totalCoeff > 0 ? totalCoeff : totalPossibleCoeff;
    const avg = denominator > 0 ? Math.min(20, (weightedSum + bonusPoints) / denominator) : 0;

    let mentionAr = 'غير ناجح';
    let mentionFr = 'Ajourné';
    if (avg >= 16) {
      mentionAr = 'تقدير حسن جداً';
      mentionFr = 'Mention Très Bien';
    } else if (avg >= 14) {
      mentionAr = 'تقدير حسن';
      mentionFr = 'Mention Bien';
    } else if (avg >= 12) {
      mentionAr = 'تقدير قريب من الحسن';
      mentionFr = 'Mention Assez Bien';
    } else if (avg >= 10) {
      mentionAr = 'عتبة النجاح (مقبول)';
      mentionFr = 'Seuil de réussite (Passable)';
    } else if (avg >= 8) {
      mentionAr = 'دورة استدراكية (التكملة)';
      mentionFr = 'Session complémentaire';
    }

    return {
      avg,
      enteredCount,
      weightedSum: weightedSum + bonusPoints,
      enteredCoeff: totalCoeff,
      totalPossibleCoeff,
      mentionAr,
      mentionFr,
    };
  }, [seriesCoeffs, customSubjects, grades, allowCustomCoeffs, customCoeffs]);

  // Subtle celebratory chime when crossing into passing average (>= 10)
  useEffect(() => {
    const isPassing = gpaStats.enteredCount > 0 && gpaStats.avg >= 10;
    if (isPassing && !prevPassingRef.current) {
      playCelebrationChime();
    }
    prevPassingRef.current = isPassing;
  }, [gpaStats.avg, gpaStats.enteredCount]);

  const activeSeriesObj = seriesList.find((s) => s.slug === selectedSeries);

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
      <div className="addressp-box-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-[#e2efbf] text-[#384D55] flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6 text-[#83a329]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55]">
              {isAr ? 'قسم الباكالوريا الموريتانية' : 'Espace Baccalauréat Mauritanien'}
            </h1>
            <p className="text-xs text-[#6b787e] mt-1">
              {isAr
                ? 'الشعب الأربع المعتمدة (SN، M/C، LM، LO) — دروس مركزة، معاملات رسمية، وحاسبة المعدل من 20.'
                : 'Séries SN, M/C, LM et LO — Leçons ciblées, coefficients officiels et calculateur de moyenne /20.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] font-bold text-[#384D55]">
            {isAr ? `أسئلة الباكالوريا الموثقة: ${bacQuestionsCount}` : `Questions Bac : ${bacQuestionsCount}`}
          </span>
          <button
            type="button"
            onClick={() => navigate('question-bank', { subjectSlug: selectedSeries })}
            className="imgsend2 text-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isAr ? 'بنك أسئلة الشعبة' : 'Banque de la série'}</span>
          </button>
        </div>
      </div>

      {/* 4-Series Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {seriesList.map((s) => {
          const active = s.slug === selectedSeries;
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => setSelectedSeries(s.slug)}
              className={`text-start p-4 rounded-[6px] border-2 transition-all cursor-pointer ${
                active
                  ? 'border-[#A6CE39] bg-[#f9fcf2] shadow-xs'
                  : 'border-[#d8dfe2] bg-white hover:border-[#83a329]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded bg-[#384D55] text-white text-xs font-extrabold">
                  {s.code}
                </span>
                {active && <CheckCircle2 className="w-4 h-4 text-[#83a329]" />}
              </div>
              <div className="font-extrabold text-sm text-[#384D55]">
                {isAr ? s.name_ar : s.name_fr}
              </div>
              <p className="text-xs text-[#6b787e] mt-1 line-clamp-2">
                {isAr ? s.description_ar : s.description_fr}
              </p>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="addressp-box-white text-center py-8 text-xs text-[#6b787e]">
          {isAr ? 'جارٍ تحميل بيانات الباكالوريا...' : 'Chargement...'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Mauritanian Baccalaureate GPA Calculator */}
          <div className="lg:col-span-7 addressp-box-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-[#83a329]" />
                <h2 className="text-base font-extrabold text-[#384D55]">
                  {isAr
                    ? `حاسبة معدل الباكالوريا — ${activeSeriesObj?.name_ar || selectedSeries}`
                    : `Calculateur de moyenne — ${activeSeriesObj?.name_fr || selectedSeries}`}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5 font-bold text-[#384D55] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowCustomCoeffs}
                    onChange={(e) => setAllowCustomCoeffs(e.target.checked)}
                    className="accent-[#384D55]"
                  />
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#83a329]" />
                  <span>{isAr ? 'تعديل المعاملات للتجربة' : 'Ajuster les coeff.'}</span>
                </label>
                {allowCustomCoeffs && Object.keys(customCoeffs).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomCoeffs({})}
                    className="inline-flex items-center gap-1 font-bold text-[#83a329] hover:text-[#384D55] cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isAr ? 'استعادة المعاملات الرسمية' : 'Rétablir officiels'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGrades({})}
                  className="font-bold text-[#6b787e] hover:text-[#384D55] underline cursor-pointer"
                >
                  {isAr ? 'إعادة تصفير النقاط' : 'Réinitialiser'}
                </button>
              </div>
            </div>

            {allowCustomCoeffs && (
              <div className="px-3 py-2 rounded bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-900 flex items-center justify-between gap-2">
                <span>
                  {isAr
                    ? 'للتقدير الشخصي فقط — لا يغيّر المعاملات الرسمية'
                    : 'Pour estimation personnelle uniquement — ne modifie pas les coefficients officiels'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCustomCoeffs({});
                    setAllowCustomCoeffs(false);
                  }}
                  className="underline shrink-0 cursor-pointer"
                >
                  {isAr ? 'إغلاق التعديل' : 'Désactiver'}
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f7f9fa] border-b border-[#d8dfe2] text-[#384D55]">
                    <th className="p-2.5 text-start font-extrabold">{isAr ? 'المادة' : 'Matière'}</th>
                    <th className="p-2.5 text-center font-extrabold">{isAr ? 'المعامل' : 'Coeff.'}</th>
                    <th className="p-2.5 text-center font-extrabold">{isAr ? 'النقطة / 20' : 'Note / 20'}</th>
                    <th className="p-2.5 text-center font-extrabold">{isAr ? 'المجموع' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesCoeffs.map((c) => {
                    const effCoeff = getEffectiveCoeff(c);
                    const valStr = grades[c.subject_slug] ?? '';
                    const num = Number(valStr);
                    const valid = valStr !== '' && !Number.isNaN(num);
                    const clamped = valid ? Math.max(0, Math.min(c.max_grade || 20, num)) : 0;
                    const rowTotal = c.is_optional
                      ? clamped > 10
                        ? (clamped - 10) * effCoeff
                        : 0
                      : clamped * effCoeff;
                    return (
                      <tr key={c.id} className="border-b border-[#efefef]">
                        <td className="p-2.5 font-bold text-[#384D55]">
                          {isAr ? c.subject_name_ar : c.subject_name_fr}
                          {c.is_optional ? (
                            <span className="ms-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[#efefef] text-[#6b787e]">
                              {isAr ? 'اختيارية' : 'Option'}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-[#384D55]">
                          {allowCustomCoeffs ? (
                            <input
                              type="number"
                              min={0.5}
                              max={20}
                              step="0.5"
                              dir="ltr"
                              value={customCoeffs[c.id] ?? String(c.coefficient)}
                              onChange={(e) =>
                                setCustomCoeffs((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              aria-label={isAr ? `معامل ${c.subject_name_ar}` : `Coefficient ${c.subject_name_fr}`}
                              className="w-16 h-7 px-1.5 text-center border border-[#A6CE39] rounded bg-white text-[#384D55] font-mono text-xs"
                            />
                          ) : (
                            c.coefficient
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={c.max_grade || 20}
                            step="0.25"
                            dir="ltr"
                            value={valStr}
                            onChange={(e) =>
                              setGrades((prev) => ({
                                ...prev,
                                [c.subject_slug]: e.target.value,
                              }))
                            }
                            placeholder="0 - 20"
                            className="w-20 h-8 px-2 text-center border border-[#c9d0d3] rounded bg-white text-[#384D55] font-mono"
                          />
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-[#83a329]">
                          {valid ? rowTotal.toFixed(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {customSubjects.map((cs) => {
                    const num = Number(cs.grade);
                    const valid = cs.grade !== '' && !Number.isNaN(num);
                    const clamped = valid ? Math.max(0, Math.min(20, num)) : 0;
                    const coeff = Math.max(0.5, Math.min(20, cs.coefficient || 1));
                    const rowTotal = clamped * coeff;
                    return (
                      <tr key={cs.id} className="border-b border-[#efefef] bg-[#f9fcf2]">
                        <td className="p-2.5 font-bold text-[#384D55]">
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              {cs.name}
                              <span className="ms-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[#e2efbf] text-[#2c4a12]">
                                {tr(lang, 'مضافة', 'Perso', 'Custom')}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomSubject(cs.id)}
                              className="text-red-600 hover:text-red-800 p-1 cursor-pointer"
                              title={tr(lang, 'حذف المادة', 'Supprimer', 'Remove')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-[#384D55]">
                          <input
                            type="number"
                            min={0.5}
                            max={20}
                            step="0.5"
                            dir="ltr"
                            value={cs.coefficient}
                            onChange={(e) => {
                              const parsed = Number(e.target.value);
                              handleUpdateCustomSubject(cs.id, {
                                coefficient: Number.isFinite(parsed) && parsed > 0 ? Math.min(20, parsed) : 1,
                              });
                            }}
                            aria-label={cs.name}
                            className="w-16 h-7 px-1.5 text-center border border-[#A6CE39] rounded bg-white text-[#384D55] font-mono text-xs"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step="0.25"
                            dir="ltr"
                            value={cs.grade}
                            onChange={(e) =>
                              handleUpdateCustomSubject(cs.id, { grade: e.target.value })
                            }
                            placeholder="0 - 20"
                            className="w-20 h-8 px-2 text-center border border-[#c9d0d3] rounded bg-white text-[#384D55] font-mono"
                          />
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-[#83a329]">
                          {valid ? rowTotal.toFixed(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Custom Subject Add Control */}
            <div className="space-y-2">
              {!addingSubject ? (
                <button
                  type="button"
                  onClick={() => setAddingSubject(true)}
                  className="imgsend2-secondary !py-1.5 !px-3 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr(lang, '+ إضافة مادة للتجربة', '+ Ajouter une matière', '+ Add Subject')}</span>
                </button>
              ) : (
                <form
                  onSubmit={handleAddCustomSubject}
                  className="p-3 rounded-[5px] bg-[#f7f9fa] border border-[#d8dfe2] grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs"
                >
                  <div className="sm:col-span-5">
                    <label className="block font-bold mb-1 text-[#384D55]">
                      {tr(lang, 'اسم المادة', 'Nom de la matière', 'Subject Name')}
                    </label>
                    <input
                      type="text"
                      required
                      value={newSubjName}
                      onChange={(e) => setNewSubjName(e.target.value)}
                      placeholder={tr(lang, 'مثال: المعلوماتية', 'Ex : Informatique', 'e.g. Computer Science')}
                      className="template-input"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold mb-1 text-[#384D55]">
                      {tr(lang, 'المعامل', 'Coeff.', 'Coeff')}
                    </label>
                    <input
                      type="number"
                      min={0.5}
                      max={20}
                      step="0.5"
                      dir="ltr"
                      value={newSubjCoeff}
                      onChange={(e) => setNewSubjCoeff(e.target.value)}
                      className="template-input font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold mb-1 text-[#384D55]">
                      {tr(lang, 'النقطة / 20', 'Note / 20', 'Grade')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step="0.25"
                      dir="ltr"
                      value={newSubjGrade}
                      onChange={(e) => setNewSubjGrade(e.target.value)}
                      placeholder="0-20"
                      className="template-input font-mono"
                    />
                  </div>
                  <div className="sm:col-span-3 flex gap-1.5">
                    <button type="submit" className="imgsend2 !py-1.5 !px-3 text-xs flex-1">
                      {tr(lang, 'إضافة', 'Ajouter', 'Add')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingSubject(false)}
                      className="imgsend2-secondary !py-1.5 !px-2.5 text-xs"
                    >
                      {tr(lang, 'إلغاء', 'Annuler', 'Cancel')}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {gpaStats.enteredCount > 0 && gpaStats.avg >= 10 && (
              <div className="bg-[#e2efbf] border border-[#A6CE39] rounded-[5px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-[#1c2a0e]">
                <div className="flex items-center gap-2 font-extrabold">
                  <Sparkles className="w-4 h-4 text-[#557a16] shrink-0" />
                  <span>
                    {isAr
                      ? 'نتيجة تقديرية مبشرة بالتفوق وفق المدخلات الحالية'
                      : 'Moyenne estimée encourageante selon les notes saisies'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={playCelebrationChime}
                  className="text-[11px] font-bold underline cursor-pointer shrink-0"
                >
                  {isAr ? 'إعادة نغمة التهنئة' : 'Rejouer le son'}
                </button>
              </div>
            )}

            <div className="bg-[#384D55] text-white rounded-[6px] p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] text-[#cfe0e6]">
                  {isAr ? 'المعدل التقديري على 20' : 'Moyenne estimée sur 20'}
                </div>
                <div className="text-2xl font-black text-[#A6CE39] tabular-nums" dir="ltr">
                  {gpaStats.avg.toFixed(2)} / 20
                </div>
              </div>
              <div className="text-start sm:text-end space-y-0.5">
                <div className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                  <Award className="w-4 h-4 text-[#A6CE39]" />
                  <span>{isAr ? gpaStats.mentionAr : gpaStats.mentionFr}</span>
                </div>
                <div className="text-[11px] text-[#cfe0e6]">
                  {isAr
                    ? `مجموع النقاط الموزون: ${gpaStats.weightedSum.toFixed(2)} • المعاملات المحتسبة: ${gpaStats.enteredCoeff || gpaStats.totalPossibleCoeff}`
                    : `Points pondérés : ${gpaStats.weightedSum.toFixed(2)} • Coeffs : ${gpaStats.enteredCoeff || gpaStats.totalPossibleCoeff}`}
                </div>
              </div>
            </div>

            {/* Result Export Controls: Print + Vector PDF + High-Res 300 DPI JPG */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] font-bold text-[#6b787e]">
                {tr(lang, 'حفظ أو طباعة كشف النتيجة:', 'Exporter ou imprimer le relevé :', 'Export or print result:')}
              </span>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const buildExportData = (): BacResultExportData => ({
                    seriesCode: activeSeriesObj?.code || selectedSeries.toUpperCase(),
                    seriesNameAr: activeSeriesObj?.name_ar || selectedSeries,
                    seriesNameFr: activeSeriesObj?.name_fr || selectedSeries,
                    average: gpaStats.avg,
                    weightedSum: gpaStats.weightedSum,
                    totalCoefficients: gpaStats.enteredCoeff || gpaStats.totalPossibleCoeff,
                    mentionAr: gpaStats.mentionAr,
                    mentionFr: gpaStats.mentionFr,
                    rows: [
                      ...seriesCoeffs.map((c) => {
                        const effCoeff = getEffectiveCoeff(c);
                        const valStr = grades[c.subject_slug] ?? '';
                        const num = Number(valStr);
                        const valid = valStr !== '' && !Number.isNaN(num);
                        const clamped = valid ? Math.max(0, Math.min(c.max_grade || 20, num)) : null;
                        const pts =
                          clamped === null
                            ? null
                            : c.is_optional
                              ? clamped > 10
                                ? (clamped - 10) * effCoeff
                                : 0
                              : clamped * effCoeff;
                        return {
                          nameAr: c.subject_name_ar,
                          nameFr: c.subject_name_fr,
                          coefficient: effCoeff,
                          grade: clamped,
                          points: pts,
                          isOptional: Boolean(c.is_optional),
                        };
                      }),
                      ...customSubjects.map((cs) => {
                        const num = Number(cs.grade);
                        const valid = cs.grade !== '' && !Number.isNaN(num);
                        const clamped = valid ? Math.max(0, Math.min(20, num)) : null;
                        const coeff = Math.max(0.5, Math.min(20, cs.coefficient || 1));
                        return {
                          nameAr: cs.name,
                          nameFr: cs.name,
                          coefficient: coeff,
                          grade: clamped,
                          points: clamped !== null ? clamped * coeff : null,
                          isCustom: true,
                        };
                      }),
                    ],
                  });

                  const runExport = async (kind: 'print' | 'jpg') => {
                    setExportBusy(kind);
                    try {
                      const payload = buildExportData();
                      if (kind === 'print') printBacResult(payload, lang);
                      else await downloadBacResultJpg(payload, lang);
                    } finally {
                      setExportBusy(null);
                    }
                  };

                  return (
                    <>
                      <button
                        type="button"
                        disabled={exportBusy !== null}
                        onClick={() => void runExport('print')}
                        className="imgsend2-secondary !py-1.5 !px-3 text-xs"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{tr(lang, 'طباعة', 'Imprimer', 'Print')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportBusy !== null}
                        onClick={() => void runExport('jpg')}
                        className="imgsend2 !py-1.5 !px-3 text-xs"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>
                          {exportBusy === 'jpg'
                            ? tr(lang, 'جارٍ التصدير...', 'JPG...', 'Exporting...')
                            : tr(lang, 'صورة JPG 300 DPI', 'JPG 300 DPI', 'JPG 300 DPI')}
                        </span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Series Lessons & Exam Entry */}
          <div className="lg:col-span-5 space-y-4">
            <div className="addressp-box-white space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#d8dfe2]">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#83a329]" />
                  <h2 className="text-sm font-extrabold text-[#384D55]">
                    {isAr ? 'دروس ومراجعات الشعبة' : 'Leçons de la série'}
                  </h2>
                </div>
                <span className="text-[11px] font-bold text-[#6b787e]">
                  {seriesLessons.length} {isAr ? 'دروس' : 'leçons'}
                </span>
              </div>

              {seriesLessons.length === 0 ? (
                <p className="text-xs text-[#6b787e]">
                  {isAr ? 'لا توجد دروس مخصصة لهذه الشعبة بعد.' : 'Aucune leçon pour cette série.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {seriesLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="border border-[#d8dfe2] rounded-[5px] p-3 bg-[#f7f9fa] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-[#384D55] truncate">
                          {isAr ? lesson.title_ar : lesson.title_fr || lesson.title_ar}
                        </div>
                        <div className="text-[11px] text-[#6b787e] line-clamp-1 mt-0.5">
                          {isAr ? lesson.summary_ar : lesson.summary_fr || lesson.summary_ar}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('lessons', { lessonId: lesson.id })}
                        className="imgsend2 text-[11px] shrink-0 px-3 py-1.5"
                      >
                        <Play className="w-3 h-3" />
                        <span>{isAr ? 'فتح' : 'Ouvrir'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('exams', { subjectSlug: selectedSeries, examMode: 'mock' })}
                  className="imgsend2 text-xs flex-1"
                >
                  {isAr ? 'بدء امتحان باكالوريا تجريبي' : 'Examen blanc Bac'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('question-bank', { subjectSlug: selectedSeries })}
                  className="imgsend2-secondary text-xs flex-1"
                >
                  {isAr ? 'تدريب بنك الأسئلة' : 'Banque de questions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
