// api/ai/chat.js
// POST /api/ai/chat
import OpenAI from "openai";
import { supabase } from "../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); } catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  const { documentId, query } = req.body;
  if (!query?.trim()) return json(res, 400, { success: false, message: "Query is required" }, req);

  try {
    let contextText = "";
    let usedChunks  = 0;

    if (documentId && documentId !== "dashboard") {
      const { data: doc } = await supabase.from("documents")
        .select("chunks, extracted_text")
        .eq("id", documentId)
        .eq("user_id", user.id)
        .single();

      if (doc) {
        const chunks = typeof doc.chunks === "string" ? JSON.parse(doc.chunks) : (doc.chunks || []);
        contextText = chunks.length ? chunks.slice(0, 6).map(c => c.content).join("\n\n") : (doc.extracted_text || "").slice(0, 6000);
        usedChunks  = Math.min(chunks.length, 6);
      }
    }

    const systemPrompt = contextText
      ? `You are an AI tutor. Answer questions using ONLY the provided document context. Be helpful and concise.\n\nContext:\n${contextText}`
      : "You are an AI education assistant. Help students with their studies.";

    const resp = await groq.chat.completions.create({
      model: MODEL, temperature: 0.2, max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: query },
      ],
    });

    const answer = resp.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";

    // Save to chat history
    if (documentId && documentId !== "dashboard") {
      const { data: existing } = await supabase.from("chat_history")
        .select("id, messages").eq("user_id", user.id).eq("document_id", documentId).maybeSingle();

      const messages = existing?.messages || [];
      messages.push({ role: "user", content: query });
      messages.push({ role: "assistant", content: answer });

      if (existing) {
        await supabase.from("chat_history")
          .update({ messages, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("chat_history")
          .insert({ user_id: user.id, document_id: documentId, messages });
      }
    }

    return json(res, 200, { success: true, answer, usedChunks }, req);
  } catch (err) {
    console.error("chat error:", err);
    return json(res, 500, { success: false, message: err.message }, req);
  }
}
