import React from 'react';

export type AnimatedRingIconKey =
  | 'arabic'
  | 'math'
  | 'science'
  | 'islamic'
  | 'education'
  | 'psych'
  | 'assess'
  | 'dept'
  | 'plan'
  | 'methods'
  | 'french'
  | 'culture'
  | 'qbank'
  | 'review'
  | 'exam';

export function subjectSlugToIconKey(slug: string): AnimatedRingIconKey {
  switch (slug) {
    case 'arabic-lang':
      return 'arabic';
    case 'mathematics':
      return 'math';
    case 'natural-sciences':
    case 'sciences':
      return 'science';
    case 'islamic-education':
    case 'islamic-ed':
      return 'islamic';
    case 'education-sciences':
    case 'pedagogy':
      return 'education';
    case 'educational-psychology':
    case 'psychology':
      return 'psych';
    case 'evaluation-measurement':
      return 'assess';
    case 'classroom-management':
      return 'dept';
    case 'educational-planning':
      return 'plan';
    case 'teaching-methods':
    case 'didactics-ar':
    case 'didactics-fr':
      return 'methods';
    case 'french-lang':
      return 'french';
    case 'general-culture':
    case 'civic-ed':
    case 'history-geo':
    case 'ethics':
    default:
      return 'culture';
  }
}

interface AnimatedRingSvgProps {
  iconKey: AnimatedRingIconKey;
  uid?: string;
}

export const AnimatedRingSvg: React.FC<AnimatedRingSvgProps> = ({ iconKey, uid = 'def' }) => {
  const clipId = `ht-fl-${uid}`;

  switch (iconKey) {
    case 'arabic':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <rect className="s" x="28" y="54" width="22" height="20" rx="3" />
          <rect className="f" x="32" y="46" width="14" height="8" rx="2" />
          <g className="quill">
            <path className="s" d="M62 22c8 4 9 20-4 34-3-14-3-24 4-34z" />
            <path className="s" d="M58 56l-6 8" />
          </g>
          <path className="s" d="M20 78h62" />
          <path className="s ln" d="M56 74q4-5 8 0t8 0" />
        </svg>
      );

    case 'math':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <rect className="s" x="32" y="22" width="36" height="56" rx="5" />
          <rect className="f scr" x="38" y="28" width="24" height="10" rx="2" />
          <g>
            <circle className="d k" style={{ '--k': 0 } as React.CSSProperties} cx="40" cy="48" r="2.4" />
            <circle className="d k" style={{ '--k': 1 } as React.CSSProperties} cx="50" cy="48" r="2.4" />
            <circle className="d k" style={{ '--k': 2 } as React.CSSProperties} cx="60" cy="48" r="2.4" />
            <circle className="d k" style={{ '--k': 3 } as React.CSSProperties} cx="40" cy="58" r="2.4" />
            <circle className="d k" style={{ '--k': 4 } as React.CSSProperties} cx="50" cy="58" r="2.4" />
            <circle className="d k" style={{ '--k': 5 } as React.CSSProperties} cx="60" cy="58" r="2.4" />
            <circle className="d k" style={{ '--k': 6 } as React.CSSProperties} cx="40" cy="68" r="2.4" />
            <circle className="d k" style={{ '--k': 7 } as React.CSSProperties} cx="50" cy="68" r="2.4" />
            <circle className="k" style={{ '--k': 8, fill: 'var(--g)' } as React.CSSProperties} cx="60" cy="68" r="2.8" />
          </g>
        </svg>
      );

    case 'science':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <defs>
            <clipPath id={clipId}>
              <path d="M45 40L30 68q-3 8 5 8h30q8 0 5-8L55 40z" />
            </clipPath>
          </defs>
          <g className="flask">
            <g clipPath={`url(#${clipId})`}>
              <g className="wave">
                <rect className="f" x="22" y="58" width="56" height="24" style={{ stroke: 'none' }} />
              </g>
            </g>
            <path className="s" d="M42 22h16M45 22v18L30 68q-3 8 5 8h30q8 0 5-8L55 40V22" />
          </g>
          <circle className="s bub" style={{ '--k': 0 } as React.CSSProperties} cx="46" cy="52" r="2.4" />
          <circle className="s bub" style={{ '--k': 1 } as React.CSSProperties} cx="54" cy="48" r="2" />
          <circle className="s bub" style={{ '--k': 2 } as React.CSSProperties} cx="50" cy="44" r="1.8" />
        </svg>
      );

    case 'islamic':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <g className="moon">
            <path className="f" d="M46 20a12 12 0 1 0 12 19 10 10 0 1 1-12-19z" />
          </g>
          <path
            className="f star"
            d="M64 26l2 4 4 .6-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.6z"
            style={{ strokeWidth: 1.6 }}
          />
          <g className="pg">
            <path className="s" d="M20 74c10-4 22-4 30 2 8-6 20-6 30-2V50c-10-4-22-4-30 2-8-6-20-6-30-2z" />
            <path className="s" d="M50 52v24" />
            <path className="s" d="M27 58c6-1 12-1 17 1M27 66c6-1 12-1 17 1M56 59c5-2 11-2 17-1M56 67c5-2 11-2 17-1" />
          </g>
        </svg>
      );

    case 'education':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <path className="s" d="M32 52v14c6 8 30 8 36 0V52" />
          <g className="cap">
            <path className="f" d="M50 28L82 42 50 56 18 42z" />
            <g className="tas">
              <path className="s" d="M78 44v18" />
              <circle className="f" cx="78" cy="65" r="3.4" />
            </g>
          </g>
        </svg>
      );

    case 'psych':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <path
            className="s"
            d="M42 78V66c-8-4-12-12-12-22 0-14 10-22 24-22s20 8 20 20c0 6-2 8-4 12l4 4-4 2v6c0 4-4 6-8 6z"
          />
          <g className="gear">
            <circle className="f" cx="52" cy="44" r="7" />
            <path className="s" d="M52 33v-3M52 55v3M41 44h-3M63 44h3M44 36l-2-2M60 52l2 2M60 36l2-2M44 52l-2 2" />
          </g>
        </svg>
      );

    case 'assess':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <path className="s" d="M22 68a28 28 0 0 1 56 0" />
          <path className="s" d="M22 68a28 28 0 0 1 8-20" style={{ stroke: 'var(--g)', strokeWidth: 5 }} />
          <path className="s" d="M50 36v4M30 44l3 3M70 44l-3 3" />
          <path className="s ndl" d="M50 68L66 46" />
          <circle className="f" cx="50" cy="68" r="4" />
          <path className="s" d="M20 76h60" />
        </svg>
      );

    case 'dept':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <path className="s nl" d="M50 36v8M28 44h44M28 44v8M50 44v8M72 44v8" />
          <rect className="f nd" style={{ '--k': 0 } as React.CSSProperties} x="39" y="24" width="22" height="12" rx="3" />
          <rect className="s nd" style={{ '--k': 1 } as React.CSSProperties} x="17" y="52" width="22" height="12" rx="3" />
          <rect className="s nd" style={{ '--k': 2 } as React.CSSProperties} x="39" y="52" width="22" height="12" rx="3" />
          <rect className="s nd" style={{ '--k': 3 } as React.CSSProperties} x="61" y="52" width="22" height="12" rx="3" />
          <path className="s" d="M20 76h60" />
        </svg>
      );

    case 'plan':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <rect className="s" x="30" y="24" width="40" height="54" rx="4" />
          <rect className="f" x="40" y="18" width="20" height="10" rx="3" />
          <path className="s chk" style={{ '--k': 0 } as React.CSSProperties} d="M36 42l3 3 5-6" />
          <path className="s" d="M50 42h14" />
          <path className="s chk" style={{ '--k': 1 } as React.CSSProperties} d="M36 54l3 3 5-6" />
          <path className="s" d="M50 54h14" />
          <path className="s chk" style={{ '--k': 2 } as React.CSSProperties} d="M36 66l3 3 5-6" />
          <path className="s" d="M50 66h14" />
        </svg>
      );

    case 'methods':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <rect className="s" x="22" y="26" width="48" height="34" rx="3" />
          <rect className="f" x="28" y="44" width="10" height="10" />
          <path className="s ln" d="M28 34h28M44 44h18" />
          <path className="s" d="M38 60l-6 16M54 60l6 16" />
          <path className="s ptr" d="M82 34L66 52" />
        </svg>
      );

    case 'french':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          {/* Open textbook with lime ribbon bookmark & animated script */}
          <g className="pg">
            <rect className="s" x="25" y="28" width="46" height="48" rx="4" />
            <path className="f" d="M54 28h10v18l-5-4-5 4z" />
            <path className="s" d="M33 42h15M33 52h26M33 62h18" />
          </g>
          <g className="quill">
            <path className="f" d="M72 22l6 6-14 14-8 2 2-8z" />
          </g>
          <path className="s ln" d="M33 69q5-4 10 0t10 0" />
        </svg>
      );

    case 'culture':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          {/* Globe & civic horizon */}
          <g className="nd" style={{ '--k': 0 } as React.CSSProperties}>
            <circle className="s" cx="50" cy="46" r="20" />
            <ellipse className="s" cx="50" cy="46" rx="9" ry="20" />
            <path className="s" d="M30 46h40M33 37h34M33 55h34" />
          </g>
          <circle className="f star" cx="67" cy="28" r="5" />
          <path className="s" d="M50 66v10M36 76h28" />
        </svg>
      );

    case 'qbank':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <rect className="s" x="26" y="24" width="42" height="52" rx="4" />
          <circle className="f scr" cx="65" cy="30" r="10" />
          <path className="s chk" style={{ '--k': 0 } as React.CSSProperties} d="M34 44l3 3 5-5" />
          <path className="s ln" d="M46 44h15M34 56h27M34 66h19" />
        </svg>
      );

    case 'review':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <rect className="s" x="24" y="26" width="38" height="48" rx="4" />
          <path className="s" d="M32 38h20M32 48h16M32 58h14" />
          <g className="ptr">
            <circle className="f" cx="60" cy="52" r="11" />
            <path className="s" d="M68 60l10 11" />
          </g>
        </svg>
      );

    case 'exam':
      return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="c" cx="50" cy="50" r="48" />
          <circle className="p" cx="50" cy="50" r="48" />
          <path className="s" d="M44 20h12M50 20v6" />
          <circle className="s" cx="50" cy="52" r="24" />
          <path className="s" d="M50 32v4M70 52h-4M34 52h-4" />
          <path className="s ndl" d="M50 52L63 38" />
          <circle className="f" cx="50" cy="52" r="4" />
          <path className="s chk" style={{ '--k': 0 } as React.CSSProperties} d="M43 66l4 4 9-8" />
        </svg>
      );
  }
};
