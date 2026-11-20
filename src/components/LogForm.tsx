import React, { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Save, X } from 'lucide-react';
import {
  getDefaultShiftForReporter,
  LogEntry,
  PERIOD_OPTIONS,
  SCHEMA_LIMITS,
  SHIFT_OPTIONS,
  ShiftCode,
  ShiftPeriod,
} from '../types/logbook';
import { insertFieldLog } from '../lib/supabase';
import {
  formatDisplayDate,
  getCurrentShiftPeriod,
  getTodayIsoDate,
} from '../utils/formatters';

interface LogFormProps {
  units: string[];
  reporters: string[];
  editingEntry: LogEntry | null;
  defaultDate: string;
  onSaveEntry: (payload: {
    reportDate: string;
    unit: string;
    reporterName: string;
    shift: ShiftCode;
    period: ShiftPeriod;
    details: string;
  }) => Promise<void>;
  onCancelEdit: () => void;
  onQuickAddReporter: (name: string) => Promise<void>;
}

export const LogForm: React.FC<LogFormProps> = ({
  units,
  reporters,
  editingEntry,
  defaultDate,
  onSaveEntry,
  onCancelEdit,
  onQuickAddReporter,
}) => {
  const [reportDate, setReportDate] = useState<string>(defaultDate || getTodayIsoDate());
  const [unit, setUnit] = useState<string>(units[0] || 'SA/IA Unit');
  const [reporterName, setReporterName] = useState<string>('');
  const [shift, setShift] = useState<ShiftCode>(ShiftCode.A);
  const [period, setPeriod] = useState<ShiftPeriod>(() => getCurrentShiftPeriod());
  const [details, setDetails] = useState<string>('');

  const [isAddingReporter, setIsAddingReporter] = useState(false);
  const [newReporterInput, setNewReporterInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncToSupabase, setSyncToSupabase] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (editingEntry) {
      setReportDate(editingEntry.reportDate);
      setUnit(editingEntry.unit);
      setReporterName(editingEntry.reporterName);
      setShift(editingEntry.shift);
      const rawPeriod = String(editingEntry.period);
      setPeriod(
        rawPeriod === ShiftPeriod.Night || rawPeriod === 'Night'
          ? ShiftPeriod.Night
          : ShiftPeriod.Morning
      );
      setDetails(editingEntry.details);
      setFormError(null);
      setSaveSuccess(null);
    }
  }, [editingEntry]);

  useEffect(() => {
    if (!editingEntry && units.length > 0 && !units.includes(unit)) {
      setUnit(units[0]);
    }
  }, [units, unit, editingEntry]);

  useEffect(() => {
    if (!editingEntry) {
      setReportDate(defaultDate);
    }
  }, [defaultDate, editingEntry]);

  const handleReporterChange = (nextReporter: string) => {
    setReporterName(nextReporter);
    const defaultShift = getDefaultShiftForReporter(nextReporter);
    if (defaultShift) {
      setShift(defaultShift);
    }
  };

  const handleQuickAddReporter = async () => {
    const trimmed = newReporterInput.trim().slice(0, SCHEMA_LIMITS.REPORTER_MAX_LENGTH);
    if (!trimmed) return;
    try {
      await onQuickAddReporter(trimmed);
      handleReporterChange(trimmed);
      setNewReporterInput('');
      setIsAddingReporter(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มรายชื่อได้');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(null);

    if (!SCHEMA_LIMITS.DATE_PATTERN.test(reportDate)) {
      setFormError('กรุณาเลือกวันที่ในรูปแบบที่ถูกต้อง');
      return;
    }
    const cleanUnit = unit.trim();
    if (!cleanUnit) {
      setFormError('กรุณาเลือก Unit');
      return;
    }
    const cleanReporter = reporterName.trim();
    if (!cleanReporter) {
      setFormError('กรุณาเลือกชื่อผู้รายงาน');
      return;
    }
    const cleanDetails = details.trim();
    if (!cleanDetails) {
      setFormError('กรุณากรอกรายละเอียดงาน');
      return;
    }
    if (cleanDetails.length > SCHEMA_LIMITS.DETAILS_MAX_LENGTH) {
      setFormError(`รายละเอียดงานต้องไม่เกิน ${SCHEMA_LIMITS.DETAILS_MAX_LENGTH} ตัวอักษร`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveEntry({
        reportDate,
        unit: cleanUnit.slice(0, SCHEMA_LIMITS.UNIT_MAX_LENGTH),
        reporterName: cleanReporter.slice(0, SCHEMA_LIMITS.REPORTER_MAX_LENGTH),
        shift,
        period,
        details: cleanDetails,
      });

      if (editingEntry) {
        setDetails('');
        setPeriod(getCurrentShiftPeriod());
        setSaveSuccess('อัปเดตรายงานเรียบร้อยแล้ว');
        setTimeout(() => setSaveSuccess(null), 3500);
      } else {
        setDetails('');
        if (syncToSupabase) {
          const rawText = `${formatDisplayDate(reportDate)} [${cleanUnit}] Shift ${shift} (${period}) ${cleanDetails} By: ${cleanReporter}`;
          const sbResult = await insertFieldLog({
            rawText,
            loggedBy: cleanReporter,
          });
          if (sbResult.ok) {
            setSaveSuccess('บันทึกรายงานและส่งลง Supabase (field_logs) เรียบร้อยแล้ว');
            setTimeout(() => setSaveSuccess(null), 4000);
          } else {
            setSaveSuccess('บันทึกรายงานใน F/O Logbook แล้ว');
            setFormError(
              `ไม่สามารถบันทึกลง Supabase (field_logs) ได้: ${sbResult.errorMessage || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`
            );
          }
        } else {
          setSaveSuccess('บันทึกรายงานเรียบร้อยแล้ว');
          setTimeout(() => setSaveSuccess(null), 3000);
        }
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกรายงาน'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableUnits = Array.from(new Set(unit ? [unit, ...units] : units));
  const availableReporters = Array.from(
    new Set(reporterName ? [reporterName, ...reporters] : reporters)
  );

  return (
    <section
      aria-labelledby="log-form-heading"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 id="log-form-heading" className="text-lg font-semibold text-slate-900">
            {editingEntry ? 'แก้ไขรายงานการทำงาน' : 'บันทึกการปฏิบัติงานประจำวัน'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            กรอกข้อมูลประจำกะและรายละเอียดงานเพื่อบันทึกเข้าระบบ F/O Logbook
          </p>
        </div>
        {editingEntry && (
          <button
            type="button"
            onClick={() => {
              onCancelEdit();
              setDetails('');
              setPeriod(getCurrentShiftPeriod());
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            ยกเลิกการแก้ไข
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          {/* วันที่ */}
          <div className="space-y-1 min-w-0">
            <label htmlFor="log-date" className="block text-xs font-medium text-slate-700">
              วันที่
            </label>
            <input
              id="log-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              required
              className="w-full min-w-0 max-w-full h-[40px] px-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Unit */}
          <div className="space-y-1 min-w-0">
            <label htmlFor="log-unit" className="block text-xs font-medium text-slate-700">
              Unit
            </label>
            <select
              id="log-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full h-[40px] px-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {availableUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* ผู้รายงาน */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="log-reporter" className="block text-xs font-medium text-slate-700">
                ผู้รายงาน
              </label>
              <button
                type="button"
                onClick={() => setIsAddingReporter((v) => !v)}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                {isAddingReporter ? 'ปิด' : 'เพิ่มชื่อ'}
              </button>
            </div>
            {isAddingReporter ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newReporterInput}
                  onChange={(e) => setNewReporterInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleQuickAddReporter();
                    }
                  }}
                  maxLength={SCHEMA_LIMITS.REPORTER_MAX_LENGTH}
                  placeholder="ชื่อ-นามสกุล"
                  className="w-full min-w-0 h-[40px] px-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => void handleQuickAddReporter()}
                  className="h-[40px] px-2.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  เพิ่ม
                </button>
              </div>
            ) : (
              <select
                id="log-reporter"
                value={reporterName}
                onChange={(e) => handleReporterChange(e.target.value)}
                className="w-full h-[40px] px-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="">-- เลือกชื่อ --</option>
                {availableReporters.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Shift */}
          <div className="space-y-1 min-w-0">
            <label htmlFor="log-shift" className="block text-xs font-medium text-slate-700">
              Shift
            </label>
            <select
              id="log-shift"
              value={shift}
              onChange={(e) => setShift(e.target.value as ShiftCode)}
              className="w-full h-[40px] px-2.5 text-sm font-mono font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {SHIFT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* ช่วงเวลา */}
          <div className="space-y-1 min-w-0">
            <label htmlFor="log-period" className="block text-xs font-medium text-slate-700">
              ช่วงเวลา
            </label>
            <select
              id="log-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as ShiftPeriod)}
              className="w-full h-[40px] px-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* รายละเอียดงาน */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="log-details" className="block text-sm font-medium text-slate-700">
              รายละเอียดงาน
            </label>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {details.length} / {SCHEMA_LIMITS.DETAILS_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="log-details"
            rows={4}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={SCHEMA_LIMITS.DETAILS_MAX_LENGTH}
            placeholder="วันนี้ทำอะไรบ้าง (เช่น ตรวจสอบอุปกรณ์ประจำ Unit, งานแก้ไข/PM, ค่าพารามิเตอร์ผิดปกติ หรือข้อควรระวังสำหรับกะถัดไป)"
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-y leading-relaxed"
          />
        </div>

        {formError && (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
          >
            {formError}
          </div>
        )}

        {saveSuccess && (
          <div
            role="status"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-0 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSubmitting
                ? 'กำลังบันทึก...'
                : editingEntry
                  ? 'บันทึกการแก้ไข'
                  : 'บันทึกรายงาน'}
            </button>

            {!editingEntry && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncToSupabase}
                  onChange={(e) => setSyncToSupabase(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>ส่งลง Supabase (field_logs) อัตโนมัติ</span>
              </label>
            )}
          </div>
        </div>
      </form>
    </section>
  );
};
