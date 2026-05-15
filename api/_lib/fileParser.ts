// api/_lib/fileParser.ts
/**
 * PDF   → pdf-parse        (pure Node, no system deps)
 * DOCX  → mammoth          (pure Node, no system deps)
 * DOC   → mammoth          (pure Node, no system deps)
 * PPTX  → adm-zip + XML    (pure Node, no system deps)
 * PPT   → basic text extract via adm-zip fallback
 */

import fs   from "fs";
import path from "path";
import { createRequire } from "module";

const require   = createRequire(import.meta.url);
const MAX_CHARS = 400_000;

export interface ParseResult {
  text:     string;
  numPages: number;
  fileType: string;
}

// ── Load packages once at startup ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParse: any, mammoth: any, AdmZip: any;

try {
  pdfParse = require("pdf-parse");
  console.log("✅ pdf-parse loaded");
} catch {
  console.error("❌ pdf-parse not found — run: npm install pdf-parse");
}

try {
  mammoth = require("mammoth");
  console.log("✅ mammoth loaded");
} catch {
  console.error("❌ mammoth not found — run: npm install mammoth");
}

try {
  AdmZip = require("adm-zip");
  console.log("✅ adm-zip loaded");
} catch {
  console.error("❌ adm-zip not found — run: npm install adm-zip");
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function extractTextFromFile(filePath: string): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":  return parsePdf(filePath);
    case ".docx":
    case ".doc":  return parseDocx(filePath, ext);
    case ".pptx": return parsePptx(filePath);
    case ".ppt":  return parsePpt(filePath);
    default:
      throw new Error(
        `Unsupported file type: "${ext}". Allowed: .pdf .ppt .pptx .doc .docx`,
      );
  }
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function parsePdf(filePath: string): Promise<ParseResult> {
  if (!pdfParse) throw new Error("pdf-parse not installed. Run: npm install pdf-parse");

  const buffer = fs.readFileSync(filePath);
  let data: { text: string; numpages: number };
  try {
    data = await pdfParse(buffer);
  } catch (err: unknown) {
    throw new Error(`PDF parsing failed: ${(err as Error).message}`);
  }

  const text = (data.text || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("This PDF has no readable text (may be image-only/scanned).");

  return { text: text.slice(0, MAX_CHARS), numPages: data.numpages || 0, fileType: "pdf" };
}

// ── DOCX / DOC ────────────────────────────────────────────────────────────────
async function parseDocx(filePath: string, ext: string): Promise<ParseResult> {
  if (!mammoth) throw new Error("mammoth not installed. Run: npm install mammoth");

  let result: { value: string };
  try {
    result = await mammoth.extractRawText({ path: filePath });
  } catch (err: unknown) {
    throw new Error(
      `Word document parsing failed: ${(err as Error).message}. Make sure the file is not password-protected.`,
    );
  }

  const text = (result.value || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("This Word document contains no readable text.");

  return {
    text:     text.slice(0, MAX_CHARS),
    numPages: 0,
    fileType: ext.replace(".", ""),
  };
}

// ── PPTX ─────────────────────────────────────────────────────────────────────
async function parsePptx(filePath: string): Promise<ParseResult> {
  if (!AdmZip) throw new Error("adm-zip not installed. Run: npm install adm-zip");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let zip: any;
  try {
    zip = new AdmZip(filePath);
  } catch (err: unknown) {
    throw new Error(
      `Could not open PPTX file: ${(err as Error).message}. Make sure the file is not corrupted.`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = zip.getEntries();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slideEntries = entries
    .filter((e: any) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a: any, b: any) => {
      const numA = parseInt(a.entryName.match(/\d+/)?.[0] || "0");
      const numB = parseInt(b.entryName.match(/\d+/)?.[0] || "0");
      return numA - numB;
    });

  if (slideEntries.length === 0) {
    throw new Error("No slides found in PPTX file. The file may be corrupted.");
  }

  const slideTexts: string[] = [];

  for (const entry of slideEntries) {
    const xml: string = entry.getData().toString("utf8");
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    const slideText = matches
      .map((m: string) => m.replace(/<[^>]+>/g, ""))
      .filter((t: string) => t.trim())
      .join(" ");
    if (slideText.trim()) slideTexts.push(slideText.trim());
  }

  const text = slideTexts.join("\n\n").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("This PowerPoint file contains no readable text.");

  return {
    text:     text.slice(0, MAX_CHARS),
    numPages: slideEntries.length,
    fileType: "pptx",
  };
}

// ── PPT (legacy binary) ───────────────────────────────────────────────────────
async function parsePpt(filePath: string): Promise<ParseResult> {
  try {
    const buffer = fs.readFileSync(filePath);

    const text =
      buffer
        .toString("binary")
        .match(/[\x20-\x7E]{4,}/g)
        ?.filter((s: string) => {
          const wordChars = s.replace(/[^a-zA-Z\s]/g, "").length;
          return wordChars / s.length > 0.5 && s.trim().length > 3;
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim() ?? "";

    if (!text || text.length < 50) {
      throw new Error(
        "Could not extract readable text from this .ppt file. " +
        "Please convert it to .pptx format and upload again.",
      );
    }

    return { text: text.slice(0, MAX_CHARS), numPages: 0, fileType: "ppt" };
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.includes("convert")) throw err as Error;
    throw new Error(
      "Legacy .ppt files have limited support. " +
      "Please convert to .pptx format and upload again.",
    );
  }
}
