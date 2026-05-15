// api/auth/me.ts
import {
  requireAuth, json, handleOptions, corsHeaders, safeUser,
  type VercelReq, type VercelRes,
} from "../_lib/auth.js";

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);

  try {
    const user = await requireAuth(req);
    return json(res, 200, { success: true, user: safeUser(user) }, req);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    return json(res, e.status || 401, { success: false, message: e.message }, req);
  }
}
