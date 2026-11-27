import React, { useState } from 'react';

export const PAYMENT_LOGO_URLS = {
  sedad: 'https://i.ibb.co/MyXqv0Kh/Sedad-Bank-Logo-on-White-Copie.png',
  masrvi: 'https://i.ibb.co/7N65mYqN/Masrvi-Logo-Mark.png',
  bankily: 'https://i.ibb.co/XZ783wKN/image.png',
} as const;

interface PaymentBrandBadgesProps {
  activeMethod?: string | null;
  activeBrand?: 'visa' | 'mastercard' | null;
  size?: 'sm' | 'md';
  showMauritanianMethods?: boolean;
  onSelectMethod?: (methodCode: string) => void;
  onSelectBrand?: (brand: 'visa' | 'mastercard') => void;
}

const BadgeImageWithFallback: React.FC<{
  src: string;
  alt: string;
  imgClass: string;
  fallbackText: string;
  fallbackColor: string;
}> = ({ src, alt, imgClass, fallbackText, fallbackColor }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="font-extrabold text-[11px] tracking-tight px-1"
        style={{ color: fallbackColor }}
      >
        {fallbackText}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={imgClass}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};

export const PaymentBrandBadges: React.FC<PaymentBrandBadgesProps> = ({
  activeMethod = null,
  activeBrand = null,
  size = 'md',
  showMauritanianMethods = true,
  onSelectMethod,
  onSelectBrand,
}) => {
  const boxClass = size === 'sm' ? 'h-8 px-2.5' : 'h-10 px-3';
  const imgClass = size === 'sm' ? 'h-5 w-auto max-w-[68px] object-contain' : 'h-6 w-auto max-w-[82px] object-contain';
  const visaW = size === 'sm' ? 'w-10 h-4' : 'w-12 h-5';
  const mcW = size === 'sm' ? 'w-8 h-4' : 'w-9 h-5';

  const cardSelected = activeMethod === 'card' || activeBrand === 'visa' || activeBrand === 'mastercard';

  return (
    <div
      className="inline-flex items-center gap-2 flex-wrap"
      aria-label="Sedad, Masrvi, Bankily, Visa and Mastercard"
    >
      {showMauritanianMethods && (
        <>
          {/* 1. السداد (Sedad) */}
          <button
            type="button"
            onClick={onSelectMethod ? () => onSelectMethod('sedad') : undefined}
            disabled={!onSelectMethod}
            className={`${boxClass} rounded-[6px] bg-white border flex items-center justify-center gap-1.5 transition-all ${
              onSelectMethod ? 'cursor-pointer hover:border-[#A6CE39]' : 'cursor-default'
            } ${
              activeMethod === 'sedad'
                ? 'border-[#A6CE39] ring-2 ring-[#A6CE39]/45 shadow-xs'
                : 'border-[#c9d0d3]'
            }`}
            aria-label="السداد Sedad"
            title="السداد (Sedad)"
          >
            <BadgeImageWithFallback
              src={PAYMENT_LOGO_URLS.sedad}
              alt="السداد Sedad"
              imgClass={imgClass}
              fallbackText="السداد"
              fallbackColor="#146c43"
            />
          </button>

          {/* 2. مصرفي (Masrvi) */}
          <button
            type="button"
            onClick={onSelectMethod ? () => onSelectMethod('masrvi') : undefined}
            disabled={!onSelectMethod}
            className={`${boxClass} rounded-[6px] bg-white border flex items-center justify-center gap-1.5 transition-all ${
              onSelectMethod ? 'cursor-pointer hover:border-[#A6CE39]' : 'cursor-default'
            } ${
              activeMethod === 'masrvi'
                ? 'border-[#A6CE39] ring-2 ring-[#A6CE39]/45 shadow-xs'
                : 'border-[#c9d0d3]'
            }`}
            aria-label="مصرفي Masrvi"
            title="مصرفي (Masrvi)"
          >
            <BadgeImageWithFallback
              src={PAYMENT_LOGO_URLS.masrvi}
              alt="مصرفي Masrvi"
              imgClass={imgClass}
              fallbackText="مصرفي"
              fallbackColor="#0b4f8a"
            />
          </button>

          {/* 3. بنكيلي (Bankily) */}
          <button
            type="button"
            onClick={onSelectMethod ? () => onSelectMethod('bankily') : undefined}
            disabled={!onSelectMethod}
            className={`${boxClass} rounded-[6px] bg-white border flex items-center justify-center gap-1.5 transition-all ${
              onSelectMethod ? 'cursor-pointer hover:border-[#A6CE39]' : 'cursor-default'
            } ${
              activeMethod === 'bankily'
                ? 'border-[#A6CE39] ring-2 ring-[#A6CE39]/45 shadow-xs'
                : 'border-[#c9d0d3]'
            }`}
            aria-label="بنكيلي Bankily"
            title="بنكيلي (Bankily)"
          >
            <BadgeImageWithFallback
              src={PAYMENT_LOGO_URLS.bankily}
              alt="بنكيلي Bankily"
              imgClass={imgClass}
              fallbackText="بنكيلي"
              fallbackColor="#0f766e"
            />
          </button>
        </>
      )}

      {/* 4. Visa / Mastercard Card Badge */}
      <button
        type="button"
        onClick={
          onSelectMethod
            ? () => onSelectMethod('card')
            : onSelectBrand
              ? () => onSelectBrand(activeBrand === 'mastercard' ? 'visa' : 'mastercard')
              : undefined
        }
        disabled={!onSelectMethod && !onSelectBrand}
        className={`${boxClass} rounded-[6px] bg-white border flex items-center justify-center gap-1.5 transition-all ${
          onSelectMethod || onSelectBrand ? 'cursor-pointer hover:border-[#A6CE39]' : 'cursor-default'
        } ${
          cardSelected
            ? 'border-[#A6CE39] ring-2 ring-[#A6CE39]/45 shadow-xs'
            : 'border-[#c9d0d3]'
        }`}
        aria-label="Visa & Mastercard"
        title="البطاقة المصرفية (Visa / Mastercard)"
      >
        <svg viewBox="0 0 64 20" className={visaW} role="img" aria-label="VISA">
          <text
            x="32"
            y="16"
            textAnchor="middle"
            fill="#1A1F71"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize="17"
            letterSpacing="1"
          >
            VISA
          </text>
        </svg>
        <svg viewBox="0 0 42 26" className={mcW} role="img" aria-label="Mastercard">
          <circle cx="14" cy="13" r="10.5" fill="#EB001B" />
          <circle cx="28" cy="13" r="10.5" fill="#F79E1B" fillOpacity="0.92" />
        </svg>
      </button>
    </div>
  );
};
