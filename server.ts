import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface SearchableEntry {
  id: string;
  reportDate: string;
  unit: string;
  reporterName: string;
  shift: string;
  period: string;
  details: string;
  timeDisplay?: string;
}

interface SearchLogsRequestBody {
  query?: unknown;
  entries?: unknown;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeEntries(raw: unknown): SearchableEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: SearchableEntry[] = [];
  for (const item of raw.slice(0, 2500)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.slice(0, 128) : '';
    const reportDate = typeof rec.reportDate === 'string' ? rec.reportDate.slice(0, 20) : '';
    const unit = typeof rec.unit === 'string' ? rec.unit.slice(0, 80) : '';
    const reporterName =
      typeof rec.reporterName === 'string' ? rec.reporterName.slice(0, 80) : '';
    const shift = typeof rec.shift === 'string' ? rec.shift.slice(0, 10) : '';
    const period = typeof rec.period === 'string' ? rec.period.slice(0, 30) : '';
    const details = typeof rec.details === 'string' ? rec.details.slice(0, 4000) : '';
    const timeDisplay =
      typeof rec.timeDisplay === 'string' ? rec.timeDisplay.slice(0, 20) : undefined;

    if (!id || !details) continue;
    result.push({
      id,
      reportDate,
      unit,
      reporterName,
      shift,
      period,
      details,
      timeDisplay,
    });
  }
  return result;
}

async function generateSearchResponse(
  ai: GoogleGenAI,
  userQuery: string,
  entries: SearchableEntry[]
): Promise<{ answer: string; matchedIds: string[] }> {
  const compactHistory = entries
    .map((e) => {
      const timeTag = e.timeDisplay ? ` ${e.timeDisplay}` : '';
      return `[ID:${e.id}] ${e.reportDate}${timeTag} | ${e.unit} | Shift ${e.shift} | ${e.period} | โดย ${e.reporterName}\nรายละเอียด: ${e.details}`;
    })
    .join('\n---\n');

  const promptText = `คำถาม / คำค้นหาจากผู้ใช้งาน: "${userQuery}"

ข้อมูลประวัติรายงาน F/O Logbook ทั้งหมดที่บันทึกไว้ (จำนวน ${entries.length} รายการ):
${compactHistory}`;

  const systemInstruction = `คุณคือผู้ช่วย AI ค้นหาข้อมูลย้อนหลังในระบบ F/O Logbook Report ของทีมปฏิบัติการภาคสนาม
หน้าที่ของคุณ:
1. ค้นหาและวิเคราะห์จาก "ข้อมูลประวัติรายงาน F/O Logbook ทั้งหมดที่บันทึกไว้" เท่านั้น ห้ามคาดเดาหรือแต่งข้อมูลที่ไม่มีในบันทึก
2. ตอบเป็นภาษาไทยที่กระชับ ชัดเจน อ่านง่าย (ระบุวันที่, Unit, Shift, ผู้รายงาน และรายละเอียดงานที่พบให้ครบถ้วน)
3. ในฟิลด์ matchedIds ให้ใส่เฉพาะค่า ID ของรายการที่ตรงหรือเกี่ยวข้องกับคำถามมากที่สุด เรียงจากรายการล่าสุดหรือเกี่ยวข้องที่สุดก่อน (สูงสุด 20 รายการ)
4. หากไม่พบข้อมูลที่เกี่ยวข้องในประวัติเลย ให้ตอบใน answer ว่า "ไม่พบข้อมูลที่เกี่ยวข้องกับคำค้นหานี้ในประวัติรายงานที่บันทึกไว้" และส่ง matchedIds เป็น []`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description: 'Concise Thai summary answering the search query based strictly on the log entries.',
              },
              matchedIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exact IDs of matching log entries sorted by relevance and recency.',
              },
            },
            required: ['answer', 'matchedIds'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as {
        answer?: unknown;
        matchedIds?: unknown;
      };
      const validIdSet = new Set(entries.map((e) => e.id));
      const matchedIds = Array.isArray(parsed.matchedIds)
        ? Array.from(
            new Set(
              parsed.matchedIds
                .filter((id): id is string => typeof id === 'string' && validIdSet.has(id))
            )
          ).slice(0, 20)
        : [];
      const answer =
        typeof parsed.answer === 'string' && parsed.answer.trim()
          ? parsed.answer.trim()
          : matchedIds.length > 0
            ? `พบข้อมูลที่เกี่ยวข้องจำนวน ${matchedIds.length} รายการ`
            : 'ไม่พบข้อมูลที่เกี่ยวข้องกับคำค้นหานี้ในประวัติรายงานที่บันทึกไว้';

      return { answer, matchedIds };
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isNonRetryable =
        errMsg.includes('API_KEY_INVALID') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('400') ||
        errMsg.includes('403') ||
        errMsg.includes('404');
      if (isNonRetryable || attempt === 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  throw lastError;
}

function isForbiddenServiceRoleKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('sb_secret_')) return true;
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        role?: unknown;
      };
      if (payload.role === 'service_role') return true;
    } catch {
      // Non-JWT publishable key format
    }
  }
  return false;
}

const SUPABASE_KEY_ENV_CANDIDATES = [
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'VITE_SUPABASE_KEY',
  'SUPABASE_KEY',
  'VITE_SUPABASE_API_KEY',
  'SUPABASE_API_KEY',
  'SUPABASE_PUBLIC_KEY',
  'VITE_SUPABASE_PUBLIC_KEY',
];

function resolveServerSupabaseKey(): { key: string; rejectedServiceRole: boolean } {
  let sawServiceRole = false;

  for (const name of SUPABASE_KEY_ENV_CANDIDATES) {
    const val = process.env[name]?.trim() || '';
    if (!val) continue;
    if (isForbiddenServiceRoleKey(val)) {
      sawServiceRole = true;
      continue;
    }
    return { key: val, rejectedServiceRole: false };
  }

  for (const [name, rawVal] of Object.entries(process.env)) {
    const val = rawVal?.trim() || '';
    if (!val) continue;
    if (/url/i.test(name)) continue;
    const nameMatches = /supa|anon|publishable/i.test(name);
    const looksLikePublishable = val.startsWith('sb_publishable_');
    if (!nameMatches && !looksLikePublishable) continue;
    if (isForbiddenServiceRoleKey(val)) {
      sawServiceRole = true;
      continue;
    }
    return { key: val, rejectedServiceRole: false };
  }

  return { key: '', rejectedServiceRole: sawServiceRole };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/supabase-config', (_req: Request, res: Response) => {
    const url =
      process.env.VITE_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      'https://kvwxqrywtyvhuvrzrkcf.supabase.co';
    const { key: rawKey, rejectedServiceRole } = resolveServerSupabaseKey();

    if (!rawKey) {
      if (rejectedServiceRole) {
        res.status(400).json({
          error:
            'ตรวจพบ service_role / secret key ซึ่งห้ามส่งไปฝั่ง client กรุณาใช้ Publishable (anon) key แทน',
        });
        return;
      }
      res.status(404).json({
        error:
          'ยังไม่ได้ตั้งค่า VITE_SUPABASE_ANON_KEY (Publishable / anon key) ใน Settings > Secrets',
      });
      return;
    }

    res.json({ url, anonKey: rawKey });
  });

  app.post('/api/ai/search-logs', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as SearchLogsRequestBody;
      const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';

      if (!rawQuery) {
        res.status(400).json({ error: 'กรุณากรอกคำค้นหาหรือคำถามที่ต้องการให้ AI ช่วยค้นหา' });
        return;
      }
      if (rawQuery.length > 500) {
        res.status(400).json({ error: 'คำค้นหายาวเกินไป (สูงสุด 500 ตัวอักษร)' });
        return;
      }

      const entries = sanitizeEntries(body.entries);
      if (entries.length === 0) {
        res.json({
          answer: 'ยังไม่มีข้อมูลรายงานที่บันทึกไว้ในระบบสำหรับค้นหา',
          matchedIds: [],
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(500).json({
          error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ กรุณาตรวจสอบใน Settings > Secrets',
        });
        return;
      }

      const result = await generateSearchResponse(ai, rawQuery, entries);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini AI';
      console.error('Gemini search error:', message);
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'โควตาการใช้งาน Gemini AI เต็มชั่วคราว กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        });
        return;
      }
      if (
        message.includes('API_KEY_INVALID') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('403')
      ) {
        res.status(403).json({
          error: 'คีย์ GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน กรุณาตรวจสอบใน Settings > Secrets',
        });
        return;
      }
      res.status(500).json({
        error: `ไม่สามารถค้นหาด้วย AI ได้ในขณะนี้: ${message}`,
      });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
