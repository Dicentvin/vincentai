// api/auth/login.js
import bcrypt from "bcryptjs";
import { supabase } from "../_lib/supabase.js";
import { signToken, json, handleOptions, corsHeaders } from "../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return json(res, 400, { success: false, message: "Email and password required" }, req);
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, role, class_name, approval_status, password_hash")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (error || !user) {
      return json(res, 401, { success: false, message: "Invalid credentials" }, req);
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return json(res, 401, { success: false, message: "Invalid credentials" }, req);
    }

    const token = signToken(user.id);
    return json(res, 200, {
      success: true,
      token,
      user: safeUser(user),
    }, req);
  } catch (err) {
    console.error("login error:", err);
    return json(res, 500, { success: false, message: "Login failed" }, req);
  }
}

function safeUser(u) {
  return {
    _id:            u.id,
    name:           u.name,
    email:          u.email,
    role:           u.role,
    className:      u.class_name,
    approvalStatus: u.approval_status,
  };
}
