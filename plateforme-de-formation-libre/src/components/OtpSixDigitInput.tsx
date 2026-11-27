import React, { useRef } from 'react';

interface OtpSixDigitInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  onComplete?: (code: string) => void;
  idPrefix?: string;
}

export const OtpSixDigitInput: React.FC<OtpSixDigitInputProps> = ({
  value,
  onChange,
  disabled = false,
  onComplete,
  idPrefix = 'otp-digit',
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const cleanDigits = value.replace(/\D/g, '').slice(0, 6);
  const digits = Array.from({ length: 6 }, (_, i) => cleanDigits[i] || '');

  const setAt = (index: number, char: string) => {
    const arr = [...digits];
    arr[index] = char;
    const joined = arr.join('');
    onChange(joined);
    if (joined.length === 6 && /^\d{6}$/.test(joined) && onComplete) {
      onComplete(joined);
    }
  };

  const handleInputChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setAt(index, '');
      return;
    }
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6);
      onChange(pasted);
      const nextFocus = Math.min(5, pasted.length - 1);
      inputRefs.current[nextFocus]?.focus();
      if (pasted.length === 6 && onComplete) onComplete(pasted);
      return;
    }
    setAt(index, cleaned);
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        setAt(index - 1, '');
        inputRefs.current[index - 1]?.focus();
      } else if (digits[index]) {
        e.preventDefault();
        setAt(index, '');
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    const targetIdx = Math.min(5, Math.max(0, pasted.length - 1));
    inputRefs.current[targetIdx]?.focus();
    if (pasted.length === 6 && onComplete) onComplete(pasted);
  };

  return (
    <div dir="ltr" className="flex items-center justify-center gap-2 sm:gap-2.5">
      {digits.map((d, idx) => (
        <input
          key={idx}
          id={`${idPrefix}-${idx}`}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          value={d}
          aria-label={`Digit ${idx + 1}`}
          onChange={(e) => handleInputChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          className="w-10 h-12 sm:w-11 sm:h-12 text-center text-lg font-extrabold font-mono rounded-[6px] border border-[#c9d0d3] bg-white text-[#384D55] focus:outline-none focus:border-[#83a329] focus:ring-2 focus:ring-[#A6CE39]/40 disabled:opacity-50"
        />
      ))}
    </div>
  );
};
