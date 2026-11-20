import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  DatabaseBackup,
  Link2,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { SCHEMA_LIMITS, SharedWorkspace } from '../types/logbook';

interface TeamSettingsPanelProps {
  workspace: SharedWorkspace;
  onUpdateWorkspaceSettings: (updates: {
    name?: string;
    units?: string[];
    reporters?: string[];
  }) => Promise<void>;
  legacyUserEmail: string | null;
  legacyEntriesCount: number;
  isSigningInLegacy: boolean;
  isImportingLegacy: boolean;
  onConnectLegacyGoogle: () => Promise<void>;
  onDisconnectLegacyGoogle: () => Promise<void>;
  onImportLegacyData: () => Promise<number>;
}

export const TeamSettingsPanel: React.FC<TeamSettingsPanelProps> = ({
  workspace,
  onUpdateWorkspaceSettings,
  legacyUserEmail,
  legacyEntriesCount,
  isSigningInLegacy,
  isImportingLegacy,
  onConnectLegacyGoogle,
  onDisconnectLegacyGoogle,
  onImportLegacyData,
}) => {
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [newUnit, setNewUnit] = useState('');
  const [newReporter, setNewReporter] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [copiedAppUrl, setCopiedAppUrl] = useState(false);

  useEffect(() => {
    setWorkspaceName(workspace.name);
  }, [workspace.id, workspace.name]);

  const showSaved = (msg: string) => {
    setErrorMessage(null);
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const shareAppUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin.replace('://ais-dev-', '://ais-pre-')}/`
      : '';

  const copyTextReliably = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareAppUrl) return;
    const ok = await copyTextReliably(shareAppUrl);
    if (ok) {
      setCopiedAppUrl(true);
      setTimeout(() => setCopiedAppUrl(false), 3000);
      showSaved('คัดลอกลิงก์แอปสำหรับส่งให้ทีมแล้ว');
    } else {
      setErrorMessage('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกลิงก์จากช่องข้อความ');
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = workspaceName.trim().slice(0, SCHEMA_LIMITS.LOGBOOK_NAME_MAX);
    if (!clean) {
      setErrorMessage('ชื่อสมุดบันทึกต้องไม่ว่าง');
      return;
    }
    setIsBusy(true);
    try {
      await onUpdateWorkspaceSettings({ name: clean });
      showSaved('บันทึกชื่อสมุดบันทึกเรียบร้อยแล้ว');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddUnit = async () => {
    const clean = newUnit.trim().slice(0, SCHEMA_LIMITS.UNIT_MAX_LENGTH);
    if (!clean) return;
    if (workspace.units.includes(clean)) {
      setErrorMessage('มี Unit นี้อยู่แล้ว');
      return;
    }
    if (workspace.units.length >= SCHEMA_LIMITS.UNITS_MAX_COUNT) {
      setErrorMessage(`เพิ่มได้สูงสุด ${SCHEMA_LIMITS.UNITS_MAX_COUNT} Units`);
      return;
    }
    setIsBusy(true);
    try {
      await onUpdateWorkspaceSettings({ units: [...workspace.units, clean] });
      setNewUnit('');
      showSaved(`เพิ่ม Unit "${clean}" แล้ว`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'เพิ่ม Unit ไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveUnit = async (unitToRemove: string) => {
    if (workspace.units.length <= 1) {
      setErrorMessage('ต้องมี Unit อย่างน้อย 1 รายการ');
      return;
    }
    setIsBusy(true);
    try {
      await onUpdateWorkspaceSettings({
        units: workspace.units.filter((u) => u !== unitToRemove),
      });
      showSaved(`ลบ Unit "${unitToRemove}" แล้ว`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ลบ Unit ไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddReporter = async () => {
    const clean = newReporter.trim().slice(0, SCHEMA_LIMITS.REPORTER_MAX_LENGTH);
    if (!clean) return;
    if (workspace.reporters.includes(clean)) {
      setErrorMessage('มีรายชื่อนี้อยู่แล้ว');
      return;
    }
    if (workspace.reporters.length >= SCHEMA_LIMITS.REPORTERS_MAX_COUNT) {
      setErrorMessage(`เพิ่มรายชื่อได้สูงสุด ${SCHEMA_LIMITS.REPORTERS_MAX_COUNT} คน`);
      return;
    }
    setIsBusy(true);
    try {
      await onUpdateWorkspaceSettings({ reporters: [...workspace.reporters, clean] });
      setNewReporter('');
      showSaved(`เพิ่มผู้รายงาน "${clean}" แล้ว`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'เพิ่มรายชื่อไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveReporter = async (nameToRemove: string) => {
    setIsBusy(true);
    try {
      await onUpdateWorkspaceSettings({
        reporters: workspace.reporters.filter((r) => r !== nameToRemove),
      });
      showSaved(`ลบรายชื่อ "${nameToRemove}" แล้ว`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ลบรายชื่อไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportClick = async () => {
    setErrorMessage(null);
    try {
      const count = await onImportLegacyData();
      if (count > 0) {
        showSaved(`นำเข้าข้อมูลเดิมจำนวน ${count} รายการเข้าสมุดบันทึกกลางเรียบร้อยแล้ว`);
      } else {
        showSaved('ข้อมูลเดิมทั้งหมดถูกนำเข้าสมุดบันทึกกลางครบแล้ว');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'นำเข้าข้อมูลเดิมไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl"
        >
          {errorMessage}
        </div>
      )}
      {statusMessage && (
        <div
          role="status"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl"
        >
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Workspace Name & Team Sharing Link */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
        <div className="pb-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            ตั้งค่าสมุดบันทึกและทีมปฏิบัติงาน
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            จัดการชื่อสมุดบันทึก, รายการ Unit และรายชื่อผู้รายงานสำหรับทุกคนในทีม (ข้อมูลซิงค์ตรงกันทุกเครื่องแบบไม่ต้องลงชื่อ)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSaveName} className="space-y-2">
            <label htmlFor="lb-name" className="block text-sm font-medium text-slate-700">
              ชื่อสมุดบันทึก (Logbook Name)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="lb-name"
                type="text"
                disabled={isBusy}
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                maxLength={SCHEMA_LIMITS.LOGBOOK_NAME_MAX}
                className="w-full min-w-0 h-[40px] px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="h-[40px] px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                บันทึกชื่อ
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-700 shrink-0" />
              <span className="text-sm font-medium text-slate-700">
                ลิงก์แอปสำหรับทีม (เปิดใช้งานได้ทันทีไม่ต้องลงชื่อ)
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareAppUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="ลิงก์แอปสำหรับทีม"
                className="w-full min-w-0 h-[40px] px-3 text-xs font-mono text-slate-800 bg-slate-50 border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => void handleCopyShareUrl()}
                className="inline-flex items-center justify-center gap-1.5 h-[40px] px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedAppUrl ? (
                  <>
                    <Check className="w-4 h-4" />
                    คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    คัดลอกลิงก์ให้ทีม
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Units & Reporters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Units */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">รายการ Unit</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {workspace.units.length} / {SCHEMA_LIMITS.UNITS_MAX_COUNT}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddUnit();
                }
              }}
              maxLength={SCHEMA_LIMITS.UNIT_MAX_LENGTH}
              placeholder="เพิ่ม Unit ใหม่ เช่น Boiler Unit"
              className="w-full min-w-0 h-[40px] px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              disabled={isBusy || !newUnit.trim()}
              onClick={() => void handleAddUnit()}
              className="inline-flex items-center gap-1.5 h-[40px] px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่ม
            </button>
          </div>

          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {workspace.units.map((u) => (
              <li key={u} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-slate-800 font-medium">{u}</span>
                <button
                  type="button"
                  disabled={isBusy || workspace.units.length <= 1}
                  onClick={() => void handleRemoveUnit(u)}
                  aria-label={`ลบ ${u}`}
                  className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded-md cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Reporters */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">รายชื่อผู้รายงาน</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {workspace.reporters.length} / {SCHEMA_LIMITS.REPORTERS_MAX_COUNT}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newReporter}
              onChange={(e) => setNewReporter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddReporter();
                }
              }}
              maxLength={SCHEMA_LIMITS.REPORTER_MAX_LENGTH}
              placeholder="เพิ่มชื่อผู้ปฏิบัติงาน"
              className="w-full min-w-0 h-[40px] px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              disabled={isBusy || !newReporter.trim()}
              onClick={() => void handleAddReporter()}
              className="inline-flex items-center gap-1.5 h-[40px] px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่ม
            </button>
          </div>

          <ul className="divide-y divide-slate-200 border-t border-slate-200 max-h-[320px] overflow-y-auto">
            {workspace.reporters.length === 0 ? (
              <li className="py-6 text-sm text-slate-500 text-center">
                ยังไม่มีรายชื่อผู้รายงาน เพิ่มรายชื่อด้านบนเพื่อแสดงในตัวเลือก
              </li>
            ) : (
              workspace.reporters.map((r) => (
                <li key={r} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-800">{r}</span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleRemoveReporter(r)}
                    aria-label={`ลบ ${r}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* Optional Legacy Google Data Migration */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="w-4 h-4 text-slate-600 shrink-0" />
            <h3 className="text-base font-semibold text-slate-900">
              นำเข้าข้อมูลเดิมที่เคยบันทึกผ่านบัญชี Google (ตัวเลือกเสริม)
            </h3>
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          สำหรับเครื่องที่เคยบันทึกข้อมูลไว้ก่อนเปิดใช้งานแบบไม่ต้องลงชื่อ สามารถเชื่อมต่อบัญชี Google ชั่วคราวเพื่อย้ายรายงานเก่าเข้าสู่สมุดบันทึกกลางนี้ได้ (เมื่อนำเข้าแล้ว ทุกคนในทีมจะเห็นข้อมูลนั้นโดยไม่ต้องลงชื่อเข้าใช้)
        </p>

        {legacyUserEmail ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs text-slate-600">
                บัญชีที่เชื่อมต่ออยู่:{' '}
                <span className="font-mono font-medium text-slate-900">{legacyUserEmail}</span>
              </p>
              <p className="text-xs text-slate-500">
                พบรายการที่ยังไม่ได้นำเข้าสมุดกลาง:{' '}
                <span className="font-mono font-semibold text-blue-700">{legacyEntriesCount}</span>{' '}
                รายการ
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isImportingLegacy || legacyEntriesCount === 0}
                onClick={() => void handleImportClick()}
                className="inline-flex items-center gap-1.5 h-[38px] px-4 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                {isImportingLegacy ? 'กำลังนำเข้า...' : 'นำเข้าข้อมูลเดิมเข้าสมุดกลาง'}
              </button>
              <button
                type="button"
                onClick={() => void onDisconnectLegacyGoogle()}
                className="inline-flex items-center gap-1.5 h-[38px] px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                ยกเลิกการเชื่อมต่อ
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              disabled={isSigningInLegacy}
              onClick={() => void onConnectLegacyGoogle()}
              className="inline-flex items-center gap-2 h-[38px] px-4 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              {isSigningInLegacy ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อบัญชี Google เพื่อดึงข้อมูลเดิม'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
