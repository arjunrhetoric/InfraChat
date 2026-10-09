import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6),
});

export const roomCreateSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(200).default(""),
  roomType: z.enum(["public", "private", "broadcast"]).default("public"),
});

export const attachmentSchema = z.object({
  url: z.string().url().or(z.string().startsWith("/uploads/")),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(10 * 1024 * 1024).optional(),
  mime: z.string().max(127).optional(),
});

// FIX (gap #2): content may be "" ONLY when attachments exist.
export const messageSendSchema = z
  .object({
    content: z.string().trim().max(2000).default(""),
    attachments: z.array(attachmentSchema).max(5).default([]),
  })
  .refine((v) => v.content.length > 0 || v.attachments.length > 0, {
    message: "Message content is required (or attach a file).",
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
