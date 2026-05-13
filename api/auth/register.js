// api/auth/register.js
import bcrypt from "bcryptjs";
import { supabase } from "../_lib/supabase.js";
import { signToken, json, handleOptions, corsHeaders } from "../_lib/auth.js";

export default async function handler(req, res) {
  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") return json(res, 405, { success: false, message: "Method not allowed" }, req);

  try {
    const { name, email, password, role, className } = req.body;

    if (!name || !email || !password) {
      return json(res, 400, { success: false, message: "All fields are required" }, req);
    }

    // Check duplicate email
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return json(res, 400, { success: false, message: "Email already registered" }, req);
    }

    const allowedRoles = ["student", "teacher", "parent"];
    const assignedRole = allowedRoles.includes(role) ? role : "student";
    const passwordHash = await bcrypt.hash(password, 10);

    // Admin auto-approved, others pending
    const approvalStatus = assignedRole === "admin" ? "approved" : "pending";

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        role: assignedRole,
        class_name: assignedRole === "student" ? (className || "") : "",
        approval_status: approvalStatus,
      })
      .select("id, name, email, role, class_name, approval_status")
      .single();

    if (error) throw error;

    const token = signToken(user.id);
    return json(res, 201, {
      success: true,
      token,
      user: safeUser(user),
    }, req);
  } catch (err) {
    console.error("register error:", err);
    return json(res, 500, { success: false, message: "Registration failed" }, req);
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
