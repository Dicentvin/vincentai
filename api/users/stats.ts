// api/users/stats.ts  — GET /api/users/stats
import { supabase } from "../_lib/supabase.js";
import {
  requireAuth, json, handleOptions, corsHeaders,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  let user;
  try { user = await requireAuth(req); }
  catch (err: unknown) { const e = err as Error & { status?: number }; return json(res, e.status || 401, { success: false, message: e.message }, req); }

  if (user.role !== "admin")
    return json(res, 403, { success: false, message: "Admin access required" }, req);

  try {
    const { data: rows, error } = await supabase
      .from("users").select("role, approval_status");

    if (error) throw error;

    const count = (role: string, status?: string) =>
      (rows as { role: string; approval_status: string }[])
        .filter(r => r.role === role && (!status || r.approval_status === status)).length;

    return json(res, 200, {
      success: true,
      stats: {
        students: { total: count("student"),  pending: count("student", "pending") },
        teachers: { total: count("teacher"),  pending: count("teacher", "pending") },
        parents:  { total: count("parent"),   pending: count("parent",  "pending") },
        totalPending: count("student", "pending") + count("teacher", "pending") + count("parent", "pending"),
      },
    }, req);
  } catch (err: unknown) {
    return json(res, 500, { success: false, message: "Failed to fetch stats" }, req);
  }
}
