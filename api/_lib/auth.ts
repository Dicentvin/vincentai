// api/_lib/auth.ts
import type { IncomingMessage, ServerResponse } from "http";
import jwt from "jsonwebtoken";
import { supabase } from "./supabase.js";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRE  = process.env.JWT_EXPIRE  || "4d";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DbUser {
  id:              string;
  name:            string;
  email:           string;
  role:            string;
  class_name:      string;
  approval_status: string;
}

export interface SafeUser {
  _id:            string;
  name:           string;
  email:          string;
  role:           string;
  className:      string;
  approvalStatus: string;
}

export type VercelReq = IncomingMessage & {
  body?:  unknown;
  query?: Record<string, string | string[]>;
};

export type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  end:    (body?: string) => void;
};

// ── Token ─────────────────────────────────────────────────────────────────────

export function signToken(userId: string): string {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

// ── Body parser ───────────────────────────────────────────────────────────────

/** Parses JSON body from a raw Vercel/Node request stream.
 *  req.body is undefined in Vercel serverless — we must read the stream. */
export function parseBody<T = Record<string, unknown>>(req: VercelReq): Promise<T> {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body as T);
    let raw = "";
    req.on("data", (chunk: Buffer | string) => (raw += chunk.toString()));
    req.on("end", () => {
      try { resolve(raw ? (JSON.parse(raw) as T) : ({} as T)); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

// ── Auth guard ────────────────────────────────────────────────────────────────

export async function requireAuth(req: VercelReq): Promise<DbUser> {
  const authHeader =
    (req.headers["authorization"] as string | undefined) ||
    (req.headers["Authorization"] as string | undefined) || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw Object.assign(new Error("Not authorized, no token"), { status: 401 });
  }

  const token = authHeader.slice(7);
  let decoded: { id: string };

  try {
    decoded = jwt.verify(token, JWT_SECRET) as { id: string };
  } catch (e: unknown) {
    const msg = e instanceof jwt.TokenExpiredError ? "Token expired" : "Token invalid";
    throw Object.assign(new Error(msg), { status: 401 });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, role, class_name, approval_status")
    .eq("id", decoded.id)
    .single();

  if (error || !user) throw Object.assign(new Error("User not found"), { status: 401 });

  return user as DbUser;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

export function corsHeaders(req: VercelReq): Record<string, string> {
  const origin =
    (req.headers["origin"] as string | undefined) ||
    process.env.CLIENT_URL || "*";
  return {
    "Access-Control-Allow-Origin":      origin,
    "Access-Control-Allow-Methods":     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type,Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function json(res: VercelRes, status: number, body: unknown, req?: VercelReq): void {
  const headers = req ? corsHeaders(req) : {};
  res.status(status).setHeader("Content-Type", "application/json");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

export function handleOptions(req: VercelReq, res: VercelRes): void {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  res.status(204).end();
}

export function safeUser(u: DbUser): SafeUser {
  return {
    _id:            u.id,
    name:           u.name,
    email:          u.email,
    role:           u.role,
    className:      u.class_name,
    approvalStatus: u.approval_status,
  };
}
