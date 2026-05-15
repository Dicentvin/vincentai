// api/documents/upload.ts  — POST /api/documents/upload
import { IncomingForm, Fields, Files } from "formidable";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";
import { extractTextFromFile } from "../_lib/fileParser.js";
import { splitTextIntoChunks } from "../_lib/chunker.js";

export const config = { api: { bodyParser: false } };

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_EXT = new Set([".pdf", ".ppt", ".pptx", ".doc", ".docx"]);
const MAX_BYTES   = 25 * 1024 * 1024;

function field(f: string | string[] | undefined): string {
  return (Array.isArray(f) ? f[0] : f) ?? "";
}

interface DocRow {
  id: string; title: string; description: string; file_type: string; pages: number;
  file_url: string; class_name: string; term: string; subject: string;
  uploader_role: string; uploader_name: string; approval_status: string;
  is_public: boolean; created_at: string;
}

function mapDoc(d: DocRow) {
  return {
    _id: d.id, title: d.title, description: d.description, fileType: d.file_type,
    pages: d.pages, fileUrl: d.file_url, className: d.class_name, term: d.term,
    subject: d.subject, uploaderRole: d.uploader_role, uploaderName: d.uploader_name,
    approvalStatus: d.approval_status, isPublic: d.is_public, createdAt: d.created_at,
  };
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  const form = new IncomingForm({ maxFileSize: MAX_BYTES, keepExtensions: true, uploadDir: "/tmp" });

  let fields: Fields, files: Files;
  try {
    [fields, files] = await form.parse(req as never);
  } catch (err: unknown) {
    const msg = (err as Error).message;
    return json(res, 400, { success: false, message: msg.includes("maxFileSize") ? "File too large (max 25 MB)" : "Upload parse error" }, req);
  }

  const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!uploadedFile) return json(res, 400, { success: false, message: "No file received." }, req);

  const ext = path.extname(uploadedFile.originalFilename || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    fs.unlink(uploadedFile.filepath, () => {});
    return json(res, 400, { success: false, message: `Only PDF, PPT, PPTX, DOC, DOCX allowed. Got: ${ext}` }, req);
  }

  const localPath   = uploadedFile.filepath;
  const title       = field(fields.title as string | string[])       || uploadedFile.originalFilename || "Untitled";
  const description = field(fields.description as string | string[]) || "";
  const className   = field(fields.className   as string | string[]) || "";
  const term        = field(fields.term        as string | string[]) || "";
  const subject     = field(fields.subject     as string | string[]) || "";

  try {
    // 1. Extract text
    let extracted;
    try {
      extracted = await extractTextFromFile(localPath);
    } catch (err: unknown) {
      fs.unlink(localPath, () => {});
      return json(res, 422, { success: false, message: (err as Error).message }, req);
    }

    // 2. Upload to Cloudinary
    let cloud: { url: string; publicId: string; resourceType: string; bytes: number };
    try {
      const resourceType = ext === ".pdf" ? "image" : "raw";
      const result = await cloudinary.uploader.upload(localPath, {
        folder: "lms-documents",
        resource_type: resourceType as "image" | "raw",
        use_filename: false,
        tags: ["lms", ext.slice(1)],
      });
      fs.unlink(localPath, () => {});
      cloud = { url: result.secure_url, publicId: result.public_id, resourceType, bytes: result.bytes };
    } catch (err: unknown) {
      fs.unlink(localPath, () => {});
      return json(res, 500, { success: false, message: "Cloudinary upload failed: " + (err as Error).message }, req);
    }

    // 3. Chunk text
    const chunks = splitTextIntoChunks(extracted.text, 1200, 100);

    // 4. Determine approval
    const isTeacherOrAdmin = user.role === "teacher" || user.role === "admin";
    const approvalStatus   = isTeacherOrAdmin ? "approved" : "pending";
    const isPublic         = isTeacherOrAdmin;

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        user_id:             user.id,
        uploader_role:       user.role,
        uploader_name:       user.name,
        title:               title.trim(),
        description:         description.trim(),
        file_name:           uploadedFile.originalFilename || "file",
        file_path:           cloud.publicId,
        cloud_public_id:     cloud.publicId,
        cloud_resource_type: cloud.resourceType,
        file_url:            cloud.url,
        file_size:           cloud.bytes,
        file_type:           extracted.fileType,
        pages:               extracted.numPages,
        extracted_text:      extracted.text.slice(0, 100_000),
        chunks:              JSON.stringify(chunks),
        status:              "ready",
        class_name:          className,
        term,
        subject,
        approval_status:     approvalStatus,
        is_public:           isPublic,
        approved_by:         isTeacherOrAdmin ? user.id : null,
        approved_at:         isTeacherOrAdmin ? new Date().toISOString() : null,
      })
      .select("id, title, description, file_type, pages, file_url, class_name, term, subject, uploader_role, uploader_name, approval_status, is_public, created_at")
      .single();

    if (error) throw error;

    return json(res, 201, {
      success: true,
      message: isTeacherOrAdmin
        ? "Material uploaded and published successfully."
        : "Note uploaded. Awaiting teacher approval.",
      document: mapDoc(doc as DocRow),
    }, req);
  } catch (err: unknown) {
    if (fs.existsSync(localPath)) fs.unlink(localPath, () => {});
    console.error("uploadDocument error:", err);
    return json(res, 500, { success: false, message: "Upload failed: " + (err as Error).message }, req);
  }
}
