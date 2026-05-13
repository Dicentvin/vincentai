// api/ai/flashcards.js
// POST /api/ai/flashcards — generate flashcards
// GET  /api/ai/flashcards/:documentId — get saved flashcards
// PATCH /api/ai/flashcards/:id — update starred/reviewed
import OpenAI from "openai";
import { supabase } from "../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

const groq = new OpenAI({
  apiKey:  process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const MODEL = "llama-3.3-70b-versatile";

function parseJSON(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

async function getDocumentChunks(docId, userId) {
  const { data } = await supabase
    .from("documents")
    .select("chunks, extracted_text, title")
    .eq("id", docId)
    .eq("user_id", userId)
    .single();
  if (!data) return null;
  const chunks = typeof data.chunks === "string" ? JSON.parse(data.chunks) : (data.chunks || []);
  const text = chunks.length
    ? chunks.map(c => c.content).join("\n\n")
    : (data.extracted_text || "");
  return { text, title: data.title };
}

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  // POST — generate
  if (req.method === "POST") {
    const { documentId, count = 20 } = req.body;
    if (!documentId) return json(res, 400, { success: false, message: "documentId required" }, req);

    const doc = await getDocumentChunks(documentId, user.id);
    if (!doc) return json(res, 404, { success: false, message: "Document not found" }, req);
    if (doc.text.trim().length < 50) return json(res, 400, { success: false, message: "Document has too little text" }, req);

    try {
      const response = await groq.chat.completions.create({
        model: MODEL, temperature: 0.2, max_tokens: 3000,
        messages: [
          { role: "system", content: "You are a study tool. Generate flashcards as a JSON array: [{\"question\":\"...\",\"answer\":\"...\"}]. Return ONLY the JSON array, no explanation." },
          { role: "user",   content: `Generate ${count} flashcards from this text:\n\n${doc.text.slice(0, 8000)}` },
        ],
      });

      const cards = parseJSON(response.choices[0]?.message?.content || "");
      if (!cards?.length) return json(res, 500, { success: false, message: "AI returned no flashcards" }, req);

      // Delete old flashcards for this doc/user
      await supabase.from("flashcards").delete().eq("document_id", documentId).eq("user_id", user.id);

      const rows = cards.map(c => ({
        user_id:     user.id,
        document_id: documentId,
        question:    c.question,
        answer:      c.answer,
        reviewed:    false,
        starred:     false,
      }));

      const { data: inserted, error } = await supabase.from("flashcards").insert(rows).select();
      if (error) throw error;

      return json(res, 201, {
        success: true,
        message: `${inserted.length} flashcards generated`,
        count: inserted.length,
        flashcards: inserted.map(mapCard),
      }, req);
    } catch (err) {
      console.error("createFlashcards error:", err);
      return json(res, 500, { success: false, message: err.message }, req);
    }
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}

function mapCard(c) {
  return { _id: c.id, question: c.question, answer: c.answer, starred: c.starred, reviewed: c.reviewed };
}
