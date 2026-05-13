// api/health.js
import { json, handleOptions, corsHeaders } from "./_lib/auth.js";

export default function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  return json(res, 200, { status: "ok", timestamp: new Date().toISOString() }, req);
}
