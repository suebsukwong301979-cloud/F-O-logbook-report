import type { Timestamp } from 'firebase/firestore';

export enum ShiftCode {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export enum ShiftPeriod {
  Morning = 'Morning shift',
  Night = 'Night shift',
}

export const SHIFT_OPTIONS: ShiftCode[] = [
  ShiftCode.A,
  ShiftCode.B,
  ShiftCode.C,
  ShiftCode.D,
];

export const PERIOD_OPTIONS: { value: ShiftPeriod; label: string }[] = [
  { value: ShiftPeriod.Morning, label: 'Morning shift' },
  { value: ShiftPeriod.Night, label: 'Night shift' },
];

export const DEFAULT_UNITS = [
  'SA/IA Unit',
  'EDG Unit',
  'RW/FLW Unit',
  'FW Unit',
  'DIW Unit',
  'Chemical Unit',
  'Tank Yard Unit',
  'Steam Unit',
  'Fuel gas (FG) Unit',
  'Hydrogen (H2) Unit',
  'Nitrogen (N2) Unit',
  'WWT Unit',
  'SC polisher Unit',
  'Dehydrator Unit',
  'EP Supply Unit',
  'SAP Today',
];

export const LEGACY_PLACEHOLDER_UNITS = [
  'Utility Unit',
  'Process Unit 1',
  'Process Unit 2',
  'Control Room',
];

export const DEFAULT_REPORTERS = [
  'Anan S.',
  'Aukkawatin S.',
  'Adirek P.',
  'Krissana P.',
  'Kreangsuk S.',
  'Komsun S.',
  'Prayoot K.',
  'Pullop K.',
  'Somchai N.',
  'Sunchai A.',
  'Theerasuk C.',
  'Wallop W.',
];

export const LEGACY_PLACEHOLDER_REPORTERS = [
  'สมชาย ใจดี',
  'วิชัย รุ่งเรือง',
  'กิตติพงษ์ ศรีสุข',
  'ณัฐพล มั่นคง',
];

export const REPORTER_SPELLING_FIXES: Record<string, string> = {
  'Aukkatin S.': 'Aukkawatin S.',
  'Aukkatin S': 'Aukkawatin S.',
  'Aukawatin S.': 'Aukkawatin S.',
  'Aukawatin S': 'Aukkawatin S.',
};

export const REPORTER_DEFAULT_SHIFTS: Record<string, ShiftCode> = {
  // Shift A
  'adirek p.': ShiftCode.A,
  'krissana p.': ShiftCode.A,
  'komson s.': ShiftCode.A,
  'komsun s.': ShiftCode.A,
  // Shift B
  'anan s.': ShiftCode.B,
  'kreangsuk s.': ShiftCode.B,
  'prayoot k.': ShiftCode.B,
  // Shift C
  'aukkawatin s.': ShiftCode.C,
  'aukkawatin s': ShiftCode.C,
  'aukawatin s.': ShiftCode.C,
  'aukkatin s.': ShiftCode.C,
  'theerasuk s.': ShiftCode.C,
  'theerasuk c.': ShiftCode.C,
  'pullop k.': ShiftCode.C,
  // Shift D
  'somchai n.': ShiftCode.D,
  'sunchai a.': ShiftCode.D,
  'wallop w.': ShiftCode.D,
};

export function getDefaultShiftForReporter(reporterName: string): ShiftCode | null {
  const normalized = reporterName.trim().toLowerCase();
  return REPORTER_DEFAULT_SHIFTS[normalized] ?? null;
}

// Constraints synchronized with firebase-blueprint.json
export const SCHEMA_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  MONTH_PATTERN: /^\d{4}-\d{2}$/,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  LOGBOOK_NAME_MAX: 120,
  UNIT_MAX_LENGTH: 80,
  UNITS_MAX_COUNT: 20,
  REPORTER_MAX_LENGTH: 80,
  REPORTERS_MAX_COUNT: 50,
  MEMBERS_MAX_COUNT: 20,
  BACKED_UP_MONTHS_MAX: 120,
  INVITE_CODE_MIN: 16,
  INVITE_CODE_MAX: 64,
  DETAILS_MAX_LENGTH: 4000,
} as const;

export const SHARED_WORKSPACE_ID = 'fo-logbook-main';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  activeLogbookId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SharedWorkspace {
  id: string;
  workspaceId: string;
  name: string;
  units: string[];
  reporters: string[];
  backedUpMonths?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Logbook {
  id: string;
  ownerId: string;
  name: string;
  units: string[];
  reporters: string[];
  memberEmails: string[];
  backedUpMonths?: string[];
  inviteCode?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TeamInvite {
  code: string;
  logbookId: string;
  logbookName: string;
  ownerId: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LogEntry {
  id: string;
  workspaceId?: string;
  logbookId?: string;
  ownerId?: string;
  authorUid?: string;
  memberEmails?: string[];
  reportDate: string; // YYYY-MM-DD
  reportMonth: string; // YYYY-MM
  unit: string;
  reporterName: string;
  shift: ShiftCode;
  period: ShiftPeriod;
  details: string;
  recordedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
