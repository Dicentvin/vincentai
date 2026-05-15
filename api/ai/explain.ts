// api/ai/explain.ts
import OpenAI from "openai";
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders, parseBody,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
const MODEL = "llama-3.3-70b-versatile";

interface ExplainBody { documentId?: string; concept?: string; }

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  const { documentId, concept } = await parseBody<ExplainBody>(req);
  if (!concept?.trim()) return json(res, 400, { success: false, message: "Concept is required" }, req);

  try {
    let contextText = "";
    if (documentId) {
      const { data: doc } = await supabase
        .from("documents").select("chunks, extracted_text")
        .eq("id", documentId).eq("user_id", user.id).single();
      if (doc) {
        const chunks: { content: string }[] =
          typeof doc.chunks === "string" ? JSON.parse(doc.chunks) : (doc.chunks || []);
        contextText = chunks.slice(0, 4).map(c => c.content).join("\n\n") || (doc.extracted_text || "").slice(0, 4000);
      }
    }

    const resp = await groq.chat.completions.create({
      model: MODEL, temperature: 0.2, max_tokens: 800,
      messages: [
        { role: "system", content: contextText ? `Explain concepts using this document context:\n\n${contextText}` : "You are a helpful educator." },
        { role: "user",   content: `Explain this concept clearly: ${concept}` },
      ],
    });

    const explanation = resp.choices[0]?.message?.content?.trim() || "";
    return json(res, 200, { success: true, concept, explanation }, req);
  } catch (err: unknown) {
    return json(res, 500, { success: false, message: (err as Error).message }, req);
  }
}
