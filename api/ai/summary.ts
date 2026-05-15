// api/ai/summary.ts  — POST /api/ai/summary
import OpenAI from "openai";
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders, parseBody,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
const MODEL = "llama-3.3-70b-versatile";

interface SummaryBody { documentId?: string; }

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  const { documentId } = await parseBody<SummaryBody>(req);
  try {
    const { data: doc } = await supabase
      .from("documents").select("title, chunks, extracted_text")
      .eq("id", documentId).eq("user_id", user.id).single();
    if (!doc) return json(res, 404, { success: false, message: "Document not found" }, req);

    const chunks: { content: string }[] =
      typeof doc.chunks === "string" ? JSON.parse(doc.chunks) : (doc.chunks || []);
    const text = chunks.length ? chunks.map(c => c.content).join("\n\n") : (doc.extracted_text || "");
    if (!text.trim()) return json(res, 400, { success: false, message: "Document has no text" }, req);

    const resp = await groq.chat.completions.create({
      model: MODEL, temperature: 0.2, max_tokens: 1500,
      messages: [
        { role: "system", content: "You are an expert summarizer. Write a clear, structured summary with key points." },
        { role: "user",   content: `Summarize this document:\n\n${text.slice(0, 8000)}` },
      ],
    });

    const summary = resp.choices[0]?.message?.content?.trim() || "";
    return json(res, 200, { success: true, documentId, summary }, req);
  } catch (err: unknown) {
    return json(res, 500, { success: false, message: (err as Error).message }, req);
  }
}
