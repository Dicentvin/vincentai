# EduNexus — Ready to Deploy

## Structure
```
edunexus/
├── api/              ← Vercel serverless functions (your backend)
├── frontend/         ← React/Vite app (fully patched)
├── supabase/
│   └── schema.sql    ← Run this in Supabase SQL Editor FIRST
├── package.json      ← Root dependencies for serverless functions
├── vercel.json       ← Vercel build + routing config
└── .env.example      ← All env vars you need to fill in
```

---

## Setup (3 steps)

### Step 1 — Supabase database
1. Create a free project at https://supabase.com
2. Go to SQL Editor → New Query
3. Paste everything from supabase/schema.sql → click Run
4. Go to Project Settings → API and copy:
   - Project URL → SUPABASE_URL
   - service_role secret key → SUPABASE_SERVICE_ROLE_KEY

### Step 2 — Deploy to Vercel
1. Push this entire folder to a GitHub repo
2. Go to vercel.com → New Project → import your repo
3. Leave build settings as-is (vercel.json handles everything)
4. Add all environment variables from .env.example
5. Click Deploy

### Step 3 — Create your admin account
Run this SQL in Supabase SQL Editor
(generate a bcrypt hash at https://bcrypt.online with cost 10):

  INSERT INTO public.users (name, email, password_hash, role, approval_status)
  VALUES ('Admin', 'admin@yourdomain.com', '$2b$10$YOUR_HASH_HERE', 'admin', 'approved');

---

## Local development

  # Root deps (serverless functions)
  npm install

  # Frontend deps
  cd frontend && npm install

  # Install Vercel CLI (once)
  npm i -g vercel

  # Run frontend + API together
  vercel dev
  # Open http://localhost:3000

---

## Environment variables (set in Vercel Dashboard)

  SUPABASE_URL                 = https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    = your service_role key
  JWT_SECRET                   = any long random string
  JWT_EXPIRE                   = 4d
  CLOUDINARY_CLOUD_NAME        = from cloudinary.com dashboard
  CLOUDINARY_API_KEY           = from cloudinary.com dashboard
  CLOUDINARY_API_SECRET        = from cloudinary.com dashboard
  GROQ_API_KEY                 = free at console.groq.com
  CLIENT_URL                   = https://your-app.vercel.app
  VITE_LMS_API_URL             = (leave empty)
