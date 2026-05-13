// api/documents/index.js
// GET  /api/documents  — list documents
// Supports: shared=true, status=pending, class, term, subject, uploaderRole
import { supabase } from "../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  try {
    const { shared, status, class: cls, term, subject, uploaderRole, className } = req.query;

    // Support both "class" and "className" param from frontend
    const classFilter = cls || className || "";

    let query = supabase
      .from("documents")
      .select("id, title, description, file_type, pages, file_url, class_name, term, subject, uploader_role, uploader_name, approval_status, is_public, rejection_reason, created_at, user_id")
      .order("created_at", { ascending: false });

    if (shared === "true") {
      // Public approved materials — visible to all logged-in users
      query = query.eq("is_public", true).eq("approval_status", "approved");
      if (uploaderRole) query = query.eq("uploader_role", uploaderRole);

    } else if (status === "pending") {
      if (user.role !== "teacher" && user.role !== "admin") {
        return json(res, 403, { success: false, message: "Not authorized" }, req);
      }
      query = query.eq("approval_status", "pending");

    } else {
      // Own documents
      query = query.eq("user_id", user.id);
    }

    // Classification filters
    if (classFilter) query = query.eq("class_name", classFilter);
    if (term)        query = query.eq("term", term);
    if (subject)     query = query.eq("subject", subject);

    const { data: docs, error } = await query;
    if (error) throw error;

    return json(res, 200, {
      success: true,
      count: docs.length,
      documents: docs.map(mapDoc),
    }, req);
  } catch (err) {
    console.error("getDocuments error:", err);
    return json(res, 500, { success: false, message: "Failed to fetch documents" }, req);
  }
}

function mapDoc(d) {
  return {
    _id:            d.id,
    title:          d.title,
    description:    d.description,
    fileType:       d.file_type,
    pages:          d.pages,
    fileUrl:        d.file_url,
    className:      d.class_name,
    term:           d.term,
    subject:        d.subject,
    uploaderRole:   d.uploader_role,
    uploaderName:   d.uploader_name,
    approvalStatus: d.approval_status,
    isPublic:       d.is_public,
    rejectionReason:d.rejection_reason,
    createdAt:      d.created_at,
    userId:         d.user_id,
  };
}
