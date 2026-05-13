// api/users/[id].js
// PATCH /api/users/:id/approval  — handled in /api/users/[id]/approval.js
// DELETE /api/users/:id
import { supabase } from "../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  if (user.role !== "admin") {
    return json(res, 403, { success: false, message: "Admin access required" }, req);
  }

  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      const { data: target } = await supabase
        .from("users").select("role").eq("id", id).single();

      if (!target) return json(res, 404, { success: false, message: "User not found" }, req);
      if (target.role === "admin") return json(res, 403, { success: false, message: "Cannot delete admin account" }, req);

      await supabase.from("users").delete().eq("id", id);
      return json(res, 200, { success: true, message: "User deleted" }, req);
    } catch (err) {
      return json(res, 500, { success: false, message: "Failed to delete user" }, req);
    }
  }

  return json(res, 405, { success: false, message: "Method not allowed" }, req);
}
