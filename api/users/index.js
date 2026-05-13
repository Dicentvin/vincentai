// api/users/index.js
// GET /api/users?role=student&status=pending
import { supabase } from "../_lib/supabase.js";
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err) { return json(res, err.status || 401, { success: false, message: err.message }, req); }

  if (user.role !== "admin") {
    return json(res, 403, { success: false, message: "Admin access required" }, req);
  }

  try {
    const { role, status } = req.query;

    let query = supabase
      .from("users")
      .select("id, name, email, role, class_name, approval_status, created_at")
      .order("created_at", { ascending: false });

    if (role) {
      query = query.eq("role", role);
    } else {
      query = query.in("role", ["student", "teacher", "parent"]);
    }

    if (status) query = query.eq("approval_status", status);

    const { data: users, error } = await query;
    if (error) throw error;

    return json(res, 200, {
      success: true,
      count: users.length,
      users: users.map(mapUser),
    }, req);
  } catch (err) {
    return json(res, 500, { success: false, message: "Failed to fetch users" }, req);
  }
}

function mapUser(u) {
  return {
    _id:            u.id,
    name:           u.name,
    email:          u.email,
    role:           u.role,
    className:      u.class_name,
    approvalStatus: u.approval_status,
    createdAt:      u.created_at,
  };
}
