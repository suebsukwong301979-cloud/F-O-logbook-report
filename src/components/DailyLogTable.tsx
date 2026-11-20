import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { insertFieldLog } from '../lib/supabase';
import { LogEntry } from '../types/logbook';
import {
  buildMonthlyCsv,
  downloadCsvFile,
  filterEntriesForHandoverWindow,
  formatDisplayDate,
  formatHandoverDateRange,
  formatHandoverText,
  formatThaiMonthYear,
  getTodayIsoDate,
  shiftIsoDate,
} from '../utils/formatters';

interface DailyLogTableProps {
  logbookName: string;
  entries: LogEntry[];
  selectedDate: string;
  onChangeDate: (date: string) => void;
  selectedMonth: string;
  onChangeMonth: (month: string) => void;
  backedUpMonths: string[];
  onMarkMonthBackedUp: (month: string) => Promise<void>;
  isLoading: boolean;
  allowAllModify?: boolean;
  currentUserUid?: string;
  logbookOwnerUid?: string;
  onEditEntry: (entry: LogEntry) => void;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onFocusForm: () => void;
}

export const DailyLogTable: React.FC<DailyLogTableProps> = ({
  logbookName,
  entries,
  selectedDate,
  onChangeDate,
  selectedMonth,
  onChangeMonth,
  backedUpMonths,
  onMarkMonthBackedUp,
  isLoading,
  allowAllModify = true,
  currentUserUid = '',
  logbookOwnerUid = '',
  onEditEntry,
  onDeleteEntry,
  onFocusForm,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<boolean>(false);
  const [supabaseSending, setSupabaseSending] = useState<boolean>(false);
  const [supabaseSuccess, setSupabaseSuccess] = useState<string | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [showCopyPreview, setShowCopyPreview] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [localBackedUpMonths, setLocalBackedUpMonths] = useState<string[]>([]);

  const [aiQuery, setAiQuery] = useState<string>('');
  const [aiLastQuery, setAiLastQuery] = useState<string>('');
  const [aiSearching, setAiSearching] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{
    answer: string;
    matchedIds: string[];
  } | null>(null);

  const isMonthBackedUp = useMemo(
    () =>
      backedUpMonths.includes(selectedMonth) ||
      localBackedUpMonths.includes(selectedMonth),
    [backedUpMonths, localBackedUpMonths, selectedMonth]
  );

  const dayEntries = useMemo(() => {
    return entries
      .filter((item) => item.reportDate === selectedDate)
      .sort((a, b) => {
        const aTime = (a.recordedAt ?? a.createdAt ?? a.updatedAt)?.toMillis() ?? 0;
        const bTime = (b.recordedAt ?? b.createdAt ?? b.updatedAt)?.toMillis() ?? 0;
        return aTime - bTime;
      });
  }, [entries, selectedDate]);

  const monthEntries = useMemo(() => {
    return entries.filter((item) => item.reportMonth === selectedMonth);
  }, [entries, selectedMonth]);

  const handoverEntries = useMemo(
    () => filterEntriesForHandoverWindow(entries, selectedDate),
    [entries, selectedDate]
  );

  const handoverText = useMemo(
    () => formatHandoverText(handoverEntries, selectedDate, logbookName),
    [handoverEntries, selectedDate, logbookName]
  );

  const TASK_PLANNER_URL = 'https://task-planner-utility.ai.studio/';

  const copyTextReliably = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to execCommand fallback
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
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  };

  const handleCopyReport = async () => {
    setSupabaseError(null);
    setSupabaseSuccess(null);

    const copied = await copyTextReliably(handoverText);
    if (copied) {
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 3500);
    } else {
      setShowCopyPreview(true);
    }

    if (handoverEntries.length === 0) {
      setSupabaseSuccess(
        copied
          ? 'คัดลอกข้อความแล้ว (ยังไม่มีรายการในช่วง 7:31AM – 7:30AM จึงไม่ได้ส่งลง Supabase)'
          : null
      );
      return;
    }

    const uniqueReporters = Array.from(
      new Set(handoverEntries.map((e) => e.reporterName.trim()).filter(Boolean))
    );
    const loggedBy =
      uniqueReporters.length > 0 ? uniqueReporters.join(', ') : 'F/O Logbook Team';

    setSupabaseSending(true);
    try {
      const result = await insertFieldLog({
        rawText: handoverText,
        loggedBy,
      });

      if (result.ok) {
        setSupabaseSuccess(
          copied
            ? 'คัดลอกข้อความและบันทึกลง Supabase (field_logs) เรียบร้อยแล้ว'
            : 'บันทึกลง Supabase (field_logs) เรียบร้อยแล้ว'
        );
        setTimeout(() => setSupabaseSuccess(null), 5000);
      } else {
        setSupabaseError(
          `${copied ? 'คัดลอกข้อความแล้ว แต่' : ''}บันทึกลง Supabase (field_logs) ไม่สำเร็จ: ${result.errorMessage || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`
        );
      }
    } finally {
      setSupabaseSending(false);
    }
  };

  const handleExportCsv = async () => {
    const csv = buildMonthlyCsv(monthEntries);
    downloadCsvFile(csv, `FO-Logbook-${selectedMonth}.csv`);
    setLocalBackedUpMonths((prev) =>
      prev.includes(selectedMonth) ? prev : [...prev, selectedMonth]
    );
    setExportNotice(
      `สำรองข้อมูลเดือน ${formatThaiMonthYear(selectedMonth)} (${monthEntries.length} รายการ) เรียบร้อยแล้ว`
    );
    setTimeout(() => setExportNotice(null), 4000);
    await onMarkMonthBackedUp(selectedMonth);
  };

  const handleConfirmDelete = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      await onDeleteEntry(entryId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = aiQuery.trim();
    if (!trimmed) {
      setAiError('กรุณาพิมพ์คำค้นหาหรือคำถามก่อนกดค้นหา');
      return;
    }

    setAiSearching(true);
    setAiError(null);
    setAiLastQuery(trimmed);

    try {
      const sortedAll = [...entries].sort((a, b) => {
        const dateCmp = b.reportDate.localeCompare(a.reportDate);
        if (dateCmp !== 0) return dateCmp;
        const aTime = (a.recordedAt ?? a.createdAt ?? a.updatedAt)?.toMillis() ?? 0;
        const bTime = (b.recordedAt ?? b.createdAt ?? b.updatedAt)?.toMillis() ?? 0;
        return bTime - aTime;
      });

      const payloadEntries = sortedAll.map((item) => {
        const ts = item.recordedAt ?? item.createdAt ?? item.updatedAt;
        const timeDisplay =
          ts && typeof ts.toDate === 'function'
            ? ts.toDate().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : undefined;
        return {
          id: item.id,
          reportDate: item.reportDate,
          unit: item.unit,
          reporterName: item.reporterName,
          shift: item.shift,
          period: item.period,
          details: item.details,
          timeDisplay,
        };
      });

      const response = await fetch('/api/ai/search-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          entries: payloadEntries,
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        matchedIds?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถค้นหาด้วย AI ได้ในขณะนี้');
      }

      setAiResult({
        answer: data.answer || '',
        matchedIds: Array.isArray(data.matchedIds) ? data.matchedIds : [],
      });
    } catch (err) {
      setAiResult(null);
      setAiError(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างค้นหาด้วย AI'
      );
    } finally {
      setAiSearching(false);
    }
  };

  const aiMatchedEntries = useMemo(() => {
    if (!aiResult || aiResult.matchedIds.length === 0) return [];
    const byId = new Map(entries.map((item) => [item.id, item]));
    return aiResult.matchedIds
      .map((id) => byId.get(id))
      .filter((item): item is LogEntry => Boolean(item));
  }, [aiResult, entries]);

  return (
    <section
      aria-labelledby="daily-log-heading"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6"
    >
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-6">
          {/* Entry Counter */}
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-semibold tabular-nums text-blue-700">
              {dayEntries.length}
            </span>
            <span className="text-sm font-medium text-slate-600">รายการ</span>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

          {/* Date Selector */}
          <div className="space-y-1 min-w-0 max-w-full">
            <label
              htmlFor="view-report-date"
              id="daily-log-heading"
              className="block text-xs font-medium text-slate-500"
            >
              ดูรายงานของวันที่
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-label="วันก่อนหน้า"
                onClick={() => onChangeDate(shiftIsoDate(selectedDate, -1))}
                className="h-[38px] w-[38px] inline-flex items-center justify-center border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                id="view-report-date"
                type="date"
                value={selectedDate}
                onChange={(e) => onChangeDate(e.target.value)}
                className="h-[38px] min-w-0 max-w-full px-3 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <button
                type="button"
                aria-label="วันถัดไป"
                onClick={() => onChangeDate(shiftIsoDate(selectedDate, 1))}
                className="h-[38px] w-[38px] inline-flex items-center justify-center border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onChangeDate(getTodayIsoDate())}
                className="h-[38px] px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                วันนี้
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile List View (< md) */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="py-4 space-y-2.5 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-4 bg-slate-200 rounded w-full" />
                <div className="h-3 bg-slate-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : dayEntries.length === 0 ? (
          <div className="py-10 px-2 text-center border-t border-slate-200 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              ยังไม่มีรายงานการทำงานสำหรับวันที่ {formatDisplayDate(selectedDate)}
            </p>
            <p className="text-xs text-slate-500">
              เมื่อบันทึกข้อมูลประจำวันแล้ว รายการจะแสดงที่นี่และพร้อมคัดลอกส่งต่อกะทันที
            </p>
            <button
              type="button"
              onClick={onFocusForm}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              บันทึกรายการแรกของวันนี้
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {dayEntries.map((entry) => {
              const canModify =
                allowAllModify ||
                entry.authorUid === currentUserUid ||
                logbookOwnerUid === currentUserUid;
              const isConfirming = confirmDeleteId === entry.id;

              return (
                <li key={entry.id} className="py-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {entry.unit}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700">
                          Shift {entry.shift}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{entry.period}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDisplayDate(entry.reportDate)}
                        </span>
                      </div>
                    </div>

                    {canModify && !isConfirming && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label="แก้ไขรายการ"
                          onClick={() => onEditEntry(entry)}
                          className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="ลบรายการ"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed break-words">
                    {entry.details}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-xs text-slate-500">
                      ผู้รายงาน: <span className="text-slate-700 font-medium">{entry.reporterName}</span>
                    </span>

                    {canModify && isConfirming && (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={deletingId === entry.id}
                          onClick={() => void handleConfirmDelete(entry.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                        >
                          {deletingId === entry.id ? 'กำลังลบ...' : 'ยืนยันลบ'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Desktop Data Table (>= md) */}
      <div className="hidden md:block overflow-x-auto -mx-6 px-6">
        <table className="w-full border-collapse text-left min-w-[780px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-3 w-[112px]">วันที่</th>
              <th className="py-3 px-3 w-[140px]">Unit</th>
              <th className="py-3 px-3 w-[160px]">ผู้รายงาน</th>
              <th className="py-3 px-3">รายละเอียด</th>
              <th className="py-3 px-3 w-[76px] text-center">Shift</th>
              <th className="py-3 px-3 w-[110px]">ช่วงเวลา</th>
              <th className="py-3 px-3 w-[130px] text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-20" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-24" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-28" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-6 mx-auto" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-16" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 bg-slate-200 rounded w-16 ml-auto" />
                  </td>
                </tr>
              ))
            ) : dayEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 px-4 text-center">
                  <div className="max-w-md mx-auto space-y-3">
                    <p className="text-sm font-medium text-slate-700">
                      ยังไม่มีรายงานการทำงานสำหรับวันที่ {formatDisplayDate(selectedDate)}
                    </p>
                    <p className="text-xs text-slate-500">
                      เมื่อบันทึกข้อมูลประจำวันแล้ว รายการจะแสดงในตารางนี้และพร้อมคัดลอกส่งต่อกะทันที
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={onFocusForm}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        บันทึกรายการแรกของวันนี้
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              dayEntries.map((entry) => {
                const canModify =
                  allowAllModify ||
                  entry.authorUid === currentUserUid ||
                  logbookOwnerUid === currentUserUid;
                const isConfirming = confirmDeleteId === entry.id;

                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/80 transition-colors align-top"
                  >
                    <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDisplayDate(entry.reportDate)}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-slate-900">
                      {entry.unit}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700">
                      {entry.reporterName}
                    </td>
                    <td className="py-3.5 px-3 text-slate-800 whitespace-pre-wrap leading-relaxed break-words">
                      {entry.details}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-900 tabular-nums">
                      {entry.shift}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">
                      {entry.period}
                    </td>
                    <td className="py-3.5 px-3 text-right whitespace-nowrap">
                      {canModify ? (
                        isConfirming ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={deletingId === entry.id}
                              onClick={() => void handleConfirmDelete(entry.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer"
                            >
                              {deletingId === entry.id ? 'กำลังลบ...' : 'ยืนยันลบ'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-md cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              aria-label="แก้ไขรายการ"
                              onClick={() => onEditEntry(entry)}
                              className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="ลบรายการ"
                              onClick={() => setConfirmDeleteId(entry.id)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">อ่านอย่างเดียว</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Handover Copy, Preview & AI Gemini Historical Search */}
      <div className="pt-4 border-t border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              type="button"
              disabled={supabaseSending}
              onClick={() => void handleCopyReport()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[42px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {supabaseSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังส่งลง Supabase...
                </>
              ) : copiedNotice ? (
                <>
                  <Check className="w-4 h-4" />
                  คัดลอกและส่งข้อมูลแล้ว
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  ส่งรายงาน (คัดลอก + บันทึก Supabase)
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowCopyPreview((v) => !v)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] sm:min-h-[42px] text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              {showCopyPreview ? 'ซ่อนตัวอย่างข้อความ' : 'ดูตัวอย่างข้อความ'}
            </button>

            <a
              href={TASK_PLANNER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] sm:min-h-[42px] text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>เปิด UT Report</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Rightmost AI Gemini Historical Search Box */}
          <form
            onSubmit={(e) => void handleAiSearch(e)}
            className="flex items-center gap-2 w-full lg:w-[400px] xl:w-[440px] lg:ml-auto shrink-0"
          >
            <div className="relative flex-1 min-w-0">
              <Sparkles
                className="w-4 h-4 text-blue-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                maxLength={500}
                aria-label="ค้นหาข้อมูลย้อนหลังด้วย AI Gemini"
                placeholder="ถาม AI ค้นหาย้อนหลัง เช่น E-520A, ซ่อมอะไรบ้าง..."
                className="w-full h-[44px] sm:h-[42px] pl-9 pr-8 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              {aiQuery && (
                <button
                  type="button"
                  aria-label="ล้างคำค้นหา"
                  onClick={() => {
                    setAiQuery('');
                    setAiError(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={aiSearching}
              className="inline-flex items-center justify-center gap-1.5 h-[44px] sm:h-[42px] px-3.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {aiSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังค้นหา</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>ค้นหา AI</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            คัดลอกและส่งสรุปรายงานวันที่{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {formatHandoverDateRange(selectedDate)}
            </span>{' '}
            (7:31AM – 7:30AM) ลง Supabase (<span className="font-mono">field_logs</span>)
          </span>
          <span className="font-mono tabular-nums text-slate-500">
            ค้นหาย้อนหลังจากทั้งหมด {entries.length} รายการด้วย Gemini AI
          </span>
        </div>

        {supabaseError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
          >
            <span>{supabaseError}</span>
            <button
              type="button"
              onClick={() => setSupabaseError(null)}
              className="text-xs font-medium text-red-700 hover:underline shrink-0 cursor-pointer"
            >
              ปิด
            </button>
          </div>
        )}

        {supabaseSuccess && (
          <div
            role="status"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{supabaseSuccess}</span>
          </div>
        )}

        {showCopyPreview && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                ตัวอย่างข้อความที่จะคัดลอก
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {handoverEntries.length} รายการ
              </span>
            </div>
            <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
              {handoverText}
            </pre>
          </div>
        )}

        {(aiSearching || aiError || aiResult) && (
          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  ผลการค้นหาย้อนหลังด้วย AI Gemini
                  {aiLastQuery ? `: "${aiLastQuery}"` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAiResult(null);
                  setAiError(null);
                }}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0 cursor-pointer"
              >
                ปิดผลค้นหา
              </button>
            </div>

            {aiSearching ? (
              <div className="flex items-center gap-2 text-sm text-blue-900 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-700 shrink-0" />
                <span>กำลังให้ AI Gemini ค้นหาและสรุปจากบันทึกทั้งหมด {entries.length} รายการ...</span>
              </div>
            ) : aiError ? (
              <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                {aiError}
              </div>
            ) : aiResult ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-white border border-blue-100 rounded-lg p-3.5">
                  {aiResult.answer}
                </p>

                {aiMatchedEntries.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-600">
                      รายการบันทึกที่เกี่ยวข้อง ({aiMatchedEntries.length} รายการ)
                    </div>
                    <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                      {aiMatchedEntries.map((item) => (
                        <li key={item.id} className="p-3 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                              <span className="font-mono font-semibold text-blue-700 tabular-nums">
                                {formatDisplayDate(item.reportDate)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-slate-900">{item.unit}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">Shift {item.shift}</span>
                              <span aria-hidden="true">·</span>
                              <span>{item.period}</span>
                              <span aria-hidden="true">·</span>
                              <span>โดย {item.reporterName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onChangeDate(item.reportDate);
                                if (item.reportDate.length >= 7) {
                                  onChangeMonth(item.reportDate.slice(0, 7));
                                }
                              }}
                              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              ดูวันนั้นในตาราง
                            </button>
                          </div>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                            {item.details}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Monthly CSV Backup */}
      <div className="pt-5 border-t border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label
                htmlFor="backup-month"
                className="block text-sm font-medium text-slate-700"
              >
                เดือนที่ต้องการสำรอง
              </label>
              {isMonthBackedUp && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  สำรองข้อมูลแล้ว
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="backup-month"
                type="month"
                value={selectedMonth}
                onChange={(e) => onChangeMonth(e.target.value)}
                className={`w-full min-w-0 max-w-full sm:w-auto h-[44px] sm:h-[42px] px-3 text-sm font-mono tabular-nums rounded-lg border transition-colors focus:outline-none focus:ring-2 ${
                  isMonthBackedUp
                    ? 'bg-emerald-100 border-emerald-600 text-emerald-950 font-medium focus:ring-emerald-600/20 focus:border-emerald-700'
                    : 'bg-white border-slate-300 text-slate-900 focus:ring-emerald-600/20 focus:border-emerald-600'
                }`}
              />
              <button
                type="button"
                onClick={() => void handleExportCsv()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-[44px] sm:h-[42px] px-5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>สำรองข้อมูลรายเดือน (CSV)</span>
                <Download className="w-4 h-4 opacity-80" />
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 tabular-nums">
            ข้อมูลในเดือน{' '}
            <span className="font-medium text-slate-700">
              {formatThaiMonthYear(selectedMonth)}
            </span>{' '}
            มีทั้งหมด{' '}
            <span className="font-mono font-semibold text-slate-900">
              {monthEntries.length}
            </span>{' '}
            รายการ (รองรับภาษาไทยใน Excel UTF-8)
          </div>
        </div>

        {exportNotice && (
          <div
            role="status"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{exportNotice}</span>
          </div>
        )}
      </div>
    </section>
  );
};
