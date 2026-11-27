import React, { useMemo } from 'react';

const ARABIC_LETTERS = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي';

interface LetterParticle {
  char: string;
  x: number;
  size: number;
  duration: number;
  delay: number;
  rotate: number;
}

export const MobileBackground: React.FC = () => {
  // Deterministic lightweight distribution across 14 faint Reem Kufi Arabic letters
  const particles = useMemo<LetterParticle[]>(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const char = ARABIC_LETTERS[(i * 5 + 3) % ARABIC_LETTERS.length];
      const x = ((i * 19 + 7) % 92) + 3;
      const size = 30 + ((i * 17) % 54);
      const duration = 22 + ((i * 7) % 16);
      const delay = -((i * 4.3) % 24);
      const rotate = ((i * 23) % 50) - 25;
      return { char, x, size, duration, delay, rotate };
    });
  }, []);

  return (
    <>
      <div className="tdr-m-letters" aria-hidden="true">
        {particles.map((p, idx) => (
          <span
            key={idx}
            style={
              {
                '--x': `${p.x}%`,
                '--s': `${p.size}px`,
                '--d': `${p.duration}s`,
                '--w': `${p.delay}s`,
                '--r': `${p.rotate}deg`,
              } as React.CSSProperties
            }
          >
            {p.char}
          </span>
        ))}
      </div>

      <div className="tdr-m-wave" aria-hidden="true">
        <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
          <path d="M0 50 C200 10 400 10 600 50 S1000 90 1200 50 V90 H0Z" />
        </svg>
        <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
          <path d="M0 60 C150 30 350 30 600 60 S1050 85 1200 60 V90 H0Z" />
        </svg>
      </div>
    </>
  );
};
