// api/ai/flashcards.ts  — POST /api/ai/flashcards
import OpenAI from "openai";
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders, parseBody,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
const MODEL = "llama-3.3-70b-versatile";

interface FlashcardRow { id: string; question: string; answer: string; starred: boolean; reviewed: boolean; }
interface RawCard { question: string; answer: string; }

function parseJSON(raw: string): RawCard[] | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function mapCard(c: FlashcardRow) {
  return { _id: c.id, question: c.question, answer: c.answer, starred: c.starred, reviewed: c.reviewed };
}

async function getDocumentChunks(docId: string, userId: string) {
  const { data } = await supabase
    .from("documents").select("chunks, extracted_text, title")
    .eq("id", docId).eq("user_id", userId).single();
  if (!data) return null;
  const chunks: { content: string }[] =
    typeof data.chunks === "string" ? JSON.parse(data.chunks) : (data.chunks || []);
  const text = chunks.length ? chunks.map(c => c.content).join("\n\n") : (data.extracted_text || "");
  return { text, title: data.title as string };
}

interface FlashcardsBody { documentId?: string; count?: number; }

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  if (req.method === "POST") {
    const { documentId, count = 20 } = await parseBody<FlashcardsBody>(req);
    if (!documentId) return json(res, 400, { success: false, message: "documentId required" }, req);

    const doc = await getDocumentChunks(documentId, user.id);
    if (!doc) return json(res, 404, { success: false, message: "Document not found" }, req);
    if (doc.text.trim().length < 50) return json(res, 400, { success: false, message: "Document has too little text" }, req);

    try {
      const response = await groq.chat.completions.create({
        model: MODEL, temperature: 0.2, max_tokens: 3000,
        messages: [
          { role: "system", content: 'You are a study tool. Generate flashcards as a JSON array: [{"question":"...","answer":"..."}]. Return ONLY the JSON array, no explanation.' },
          { role: "user",   content: `Generate ${count} flashcards from this text:\n\n${doc.text.slice(0, 8000)}` },
        ],
      });

      const cards = parseJSON(response.choices[0]?.message?.content || "");
      if (!cards?.length) return json(res, 500, { success: false, message: "AI returned no flashcards" }, req);

      await supabase.from("flashcards").delete().eq("document_id", documentId).eq("user_id", user.id);

      const rows = cards.map(c => ({
        user_id: user.id, document_id: documentId,
        question: c.question, answer: c.answer,
        reviewed: false, starred: false,
      }));

      const { data: inserted, error } = await supabase.from("flashcards").insert(rows).select();
      if (error) throw error;

      return json(res, 201, {
        success: true,
        message: `${inserted.length} flashcards generated`,
        count: inserted.length,
        flashcards: (inserted as FlashcardRow[]).map(mapCard),
      }, req);
    } catch (err: unknown) {
      console.error("createFlashcards error:", err);
      return json(res, 500, { success: false, message: (err as Error).message }, req);
    }
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}
