// api/users/[id]/approval.ts  — PATCH /api/users/:id/approval
import { supabase } from "../../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders, parseBody,
  type VercelReq, type VercelRes,
} from "../../_lib/auth.js";

interface ApprovalBody { action?: "approve" | "reject"; }

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "PATCH") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  if (user.role !== "admin")
    return json(res, 403, { success: false, message: "Admin access required" }, req);

  try {
    const id = (req.query?.id ?? "") as string;
    const { action } = await parseBody<ApprovalBody>(req);

    if (!["approve", "reject"].includes(action ?? ""))
      return json(res, 400, { success: false, message: "Action must be approve or reject" }, req);

    const { data: target } = await supabase
      .from("users").select("id, role").eq("id", id).single();

    if (!target) return json(res, 404, { success: false, message: "User not found" }, req);
    if ((target as { role: string }).role === "admin")
      return json(res, 403, { success: false, message: "Cannot change admin approval status" }, req);

    const { data: updated, error } = await supabase
      .from("users")
      .update({ approval_status: action === "approve" ? "approved" : "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, email, role, class_name, approval_status")
      .single();

    if (error) throw error;

    const u = updated as { id: string; name: string; email: string; role: string; class_name: string; approval_status: string };
    return json(res, 200, {
      success: true,
      user: { _id: u.id, name: u.name, email: u.email, role: u.role, className: u.class_name, approvalStatus: u.approval_status },
    }, req);
  } catch (err: unknown) {
    return json(res, 500, { success: false, message: "Failed to update approval status" }, req);
  }
}
