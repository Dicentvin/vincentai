// api/health.ts
import { json, handleOptions, corsHeaders, type VercelReq, type VercelRes } from "./_lib/auth.js";

export default function handler(req: VercelReq, res: VercelRes): void {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  return json(res, 200, { status: "ok", timestamp: new Date().toISOString() }, req);
}
