import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://kvwxqrywtyvhuvrzrkcf.supabase.co';

const BUILD_TIME_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  '';

function isForbiddenServiceRoleKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('sb_secret_')) return true;

  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = JSON.parse(atob(padded)) as { role?: unknown };
      if (payload.role === 'service_role') {
        return true;
      }
    } catch {
      // Non-JWT publishable key format (e.g. sb_publishable_...)
    }
  }
  return false;
}

let cachedClient: SupabaseClient | null = null;
let cachedConfigPromise: Promise<{ url: string; anonKey: string; error?: string }> | null = null;

async function resolveSupabaseConfig(): Promise<{ url: string; anonKey: string; error?: string }> {
  if (BUILD_TIME_ANON_KEY) {
    if (isForbiddenServiceRoleKey(BUILD_TIME_ANON_KEY)) {
      return {
        url: SUPABASE_URL,
        anonKey: '',
        error:
          'ตรวจพบ service_role / secret key ซึ่งห้ามใช้ฝั่ง client กรุณาเปลี่ยนเป็น Publishable (anon) key ใน Settings > Secrets',
      };
    }
    return { url: SUPABASE_URL, anonKey: BUILD_TIME_ANON_KEY };
  }

  if (!cachedConfigPromise) {
    cachedConfigPromise = fetch('/api/supabase-config')
      .then(async (res) => {
        const data = (await res.json()) as { url?: string; anonKey?: string; error?: string };
        if (!res.ok) {
          return {
            url: SUPABASE_URL,
            anonKey: '',
            error: data.error || 'ไม่สามารถอ่านค่าการเชื่อมต่อ Supabase จากเซิร์ฟเวอร์ได้',
          };
        }
        const anonKey = typeof data.anonKey === 'string' ? data.anonKey.trim() : '';
        const url = typeof data.url === 'string' && data.url.trim() ? data.url.trim() : SUPABASE_URL;
        if (!anonKey) {
          return {
            url,
            anonKey: '',
            error:
              'ยังไม่ได้ตั้งค่า VITE_SUPABASE_ANON_KEY (Publishable / anon key) ใน Settings > Secrets',
          };
        }
        if (isForbiddenServiceRoleKey(anonKey)) {
          return {
            url,
            anonKey: '',
            error:
              'ตรวจพบ service_role / secret key ซึ่งห้ามใช้ฝั่ง client กรุณาเปลี่ยนเป็น Publishable (anon) key ใน Settings > Secrets',
          };
        }
        return { url, anonKey };
      })
      .catch(() => ({
        url: SUPABASE_URL,
        anonKey: '',
        error:
          'ยังไม่ได้ตั้งค่า VITE_SUPABASE_ANON_KEY (Publishable / anon key) ใน Settings > Secrets',
      }));
  }

  const resolved = await cachedConfigPromise;
  if (!resolved.anonKey) {
    // Allow retry if user configures secret later and reloads
    cachedConfigPromise = null;
  }
  return resolved;
}

export async function getSupabaseClient(): Promise<
  { client: SupabaseClient; error: null } | { client: null; error: string }
> {
  if (cachedClient) {
    return { client: cachedClient, error: null };
  }

  const config = await resolveSupabaseConfig();
  if (!config.anonKey) {
    return {
      client: null,
      error:
        config.error ||
        'ยังไม่ได้ตั้งค่า VITE_SUPABASE_ANON_KEY (Publishable / anon key) ใน Settings > Secrets',
    };
  }

  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { client: cachedClient, error: null };
}

export interface InsertFieldLogInput {
  rawText: string;
  loggedBy: string;
}

export interface SupabaseActionResult {
  ok: boolean;
  errorMessage?: string;
}

function formatSupabaseError(error: { message?: string; code?: string; details?: string }): string {
  const code = error.code || '';
  const msg = error.message || 'ไม่ทราบสาเหตุ';
  if (code === '42501' || msg.toLowerCase().includes('row-level security')) {
    return `ติดสิทธิ์ RLS Policy ของตาราง field_logs (${msg}) — กรุณาเพิ่ม RLS Policy สำหรับ role anon ใน Supabase`;
  }
  if (code === '42P01' || msg.toLowerCase().includes('does not exist')) {
    return `ไม่พบตาราง field_logs หรือคอลัมน์ใน Supabase (${msg})`;
  }
  return code ? `${msg} (code: ${code})` : msg;
}

export async function insertFieldLog(input: InsertFieldLogInput): Promise<SupabaseActionResult> {
  const cleanText = input.rawText.trim();
  if (!cleanText) {
    return { ok: false, errorMessage: 'ไม่มีข้อความสำหรับบันทึกลง Supabase' };
  }

  const { client, error: clientError } = await getSupabaseClient();
  if (!client) {
    return { ok: false, errorMessage: clientError };
  }

  const cleanLoggedBy = input.loggedBy.trim() || 'F/O Logbook Team';

  const { error } = await client.from('field_logs').insert({
    log_type: 'unclassified',
    data: { raw_text: cleanText },
    logged_at: new Date().toISOString(),
    logged_by: cleanLoggedBy,
    source_note: 'UT Report app',
  });

  if (error) {
    return {
      ok: false,
      errorMessage: formatSupabaseError(error),
    };
  }

  return { ok: true };
}
