// api/documents/[id]/approve.js
// PATCH /api/documents/:id/approve
import { supabase } from "../../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "PATCH") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  if (user.role !== "teacher" && user.role !== "admin") {
    return json(res, 403, { success: false, message: "Not authorized" }, req);
  }

  try {
    const { id } = req.query;
    const { action, rejectionReason } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return json(res, 400, { success: false, message: "Action must be 'approve' or 'reject'" }, req);
    }

    const update = action === "approve"
      ? {
          approval_status:  "approved",
          is_public:        true,
          approved_by:      user.id,
          approved_at:      new Date().toISOString(),
          rejection_reason: "",
          updated_at:       new Date().toISOString(),
        }
      : {
          approval_status:  "rejected",
          is_public:        false,
          rejection_reason: rejectionReason || "Does not meet requirements",
          updated_at:       new Date().toISOString(),
        };

    const { data: doc, error } = await supabase
      .from("documents")
      .update(update)
      .eq("id", id)
      .select("id, title, description, file_type, pages, file_url, class_name, term, subject, uploader_role, uploader_name, approval_status, is_public, created_at")
      .single();

    if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);

    return json(res, 200, {
      success: true,
      message: action === "approve" ? "Document approved and published." : "Document rejected.",
      document: mapDoc(doc),
    }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: "Approval failed: " + err.message }, req);
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
    createdAt:      d.created_at,
  };
}
