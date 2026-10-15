/**
 * Checks an uploaded file by its content, not its name or the browser's
 * claimed type (ADR-064). Only PDF, JPEG and PNG are accepted.
 */

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type FileKind = "pdf" | "jpeg" | "png";

export function sniffFileKind(bytes: Uint8Array): FileKind | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return "jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  return null;
}

export type CheckedFile = { ok: true; blob: Blob; kind: FileKind } | { ok: false; error: string };

export async function checkUpload(
  value: FormDataEntryValue | null,
  options: { maxBytes: number; allow: FileKind[] },
): Promise<CheckedFile> {
  if (!(value instanceof Blob) || value.size === 0) return { ok: false, error: "Choose a file." };
  if (value.size > options.maxBytes) {
    return {
      ok: false,
      error: `The file is too large. The limit is ${Math.round(options.maxBytes / 1024 / 1024)} MB.`,
    };
  }
  const bytes = new Uint8Array(await value.slice(0, 8).arrayBuffer());
  const kind = sniffFileKind(bytes);
  if (!kind || !options.allow.includes(kind)) {
    const names = options.allow.map((k) => k.toUpperCase()).join(", ");
    return { ok: false, error: `Upload a ${names} file.` };
  }
  const type = kind === "pdf" ? "application/pdf" : `image/${kind}`;
  return { ok: true, blob: new Blob([await value.arrayBuffer()], { type }), kind };
}
