import type { NextApiRequest, NextApiResponse } from "next";

import { Buffer as NodeBuffer } from "node:buffer";
import ExcelJS from "exceljs";
import formidable from "formidable";
import fs from "fs/promises";

export async function sendXlsx(
  res: NextApiResponse,
  filename: string,
  workbook: ExcelJS.Workbook,
): Promise<void> {
  // exceljs declares a global `Buffer` type as ArrayBuffer; normalize to Node.js Buffer for `res.send()`.
  const raw = await workbook.xlsx.writeBuffer();
  const buf = NodeBuffer.from(raw as unknown as ArrayBuffer);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.status(200).send(buf);
}

export async function readUploadedXlsx(req: NextApiRequest): Promise<ExcelJS.Workbook> {
  const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 });

  const { files } = await new Promise<{ files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err, _fields, parsedFiles) => {
      if (err) reject(err);
      else resolve({ files: parsedFiles });
    });
  });

  const fileAny = (files.file ?? Object.values(files)[0]) as formidable.File | formidable.File[] | undefined;
  const file = Array.isArray(fileAny) ? fileAny[0] : fileAny;
  if (!file) throw new Error("NO_FILE");

  const data = await fs.readFile(file.filepath);
  // exceljs expects an ArrayBuffer-like "Buffer" (their d.ts declares `interface Buffer extends ArrayBuffer`).
  // Convert Node.js Buffer (Uint8Array) to ArrayBuffer slice to satisfy typings.
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(ab);
  return workbook;
}

export function getFirstSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("NO_SHEET");
  return sheet;
}

export function normalizeCellString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && (v as { text?: unknown }).text != null) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
}
