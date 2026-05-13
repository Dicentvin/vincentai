// api/users/[id]/approval.js
// PATCH /api/users/:id/approval
import { supabase } from "../../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "PATCH") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  if (user.role !== "admin") {
    return json(res, 403, { success: false, message: "Admin access required" }, req);
  }

  try {
    const { id } = req.query;
    const { action } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return json(res, 400, { success: false, message: "Action must be approve or reject" }, req);
    }

    const { data: target } = await supabase
      .from("users").select("id, role").eq("id", id).single();

    if (!target) return json(res, 404, { success: false, message: "User not found" }, req);
    if (target.role === "admin") return json(res, 403, { success: false, message: "Cannot change admin approval status" }, req);

    const { data: updated, error } = await supabase
      .from("users")
      .update({
        approval_status: action === "approve" ? "approved" : "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, email, role, class_name, approval_status")
      .single();

    if (error) throw error;

    return json(res, 200, {
      success: true,
      user: {
        _id:            updated.id,
        name:           updated.name,
        email:          updated.email,
        role:           updated.role,
        className:      updated.class_name,
        approvalStatus: updated.approval_status,
      },
    }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: "Failed to update approval status" }, req);
  }
}
