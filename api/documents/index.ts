// api/documents/index.ts  — GET /api/documents
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

interface DocRow {
  id: string; title: string; description: string; file_type: string; pages: number;
  file_url: string; class_name: string; term: string; subject: string;
  uploader_role: string; uploader_name: string; approval_status: string;
  is_public: boolean; rejection_reason: string; created_at: string; user_id: string;
}

function mapDoc(d: DocRow) {
  return {
    _id: d.id, title: d.title, description: d.description, fileType: d.file_type,
    pages: d.pages, fileUrl: d.file_url, className: d.class_name, term: d.term,
    subject: d.subject, uploaderRole: d.uploader_role, uploaderName: d.uploader_name,
    approvalStatus: d.approval_status, isPublic: d.is_public,
    rejectionReason: d.rejection_reason, createdAt: d.created_at, userId: d.user_id,
  };
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  try {
    const q = req.query ?? {};
    const shared       = q.shared      as string | undefined;
    const status       = q.status      as string | undefined;
    const cls          = q.class       as string | undefined;
    const term         = q.term        as string | undefined;
    const subject      = q.subject     as string | undefined;
    const uploaderRole = q.uploaderRole as string | undefined;
    const className    = q.className   as string | undefined;
    const classFilter  = cls || className || "";

    let query = supabase
      .from("documents")
      .select("id, title, description, file_type, pages, file_url, class_name, term, subject, uploader_role, uploader_name, approval_status, is_public, rejection_reason, created_at, user_id")
      .order("created_at", { ascending: false });

    if (shared === "true") {
      query = query.eq("is_public", true).eq("approval_status", "approved");
      if (uploaderRole) query = query.eq("uploader_role", uploaderRole);
    } else if (status === "pending") {
      if (user.role !== "teacher" && user.role !== "admin")
        return json(res, 403, { success: false, message: "Not authorized" }, req);
      query = query.eq("approval_status", "pending");
    } else {
      query = query.eq("user_id", user.id);
    }

    if (classFilter) query = query.eq("class_name", classFilter);
    if (term)        query = query.eq("term", term);
    if (subject)     query = query.eq("subject", subject);

    const { data: docs, error } = await query;
    if (error) throw error;

    return json(res, 200, { success: true, count: docs.length, documents: (docs as DocRow[]).map(mapDoc) }, req);
  } catch (err: unknown) {
    console.error("getDocuments error:", err);
    return json(res, 500, { success: false, message: "Failed to fetch documents" }, req);
  }
}
