// api/ai/flashcards/[documentId].js
// GET   /api/ai/flashcards/:documentId — list flashcards
import { supabase } from "../../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  const { documentId } = req.query;

  if (req.method === "GET") {
    try {
      const { data: cards, error } = await supabase
        .from("flashcards")
        .select("*")
        .eq("document_id", documentId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return json(res, 200, { success: true, flashcards: cards.map(mapCard) }, req);
    } catch (err) {
      return json(res, 500, { success: false, message: err.message }, req);
    }
  }

  // PATCH — update starred/reviewed by flashcard id (documentId param is actually card id here)
  if (req.method === "PATCH") {
    try {
      const { starred, reviewed } = req.body;
      const updates = {};
      if (starred  !== undefined) updates.starred  = starred;
      if (reviewed !== undefined) updates.reviewed = reviewed;
      updates.updated_at = new Date().toISOString();

      const { data: card, error } = await supabase
        .from("flashcards")
        .update(updates)
        .eq("id", documentId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error || !card) return json(res, 404, { success: false, message: "Flashcard not found" }, req);
      return json(res, 200, { success: true, flashcard: mapCard(card) }, req);
    } catch (err) {
      return json(res, 500, { success: false, message: err.message }, req);
    }
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}

function mapCard(c) {
  return { _id: c.id, question: c.question, answer: c.answer, starred: c.starred, reviewed: c.reviewed };
}
