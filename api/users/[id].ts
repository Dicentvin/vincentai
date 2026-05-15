// api/documents/[id].ts
// GET    /api/documents/:id — get single doc
// PUT    /api/documents/:id — update title/description
// DELETE /api/documents/:id — delete doc
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders, parseBody,
  type VercelReq, type VercelRes, type DbUser,
} from "../_lib/auth.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface DocRow {
  id: string; title: string; description: string; file_type: string; pages: number;
  file_url: string; class_name: string; term: string; subject: string;
  uploader_role: string; uploader_name: string; approval_status: string;
  is_public: boolean; rejection_reason: string; created_at: string;
  user_id?: string; cloud_public_id?: string; cloud_resource_type?: string;
}

function mapDoc(d: DocRow) {
  return {
    _id: d.id, title: d.title, description: d.description, fileType: d.file_type,
    pages: d.pages, fileUrl: d.file_url, className: d.class_name, term: d.term,
    subject: d.subject, uploaderRole: d.uploader_role, uploaderName: d.uploader_name,
    approvalStatus: d.approval_status, isPublic: d.is_public,
    rejectionReason: d.rejection_reason, createdAt: d.created_at,
  };
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user: DbUser;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  const id = (req.query?.id ?? "") as string;

  if (req.method === "GET") {
    try {
      const { data: doc, error } = await supabase
        .from("documents").select("*, user_id").eq("id", id).single();
      if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);

      const d = doc as DocRow;
      const isOwner      = d.user_id === user.id;
      const isAccessible = d.is_public && d.approval_status === "approved";
      const isStaff      = user.role === "teacher" || user.role === "admin";

      if (!isOwner && !isAccessible && !isStaff)
        return json(res, 403, { success: false, message: "Access denied" }, req);

      return json(res, 200, { success: true, document: mapDoc(d) }, req);
    } catch { return json(res, 500, { success: false, message: "Failed to fetch document" }, req); }
  }

  if (req.method === "PUT") {
    try {
      const { title, description } = await parseBody<{ title?: string; description?: string }>(req);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title       !== undefined) updates.title       = title.trim();
      if (description !== undefined) updates.description = description.trim();

      const { data: doc, error } = await supabase
        .from("documents").update(updates).eq("id", id).eq("user_id", user.id)
        .select("id, title, description, file_type, pages, file_url, class_name, term, subject, uploader_role, uploader_name, approval_status, is_public, created_at")
        .single();

      if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);
      return json(res, 200, { success: true, document: mapDoc(doc as DocRow) }, req);
    } catch { return json(res, 500, { success: false, message: "Update failed" }, req); }
  }

  if (req.method === "DELETE") {
    try {
      const { data: doc, error } = await supabase
        .from("documents").select("id, cloud_public_id, cloud_resource_type")
        .eq("id", id).eq("user_id", user.id).single();

      if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);

      const d = doc as DocRow;
      if (d.cloud_public_id) {
        await cloudinary.uploader
          .destroy(d.cloud_public_id, { resource_type: (d.cloud_resource_type || "image") as "image" | "raw" | "video" })
          .catch(e => console.warn("Cloudinary delete failed:", (e as Error).message));
      }

      await supabase.from("documents").delete().eq("id", id);
      return json(res, 200, { success: true, message: "Document deleted" }, req);
    } catch { return json(res, 500, { success: false, message: "Delete failed" }, req); }
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}
