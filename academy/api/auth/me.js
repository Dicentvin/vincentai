// api/auth/me.js
import { requireAuth, json, handleOptions, corsHeaders } from "../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  try {
    const user = await requireAuth(req);
    return json(res, 200, {
      success: true,
      user: {
        _id:            user.id,
        name:           user.name,
        email:          user.email,
        role:           user.role,
        className:      user.class_name,
        approvalStatus: user.approval_status,
      },
    }, req);
  } catch (err) {
    return json(res, err.status || 401, { success: false, message: err.message }, req);
  }
}
