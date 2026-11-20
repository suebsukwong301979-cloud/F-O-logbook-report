import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-1.5 h-[36px] px-3 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>ติดตั้งลงมือถือ</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 h-[36px] px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>เพิ่มลงหน้าจอโฮม</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          >
            <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 id="ios-install-title" className="text-base font-semibold text-slate-900">
                  เพิ่มแอปลงหน้าจอโฮม (iPhone / iPad)
                </h3>
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-blue-700">1.</span>
                  <span>
                    เปิดเว็บนี้ใน <strong>Safari</strong> แล้วแตะปุ่ม{' '}
                    <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                      <Share className="w-3.5 h-3.5 text-blue-700" />
                      แชร์ (Share)
                    </span>{' '}
                    ที่แถบด้านล่าง
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-blue-700">2.</span>
                  <span>
                    เลื่อนลงแล้วเลือก <strong>เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</strong>
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full h-[42px] text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
