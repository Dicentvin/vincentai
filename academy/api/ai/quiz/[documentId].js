// api/ai/quiz/[documentId].js
// GET /api/ai/quiz/:documentId
import { supabase } from "../../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); } catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  const { documentId } = req.query;
  try {
    const { data: quizzes, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("document_id", documentId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return json(res, 200, { success: true, count: quizzes.length, quizzes: quizzes.map(q => {
      const questions = typeof q.questions === "string" ? JSON.parse(q.questions) : (q.questions || []);
      return { _id: q.id, title: q.title, questions, totalQuestions: q.total_questions };
    }) }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: err.message }, req);
  }
}
