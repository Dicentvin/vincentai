// api/ai/quiz.ts  — POST /api/ai/quiz
import OpenAI from "openai";
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders, parseBody,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
const MODEL = "llama-3.3-70b-versatile";

interface RawQuestion { questionText: string; options: string[]; correctAnswer: string; explanation: string; }
interface QuizRow { id: string; title: string; questions: string | RawQuestion[]; total_questions: number; }
interface QuizBody { documentId?: string; count?: number; }

function parseJSON(raw: string): RawQuestion[] | null {
  if (!raw) return null;
  const c = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(c); } catch {}
  const m = c.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function mapQuiz(q: QuizRow) {
  const questions: RawQuestion[] =
    typeof q.questions === "string" ? JSON.parse(q.questions) : (q.questions || []);
  return { _id: q.id, title: q.title, questions, totalQuestions: q.total_questions };
}

async function getDoc(docId: string, userId: string) {
  const { data } = await supabase
    .from("documents").select("id, title, chunks, extracted_text")
    .eq("id", docId).eq("user_id", userId).single();
  if (!data) return null;
  const chunks: { content: string }[] =
    typeof data.chunks === "string" ? JSON.parse(data.chunks) : (data.chunks || []);
  const text = chunks.length ? chunks.map(c => c.content).join("\n\n") : (data.extracted_text || "");
  return { ...data, text };
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  if (req.method === "POST") {
    const { documentId, count = 10 } = await parseBody<QuizBody>(req);
    const doc = await getDoc(documentId!, user.id);
    if (!doc)  return json(res, 404, { success: false, message: "Document not found" }, req);
    if (doc.text.trim().length < 50) return json(res, 400, { success: false, message: "Document has too little text" }, req);

    try {
      const resp = await groq.chat.completions.create({
        model: MODEL, temperature: 0.2, max_tokens: 4000,
        messages: [
          { role: "system", content: 'Generate MCQ quiz questions as JSON array: [{"questionText":"...","options":["A","B","C","D"],"correctAnswer":"...","explanation":"..."}]. Return ONLY the JSON array.' },
          { role: "user",   content: `Generate ${count} MCQ questions from this text:\n\n${doc.text.slice(0, 8000)}` },
        ],
      });

      const questions = parseJSON(resp.choices[0]?.message?.content || "");
      if (!questions?.length) return json(res, 500, { success: false, message: "AI returned no questions" }, req);

      const { data: quiz, error } = await supabase
        .from("quizzes")
        .insert({
          user_id: user.id, document_id: documentId,
          title: `Quiz: ${doc.title}`,
          questions: JSON.stringify(questions),
          total_questions: questions.length,
        })
        .select().single();

      if (error) throw error;
      return json(res, 201, { success: true, quiz: mapQuiz(quiz as QuizRow) }, req);
    } catch (err: unknown) {
      return json(res, 500, { success: false, message: (err as Error).message }, req);
    }
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}
