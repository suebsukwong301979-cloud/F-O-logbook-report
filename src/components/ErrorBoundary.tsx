import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application error caught by ErrorBoundary:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      let displayDetail = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && typeof parsed.error === 'string') {
          displayDetail = `${parsed.operationType?.toUpperCase() || 'FIRESTORE'}: ${parsed.error}`;
        }
      } catch {
        // Plain error message
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  ไม่สามารถดำเนินการต่อได้
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  ระบบพบข้อผิดพลาดในการเชื่อมต่อหรือสิทธิ์การเข้าถึงข้อมูล กรุณารีเฟรชหน้าจอหรือลองใหม่อีกครั้ง
                </p>
              </div>
            </div>
            <pre className="text-xs font-mono bg-slate-100 text-slate-700 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
              {displayDetail}
            </pre>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                โหลดหน้าใหม่
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
