// api/documents/[id].js
// GET    /api/documents/:id         — get single doc
// PUT    /api/documents/:id         — update title/description
// DELETE /api/documents/:id         — delete doc
// PATCH  /api/documents/:id/approve — handled separately below
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  const { id } = req.query;

  if (req.method === "GET") return getDoc(req, res, user, id);
  if (req.method === "PUT") return updateDoc(req, res, user, id);
  if (req.method === "DELETE") return deleteDoc(req, res, user, id);
  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}

async function getDoc(req, res, user, id) {
  try {
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*, user_id")
      .eq("id", id)
      .single();

    if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);

    const isOwner      = doc.user_id === user.id;
    const isAccessible = doc.is_public && doc.approval_status === "approved";
    const isStaff      = user.role === "teacher" || user.role === "admin";

    if (!isOwner && !isAccessible && !isStaff) {
      return json(res, 403, { success: false, message: "Access denied" }, req);
    }

    return json(res, 200, { success: true, document: mapDoc(doc) }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: "Failed to fetch document" }, req);
  }
}

async function updateDoc(req, res, user, id) {
  try {
    const { title, description } = req.body;
    const updates = {};
    if (title       !== undefined) updates.title       = title.trim();
    if (description !== undefined) updates.description = description.trim();
    updates.updated_at = new Date().toISOString();

    const { data: doc, error } = await supabase
      .from("documents")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, title, description, file_type, pages, file_url, class_name, term, subject, approval_status, is_public, created_at")
      .single();

    if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);
    return json(res, 200, { success: true, document: mapDoc(doc) }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: "Update failed" }, req);
  }
}

async function deleteDoc(req, res, user, id) {
  try {
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, cloud_public_id, cloud_resource_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !doc) return json(res, 404, { success: false, message: "Document not found" }, req);

    // Delete from Cloudinary
    if (doc.cloud_public_id) {
      await cloudinary.uploader
        .destroy(doc.cloud_public_id, { resource_type: doc.cloud_resource_type || "image" })
        .catch(e => console.warn("Cloudinary delete failed:", e.message));
    }

    // Cascade deletes flashcards, quizzes, chat_history via FK
    await supabase.from("documents").delete().eq("id", id);

    return json(res, 200, { success: true, message: "Document deleted" }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: "Delete failed" }, req);
  }
}

function mapDoc(d) {
  return {
    _id:             d.id,
    title:           d.title,
    description:     d.description,
    fileType:        d.file_type,
    pages:           d.pages,
    fileUrl:         d.file_url,
    className:       d.class_name,
    term:            d.term,
    subject:         d.subject,
    uploaderRole:    d.uploader_role,
    uploaderName:    d.uploader_name,
    approvalStatus:  d.approval_status,
    isPublic:        d.is_public,
    rejectionReason: d.rejection_reason,
    createdAt:       d.created_at,
  };
}
