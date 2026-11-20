import { LogEntry, ShiftPeriod } from '../types/logbook';

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export function getCurrentShiftPeriod(now: Date = new Date()): ShiftPeriod {
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const morningStartMinutes = 7 * 60 + 31; // 07:31
  const morningEndMinutes = 19 * 60 + 30; // 19:30
  if (totalMinutes >= morningStartMinutes && totalMinutes <= morningEndMinutes) {
    return ShiftPeriod.Morning;
  }
  return ShiftPeriod.Night;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentIsoMonth(): string {
  return getTodayIsoDate().slice(0, 7);
}

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return getTodayIsoDate();
  const dt = new Date(y, m - 1, d + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function formatDisplayDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatThaiMonthYear(isoMonth: string): string {
  const parts = isoMonth.split('-');
  if (parts.length !== 2) return isoMonth;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  if (monthIdx < 0 || monthIdx > 11 || Number.isNaN(year)) return isoMonth;
  return `${THAI_MONTHS[monthIdx]} ${year}`;
}

export function formatHandoverDateRange(endDateIso: string): string {
  const startDateIso = shiftIsoDate(endDateIso, -1);
  const [sy, sm, sd] = startDateIso.split('-');
  const [ey, em, ed] = endDateIso.split('-');
  if (!sy || !sm || !sd || !ey || !em || !ed) {
    return formatDisplayDate(endDateIso);
  }
  if (sy === ey && sm === em) {
    return `${sd}-${ed}/${em}/${ey}`;
  }
  if (sy === ey) {
    return `${sd}/${sm}-${ed}/${em}/${ey}`;
  }
  return `${sd}/${sm}/${sy}-${ed}/${em}/${ey}`;
}

const LEADING_TIME_REGEX =
  /^(?:(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM|am|pm|น\.?))?|(?:[01]?\d|2[0-3])\.[0-5]\d\s*(?:AM|PM|am|pm|น\.?))(?=\s|$|[-–:])/;

function hasExplicitLeadingTime(details: string): boolean {
  return LEADING_TIME_REGEX.test(details.trim());
}

function getEntryEffectiveTimestamp(entry: LogEntry) {
  return entry.recordedAt ?? entry.createdAt ?? entry.updatedAt;
}

function formatEntryTime12h(entry: LogEntry): string {
  const ts = getEntryEffectiveTimestamp(entry);
  if (!ts || typeof ts.toDate !== 'function') return '';
  const date = ts.toDate();
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes}${suffix}`;
}

export function filterEntriesForHandoverWindow(
  entries: LogEntry[],
  endDateIso: string
): LogEntry[] {
  const startDateIso = shiftIsoDate(endDateIso, -1);
  const [sy, sm, sd] = startDateIso.split('-').map(Number);
  const [ey, em, ed] = endDateIso.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return [];

  const startMs = new Date(sy, sm - 1, sd, 7, 31, 0, 0).getTime();
  const endMs = new Date(ey, em - 1, ed, 7, 30, 59, 999).getTime();

  return entries.filter((entry) => {
    const ts = getEntryEffectiveTimestamp(entry);
    if (!ts || typeof ts.toDate !== 'function') return false;
    const ms = ts.toDate().getTime();
    return ms >= startMs && ms <= endMs;
  });
}

export function formatHandoverText(
  entries: LogEntry[],
  dateIso: string,
  logbookName?: string
): string {
  const trimmedName = logbookName?.trim() || '';
  const cleanLogbookName =
    !trimmedName ||
    trimmedName === 'F/O Logbook - หลัก' ||
    trimmedName === 'F/O Logbook - ทีมปฏิบัติการ'
      ? 'F/O Logbook'
      : trimmedName;
  const dateRangeDisplay = formatHandoverDateRange(dateIso);
  const header = `รายงานการทำงานประจำวัน (${cleanLogbookName}) — วันที่ ${dateRangeDisplay}`;

  if (entries.length === 0) {
    return `${header}\nยังไม่มีรายการบันทึกประจำวันที่ ${dateRangeDisplay}`;
  }

  const isNightEntry = (entry: LogEntry) => {
    const p = String(entry.period);
    return p === 'Night shift' || p === 'Night';
  };

  const sortByUnitAndShift = (a: LogEntry, b: LogEntry) => {
    const unitCmp = a.unit.localeCompare(b.unit, 'th');
    if (unitCmp !== 0) return unitCmp;
    const shiftCmp = a.shift.localeCompare(b.shift);
    if (shiftCmp !== 0) return shiftCmp;
    const aTime = getEntryEffectiveTimestamp(a)?.toMillis() ?? 0;
    const bTime = getEntryEffectiveTimestamp(b)?.toMillis() ?? 0;
    return aTime - bTime;
  };

  const morningEntries = entries.filter((e) => !isNightEntry(e)).sort(sortByUnitAndShift);
  const nightEntries = entries.filter((e) => isNightEntry(e)).sort(sortByUnitAndShift);

  const lines: string[] = [
    header,
    `จำนวนทั้งหมด: ${entries.length} รายการ`,
  ];

  const appendGroup = (groupLabel: string, groupEntries: LogEntry[]) => {
    if (groupEntries.length === 0) return;
    lines.push('----------------------------------------');
    lines.push(`${groupLabel} (${groupEntries.length} รายการ)`);
    groupEntries.forEach((entry, idx) => {
      const trimmedDetails = entry.details.trim();
      const formattedDetails = trimmedDetails.replace(/\n+/g, '\n   ');
      const timeStr = hasExplicitLeadingTime(trimmedDetails)
        ? ''
        : formatEntryTime12h(entry);
      const timePrefix = timeStr ? `${timeStr} ` : '';
      lines.push(
        `${idx + 1}. [${entry.unit}] Shift ${entry.shift}`,
        `   ${timePrefix}${formattedDetails} By: ${entry.reporterName}`
      );
      if (idx < groupEntries.length - 1) {
        lines.push('');
      }
    });
  };

  appendGroup('Morning shift', morningEntries);
  if (morningEntries.length > 0 && nightEntries.length > 0) {
    lines.push('');
  }
  appendGroup('Night shift', nightEntries);

  return lines.join('\n');
}

function escapeCsvCell(value: string): string {
  const clean = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(clean)) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

export function buildMonthlyCsv(entries: LogEntry[]): string {
  const headers = [
    'วันที่',
    'Unit',
    'ผู้รายงาน',
    'Shift',
    'ช่วงเวลา',
    'รายละเอียดงาน',
    'เวลาที่บันทึก',
  ];

  const sorted = [...entries].sort((a, b) => {
    const dateCmp = a.reportDate.localeCompare(b.reportDate);
    if (dateCmp !== 0) return dateCmp;
    const unitCmp = a.unit.localeCompare(b.unit, 'th');
    if (unitCmp !== 0) return unitCmp;
    return a.shift.localeCompare(b.shift);
  });

  const rows = sorted.map((entry) => {
    const effectiveTs = getEntryEffectiveTimestamp(entry);
    const createdStr = effectiveTs
      ? effectiveTs.toDate().toLocaleString('th-TH', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    return [
      formatDisplayDate(entry.reportDate),
      entry.unit,
      entry.reporterName,
      entry.shift,
      entry.period,
      entry.details,
      createdStr,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // Prepend UTF-8 BOM so Microsoft Excel renders Thai text cleanly
  return `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${rows.join('\n')}`;
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
