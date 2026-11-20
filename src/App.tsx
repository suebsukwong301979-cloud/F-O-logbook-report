import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, DatabaseBackup, Monitor, Smartphone } from 'lucide-react';
import { DailyLogTable } from './components/DailyLogTable';
import { LogForm } from './components/LogForm';
import { PWAInstallButton } from './components/PWAInstallButton';
import { TeamSettingsPanel } from './components/TeamSettingsPanel';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  DEFAULT_REPORTERS,
  DEFAULT_UNITS,
  LEGACY_PLACEHOLDER_REPORTERS,
  LEGACY_PLACEHOLDER_UNITS,
  LogEntry,
  REPORTER_SPELLING_FIXES,
  SCHEMA_LIMITS,
  SHARED_WORKSPACE_ID,
  SharedWorkspace,
  ShiftCode,
  ShiftPeriod,
} from './types/logbook';
import { getCurrentIsoMonth, getTodayIsoDate } from './utils/formatters';

type ActiveTab = 'logbook' | 'settings';

interface LegacyEntryRecord {
  id: string;
  reportDate: string;
  reportMonth: string;
  unit: string;
  reporterName: string;
  shift: ShiftCode;
  period: ShiftPeriod;
  details: string;
  createdAt?: Timestamp;
}

export default function App() {
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('logbook');

  const [workspace, setWorkspace] = useState<SharedWorkspace | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>(getTodayIsoDate());
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentIsoMonth());
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState<boolean>(false);

  // Optional legacy Google Auth session (only used to offer 1-click import of old data)
  const [legacyUser, setLegacyUser] = useState<User | null>(null);
  const [legacyEntries, setLegacyEntries] = useState<LegacyEntryRecord[]>([]);
  const [legacyExtras, setLegacyExtras] = useState<{
    units: string[];
    reporters: string[];
    backedUpMonths: string[];
  }>({ units: [], reporters: [], backedUpMonths: [] });
  const [dismissedLegacyBanner, setDismissedLegacyBanner] = useState(false);
  const [isSigningInLegacy, setIsSigningInLegacy] = useState(false);
  const [isImportingLegacy, setIsImportingLegacy] = useState(false);
  const [importSuccessBanner, setImportSuccessBanner] = useState<string | null>(null);

  const isMobilePreviewFrame =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'mobile';

  const formContainerRef = useRef<HTMLDivElement>(null);
  const bootstrapLockRef = useRef<boolean>(false);

  // Test Firestore connectivity on boot
  useEffect(() => {
    void testFirestoreConnection().then((ok) => {
      if (!ok) {
        setConnectionWarning(
          'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
        );
      }
    });
  }, []);

  // Subscribe to the shared open workspace immediately (no sign-in required)
  useEffect(() => {
    const wsRef = doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID);
    const wsPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}`;

    const unsub = onSnapshot(
      wsRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          if (!bootstrapLockRef.current) {
            bootstrapLockRef.current = true;
            try {
              await setDoc(wsRef, {
                workspaceId: SHARED_WORKSPACE_ID,
                name: 'F/O Logbook - ทีมปฏิบัติการ',
                units: DEFAULT_UNITS,
                reporters: DEFAULT_REPORTERS,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              bootstrapLockRef.current = false;
              handleFirestoreError(err, OperationType.CREATE, wsPath);
            }
          }
          return;
        }

        const data = snapshot.data();
        const rawUnits = Array.isArray(data.units) ? data.units.map(String) : DEFAULT_UNITS;
        const rawReporters = Array.isArray(data.reporters) ? data.reporters.map(String) : [];

        // Replace legacy placeholder values or outdated reporter spellings if present
        const hasLegacyUnits = rawUnits.some((u) => LEGACY_PLACEHOLDER_UNITS.includes(u));
        const hasLegacyReporters = rawReporters.some((r) =>
          LEGACY_PLACEHOLDER_REPORTERS.includes(r)
        );
        const hasOutdatedReporterSpelling = rawReporters.some((r) =>
          Object.prototype.hasOwnProperty.call(REPORTER_SPELLING_FIXES, r)
        );
        if (hasLegacyUnits || hasLegacyReporters || hasOutdatedReporterSpelling) {
          const nextReporters = hasLegacyReporters
            ? DEFAULT_REPORTERS
            : Array.from(
                new Set(rawReporters.map((r) => REPORTER_SPELLING_FIXES[r] ?? r))
              );
          try {
            await updateDoc(wsRef, {
              ...(hasLegacyUnits ? { units: DEFAULT_UNITS } : {}),
              ...(hasLegacyReporters || hasOutdatedReporterSpelling
                ? { reporters: nextReporters }
                : {}),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, wsPath);
          }
          return;
        }

        setWorkspace({
          id: snapshot.id,
          workspaceId: String(data.workspaceId || SHARED_WORKSPACE_ID),
          name: String(data.name || 'F/O Logbook - ทีมปฏิบัติการ'),
          units: rawUnits,
          reporters: rawReporters,
          backedUpMonths: Array.isArray(data.backedUpMonths)
            ? data.backedUpMonths.map(String)
            : [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
        setWorkspaceLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, wsPath);
      }
    );

    return () => unsub();
  }, []);

  // Subscribe to entries in the shared open workspace
  useEffect(() => {
    if (!workspaceLoaded || !workspace) return;

    setEntriesLoading(true);
    const entriesPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}/entries`;
    const q = query(
      collection(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID, 'entries'),
      where('workspaceId', '==', SHARED_WORKSPACE_ID)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: LogEntry[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            workspaceId: String(data.workspaceId || SHARED_WORKSPACE_ID),
            reportDate: String(data.reportDate || ''),
            reportMonth: String(data.reportMonth || ''),
            unit: String(data.unit || ''),
            reporterName: String(data.reporterName || ''),
            shift: (data.shift as ShiftCode) || ShiftCode.A,
            period: (data.period as ShiftPeriod) || ShiftPeriod.Morning,
            details: String(data.details || ''),
            recordedAt: data.recordedAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setEntries(list);
        setEntriesLoading(false);
      },
      (err) => {
        setEntriesLoading(false);
        handleFirestoreError(err, OperationType.LIST, entriesPath);
      }
    );

    return () => unsub();
  }, [workspaceLoaded, workspace]);

  // Listen quietly for any existing Google Auth session to detect legacy signed-in entries
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setLegacyUser(firebaseUser);
      if (!firebaseUser) {
        setLegacyEntries([]);
        setLegacyExtras({ units: [], reporters: [], backedUpMonths: [] });
      }
    });
    return () => unsub();
  }, []);

  // Check if a signed-in legacy user has old entries not yet copied to sharedWorkspaces
  useEffect(() => {
    if (!legacyUser?.email || !workspaceLoaded) return;
    let cancelled = false;

    const loadLegacyData = async () => {
      try {
        const lbQuery = query(
          collection(db, 'logbooks'),
          where('memberEmails', 'array-contains', legacyUser.email)
        );
        const lbSnap = await getDocs(lbQuery);
        if (cancelled || lbSnap.empty) {
          if (!cancelled) {
            setLegacyEntries([]);
          }
          return;
        }

        const collectedUnits = new Set<string>();
        const collectedReporters = new Set<string>();
        const collectedMonths = new Set<string>();
        const collectedEntries: LegacyEntryRecord[] = [];
        const existingIds = new Set(entries.map((e) => e.id));

        for (const lbDoc of lbSnap.docs) {
          const lbData = lbDoc.data();
          if (Array.isArray(lbData.units)) {
            lbData.units.forEach((u) => {
              const s = String(u).trim();
              if (s && !LEGACY_PLACEHOLDER_UNITS.includes(s)) collectedUnits.add(s);
            });
          }
          if (Array.isArray(lbData.reporters)) {
            lbData.reporters.forEach((r) => {
              const s = String(r).trim();
              if (s && !LEGACY_PLACEHOLDER_REPORTERS.includes(s)) collectedReporters.add(s);
            });
          }
          if (Array.isArray(lbData.backedUpMonths)) {
            lbData.backedUpMonths.forEach((m) => {
              const s = String(m).trim();
              if (SCHEMA_LIMITS.MONTH_PATTERN.test(s)) collectedMonths.add(s);
            });
          }

          const entriesQuery = query(
            collection(db, 'logbooks', lbDoc.id, 'entries'),
            where('memberEmails', 'array-contains', legacyUser.email)
          );
          const entriesSnap = await getDocs(entriesQuery);
          entriesSnap.docs.forEach((eDoc) => {
            const deterministicId = `legacy_${eDoc.id}`.slice(0, 128);
            if (existingIds.has(deterministicId)) return;
            const d = eDoc.data();
            const reportDate = String(d.reportDate || '');
            const reportMonth = String(d.reportMonth || reportDate.slice(0, 7));
            if (
              !SCHEMA_LIMITS.DATE_PATTERN.test(reportDate) ||
              !SCHEMA_LIMITS.MONTH_PATTERN.test(reportMonth)
            ) {
              return;
            }
            collectedEntries.push({
              id: deterministicId,
              reportDate,
              reportMonth,
              unit: String(d.unit || '').slice(0, SCHEMA_LIMITS.UNIT_MAX_LENGTH),
              reporterName: String(d.reporterName || '').slice(0, SCHEMA_LIMITS.REPORTER_MAX_LENGTH),
              shift: (d.shift as ShiftCode) || ShiftCode.A,
              period:
                String(d.period) === ShiftPeriod.Night ? ShiftPeriod.Night : ShiftPeriod.Morning,
              details: String(d.details || '').slice(0, SCHEMA_LIMITS.DETAILS_MAX_LENGTH),
              createdAt: d.createdAt instanceof Timestamp ? d.createdAt : undefined,
            });
          });
        }

        if (!cancelled) {
          setLegacyEntries(collectedEntries);
          setLegacyExtras({
            units: Array.from(collectedUnits),
            reporters: Array.from(collectedReporters),
            backedUpMonths: Array.from(collectedMonths),
          });
        }
      } catch {
        // Ignore silent legacy scan failures
      }
    };

    void loadLegacyData();
    return () => {
      cancelled = true;
    };
  }, [legacyUser, workspaceLoaded, entries]);

  const handleSaveEntry = useCallback(
    async (payload: {
      reportDate: string;
      unit: string;
      reporterName: string;
      shift: ShiftCode;
      period: ShiftPeriod;
      details: string;
    }) => {
      if (!workspace) return;
      const reportMonth = payload.reportDate.slice(0, 7);

      if (editingEntry) {
        const entryPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}/entries/${editingEntry.id}`;
        try {
          await updateDoc(
            doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID, 'entries', editingEntry.id),
            {
              reportDate: payload.reportDate,
              reportMonth,
              unit: payload.unit,
              reporterName: payload.reporterName,
              shift: payload.shift,
              period: payload.period,
              details: payload.details,
              updatedAt: serverTimestamp(),
            }
          );
          setEditingEntry(null);
          setSelectedDate(payload.reportDate);
          setSelectedMonth(reportMonth);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, entryPath);
        }
      } else {
        const newRef = doc(collection(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID, 'entries'));
        const entryPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}/entries/${newRef.id}`;
        try {
          await setDoc(newRef, {
            workspaceId: SHARED_WORKSPACE_ID,
            reportDate: payload.reportDate,
            reportMonth,
            unit: payload.unit,
            reporterName: payload.reporterName,
            shift: payload.shift,
            period: payload.period,
            details: payload.details,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setSelectedDate(payload.reportDate);
          setSelectedMonth(reportMonth);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, entryPath);
        }
      }
    },
    [workspace, editingEntry]
  );

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      const entryPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}/entries/${entryId}`;
      try {
        await deleteDoc(doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID, 'entries', entryId));
        if (editingEntry?.id === entryId) {
          setEditingEntry(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, entryPath);
      }
    },
    [editingEntry]
  );

  const handleUpdateWorkspaceSettings = useCallback(
    async (updates: { name?: string; units?: string[]; reporters?: string[] }) => {
      if (!workspace) return;
      const wsPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}`;
      try {
        await updateDoc(doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID), {
          ...updates,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, wsPath);
      }
    },
    [workspace]
  );

  const handleMarkMonthBackedUp = useCallback(
    async (month: string) => {
      if (!workspace || !SCHEMA_LIMITS.MONTH_PATTERN.test(month)) return;
      const existing = workspace.backedUpMonths || [];
      if (existing.includes(month)) return;
      const nextMonths = [...existing, month].slice(-SCHEMA_LIMITS.BACKED_UP_MONTHS_MAX);
      const wsPath = `sharedWorkspaces/${SHARED_WORKSPACE_ID}`;
      try {
        await updateDoc(doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID), {
          backedUpMonths: nextMonths,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, wsPath);
      }
    },
    [workspace]
  );

  const handleQuickAddReporter = useCallback(
    async (name: string) => {
      if (!workspace) return;
      if (workspace.reporters.includes(name)) return;
      if (workspace.reporters.length >= SCHEMA_LIMITS.REPORTERS_MAX_COUNT) {
        throw new Error(`เพิ่มรายชื่อผู้รายงานได้สูงสุด ${SCHEMA_LIMITS.REPORTERS_MAX_COUNT} คน`);
      }
      await handleUpdateWorkspaceSettings({
        reporters: [...workspace.reporters, name],
      });
    },
    [workspace, handleUpdateWorkspaceSettings]
  );

  const handleConnectLegacyGoogle = useCallback(async () => {
    setIsSigningInLegacy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } finally {
      setIsSigningInLegacy(false);
    }
  }, []);

  const handleDisconnectLegacyGoogle = useCallback(async () => {
    await signOut(auth);
  }, []);

  const handleImportLegacyData = useCallback(async (): Promise<number> => {
    if (!workspace || legacyEntries.length === 0) return 0;
    setIsImportingLegacy(true);
    try {
      const mergedUnits = Array.from(new Set([...workspace.units, ...legacyExtras.units])).slice(
        0,
        SCHEMA_LIMITS.UNITS_MAX_COUNT
      );
      const mergedReporters = Array.from(
        new Set([...workspace.reporters, ...legacyExtras.reporters])
      ).slice(0, SCHEMA_LIMITS.REPORTERS_MAX_COUNT);
      const mergedMonths = Array.from(
        new Set([...(workspace.backedUpMonths || []), ...legacyExtras.backedUpMonths])
      ).slice(-SCHEMA_LIMITS.BACKED_UP_MONTHS_MAX);

      await updateDoc(doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID), {
        units: mergedUnits,
        reporters: mergedReporters,
        backedUpMonths: mergedMonths,
        updatedAt: serverTimestamp(),
      });

      const chunkSize = 400;
      for (let i = 0; i < legacyEntries.length; i += chunkSize) {
        const batch = writeBatch(db);
        const slice = legacyEntries.slice(i, i + chunkSize);
        slice.forEach((item) => {
          const targetRef = doc(db, 'sharedWorkspaces', SHARED_WORKSPACE_ID, 'entries', item.id);
          batch.set(targetRef, {
            workspaceId: SHARED_WORKSPACE_ID,
            reportDate: item.reportDate,
            reportMonth: item.reportMonth,
            unit: item.unit || workspace.units[0] || 'SA/IA Unit',
            reporterName: item.reporterName || 'Operator',
            shift: item.shift,
            period: item.period,
            details: item.details,
            ...(item.createdAt ? { recordedAt: item.createdAt } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      const importedCount = legacyEntries.length;
      setLegacyEntries([]);
      setImportSuccessBanner(
        `นำเข้าข้อมูลเดิมจำนวน ${importedCount} รายการเข้าสมุดบันทึกกลางเรียบร้อยแล้ว`
      );
      return importedCount;
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `sharedWorkspaces/${SHARED_WORKSPACE_ID}/entries`
      );
    } finally {
      setIsImportingLegacy(false);
    }
  }, [workspace, legacyEntries, legacyExtras]);

  const handleFocusForm = () => {
    setActiveTab('logbook');
    setTimeout(() => {
      formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const textarea = document.getElementById('log-details');
      textarea?.focus();
    }, 50);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col overflow-x-hidden">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 md:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('logbook');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            F/O Logbook<span className="hidden sm:inline"> Report</span>
          </a>

          <nav
            aria-label="เมนูหลัก"
            className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('logbook')}
              className={`py-4 sm:py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'logbook'
                  ? 'border-blue-700 text-blue-700 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              รายงาน<span className="hidden sm:inline">ประจำวัน</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-4 sm:py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-blue-700 text-blue-700 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              ตั้งค่า<span className="hidden sm:inline">ทีมและ Unit</span>
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6">
        {connectionWarning && (
          <div
            role="alert"
            className="px-4 py-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl"
          >
            {connectionWarning}
          </div>
        )}

        {!workspaceLoaded || !workspace ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-600">กำลังเชื่อมต่อสมุดบันทึกทีม F/O Logbook...</p>
          </div>
        ) : (
          <>
            {importSuccessBanner && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{importSuccessBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setImportSuccessBanner(null)}
                  className="text-xs font-medium text-emerald-800 hover:underline shrink-0 cursor-pointer"
                >
                  ปิด
                </button>
              </div>
            )}

            {legacyUser?.email && legacyEntries.length > 0 && !dismissedLegacyBanner && (
              <div
                role="status"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-sm text-blue-950 bg-blue-50 border border-blue-200 rounded-xl"
              >
                <div className="flex items-start gap-2.5">
                  <DatabaseBackup className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>
                    พบข้อมูลเดิมจากบัญชี{' '}
                    <span className="font-mono font-medium">{legacyUser.email}</span> จำนวน{' '}
                    <strong>{legacyEntries.length} รายการ</strong>{' '}
                    ที่ยังไม่ได้ย้ายเข้าสมุดบันทึกกลาง
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isImportingLegacy}
                    onClick={() => void handleImportLegacyData()}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isImportingLegacy ? 'กำลังนำเข้า...' : 'นำเข้าเข้าสมุดกลาง'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedLegacyBanner(true)}
                    className="px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:underline cursor-pointer"
                  >
                    ซ่อน
                  </button>
                </div>
              </div>
            )}

            {/* Workspace Context Sub-Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  รายงานการทำงานประจำวัน
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  <span>{workspace.name}</span>
                  <span aria-hidden="true" className="mx-2">
                    ·
                  </span>
                  <span>ใช้งานร่วมกันทั้งทีม (ไม่ต้องลงชื่อ)</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 max-w-full">
                {!isMobilePreviewFrame && (
                  <button
                    type="button"
                    onClick={() => setShowMobilePreview((v) => !v)}
                    className={`hidden md:inline-flex items-center gap-1.5 h-[36px] px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showMobilePreview
                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {showMobilePreview ? (
                      <>
                        <Monitor className="w-3.5 h-3.5" />
                        กลับสู่มุมมองเดสก์ท็อป
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-3.5 h-3.5" />
                        ดูมุมมองมือถือ
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {showMobilePreview && !isMobilePreviewFrame ? (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-6 flex flex-col items-center gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4 w-full max-w-[390px]">
                  <span className="text-xs font-medium text-slate-600 font-mono tabular-nums">
                    Mobile Preview · 390 × 780 px
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMobilePreview(false)}
                    className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                  >
                    ปิดมุมมองมือถือ
                  </button>
                </div>
                <div className="w-[390px] max-w-full h-[780px] bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
                  <iframe
                    src="/?preview=mobile"
                    title="มุมมองมือถือ F/O Logbook Report"
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            ) : activeTab === 'logbook' ? (
              <div className="space-y-6">
                <div ref={formContainerRef}>
                  <LogForm
                    units={workspace.units}
                    reporters={workspace.reporters}
                    editingEntry={editingEntry}
                    defaultDate={selectedDate}
                    onSaveEntry={handleSaveEntry}
                    onCancelEdit={() => setEditingEntry(null)}
                    onQuickAddReporter={handleQuickAddReporter}
                  />
                </div>

                <DailyLogTable
                  logbookName={workspace.name}
                  entries={entries}
                  selectedDate={selectedDate}
                  onChangeDate={(d) => {
                    setSelectedDate(d);
                    if (d.length >= 7) {
                      setSelectedMonth(d.slice(0, 7));
                    }
                  }}
                  selectedMonth={selectedMonth}
                  onChangeMonth={setSelectedMonth}
                  backedUpMonths={workspace.backedUpMonths || []}
                  onMarkMonthBackedUp={handleMarkMonthBackedUp}
                  isLoading={entriesLoading}
                  allowAllModify={true}
                  onEditEntry={(entry) => {
                    setEditingEntry(entry);
                    formContainerRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  onDeleteEntry={handleDeleteEntry}
                  onFocusForm={handleFocusForm}
                />
              </div>
            ) : (
              <TeamSettingsPanel
                workspace={workspace}
                onUpdateWorkspaceSettings={handleUpdateWorkspaceSettings}
                legacyUserEmail={legacyUser?.email || null}
                legacyEntriesCount={legacyEntries.length}
                isSigningInLegacy={isSigningInLegacy}
                isImportingLegacy={isImportingLegacy}
                onConnectLegacyGoogle={handleConnectLegacyGoogle}
                onDisconnectLegacyGoogle={handleDisconnectLegacyGoogle}
                onImportLegacyData={handleImportLegacyData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
