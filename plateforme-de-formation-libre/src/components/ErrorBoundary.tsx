import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'حدث خطأ غير متوقع.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.includes('Missing or insufficient permissions')) {
          readable = 'ليس لديك صلاحية تنفيذ هذه العملية أو الوصول إلى هذه البيانات.';
        } else if (parsed.error.includes('Quota exceeded')) {
          readable = 'تم بلوغ الحد اليومي المجاني لقاعدة البيانات، يرجى المحاولة لاحقاً.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      // keep standard error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f4f6f7] p-4" dir="rtl">
          <div className="max-w-md w-full bg-white border border-[#d8dfe2] rounded-[8px] p-6 text-center space-y-4 shadow-sm">
            <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
            <h1 className="text-base font-extrabold text-[#384D55]">
              تعذر عرض هذه الصفحة مؤقتاً
            </h1>
            <p className="text-xs text-[#5d6e75] leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="imgsend2 !text-xs mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
