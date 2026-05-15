// api/auth/register.ts
import bcrypt from "bcryptjs";
import { supabase } from "../_lib/supabase.js";
import {
  signToken, json, handleOptions, corsHeaders,
  parseBody, safeUser,
  type VercelReq, type VercelRes, type DbUser,
} from "../_lib/auth.js";

interface RegisterBody {
  name?:      string;
  email?:     string;
  password?:  string;
  role?:      string;
  className?: string;
}

const ALLOWED_ROLES = ["student", "teacher", "parent"] as const;

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST")
    return json(res, 405, { success: false, message: "Method not allowed" }, req);

  try {
    const { name, email, password, role, className } = await parseBody<RegisterBody>(req);

    if (!name?.trim() || !email?.trim() || !password)
      return json(res, 400, { success: false, message: "All fields are required" }, req);
    if (password.length < 6)
      return json(res, 400, { success: false, message: "Password must be at least 6 characters" }, req);

    const { data: existing } = await supabase
      .from("users").select("id").eq("email", email.toLowerCase().trim()).maybeSingle();

    if (existing)
      return json(res, 400, { success: false, message: "Email already registered" }, req);

    const assignedRole = ALLOWED_ROLES.includes(role as typeof ALLOWED_ROLES[number])
      ? (role as string) : "student";
    const passwordHash   = await bcrypt.hash(password, 10);
    const approvalStatus = assignedRole === "admin" ? "approved" : "pending";

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        name:            name.trim(),
        email:           email.toLowerCase().trim(),
        password_hash:   passwordHash,
        role:            assignedRole,
        class_name:      assignedRole === "student" ? (className ?? "") : "",
        approval_status: approvalStatus,
      })
      .select("id, name, email, role, class_name, approval_status")
      .single();

    if (error) throw error;

    const token = signToken((user as DbUser).id);
    return json(res, 201, { success: true, token, user: safeUser(user as DbUser) }, req);
  } catch (err: unknown) {
    console.error("register error:", err);
    return json(res, 500, { success: false, message: "Registration failed" }, req);
  }
}
