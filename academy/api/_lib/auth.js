// api/_lib/auth.js
import jwt from "jsonwebtoken";
import { supabase } from "./supabase.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE  = process.env.JWT_EXPIRE || "4d";

export function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

/** Extracts + verifies Bearer token; returns the user row or throws */
export async function requireAuth(req) {
  const auth = req.headers["authorization"] || req.headers["Authorization"] || "";
  if (!auth.startsWith("Bearer ")) {
    const err = new Error("Not authorized, no token");
    err.status = 401;
    throw err;
  }
  const token = auth.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    const err = new Error(e.name === "TokenExpiredError" ? "Token expired" : "Token invalid");
    err.status = 401;
    throw err;
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, role, class_name, approval_status")
    .eq("id", decoded.id)
    .single();

  if (error || !user) {
    const err = new Error("User not found");
    err.status = 401;
    throw err;
  }
  return user;
}

/** CORS headers for all API responses */
export function corsHeaders(req) {
  const origin = req.headers["origin"] || process.env.CLIENT_URL || "*";
  return {
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Unified JSON response helper */
export function json(res, status, body, req) {
  const headers = req ? corsHeaders(req) : {};
  res.status(status).setHeader("Content-Type", "application/json");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

/** Handle CORS preflight */
export function handleOptions(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  res.status(204).end();
}
