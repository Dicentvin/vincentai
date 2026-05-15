// api/ai/chat/[documentId].js
// GET    /api/ai/chat/:documentId — get history
// DELETE /api/ai/chat/:documentId — clear history
import { supabase } from "../../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); } catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  const { documentId } = req.query;

  if (req.method === "GET") {
    const { data } = await supabase.from("chat_history")
      .select("messages").eq("user_id", user.id).eq("document_id", documentId).maybeSingle();
    return json(res, 200, { success: true, messages: data?.messages || [] }, req);
  }

  if (req.method === "DELETE") {
    await supabase.from("chat_history")
      .update({ messages: [], updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("document_id", documentId);
    return json(res, 200, { success: true, message: "Chat history cleared" }, req);
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}
