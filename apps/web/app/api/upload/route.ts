import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { auth } from "@/auth";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "video/mp4",
  "video/mpeg",
  "audio/wav",
]);

/**
 * POST /api/upload — multipart `file`.
 * Prod (Vercel): set BLOB_READ_WRITE_TOKEN → stored in Vercel Blob (persistent).
 * Local dev: falls back to ./public/uploads/* (relative URL, same-origin, no CORS).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "File size exceeds 10MB." }, { status: 400 });
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json({ message: `File type ${file.type} not allowed.` }, { status: 400 });
  }

  const ext = path.extname(file.name).slice(0, 16);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

  // Vercel Blob when configured (prod) — local disk otherwise.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`uploads/${filename}`, file, { access: "public" });
    return NextResponse.json({
      file: { url: blob.url, name: file.name, size: file.size, type: file.type || "application/octet-stream" },
    });
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);

  return NextResponse.json({
    file: {
      url: `/uploads/${filename}`, // relative — client renders as-is
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    },
  });
}
