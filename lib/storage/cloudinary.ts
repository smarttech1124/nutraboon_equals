import { createHash, randomBytes } from "node:crypto";

/**
 * Cloudinary storage for uploaded files (ADR-064), called with the REST API
 * and signed requests (https://cloudinary.com/documentation/authentication_signatures).
 *
 * - Qualification documents are uploaded with type "private": they can only
 *   be fetched through a signed, short-lived download URL.
 * - Profile photos are public ("upload") under an unguessable id, and only
 *   shown on the site once the nutritionist is verified.
 *
 * The API secret never leaves the server.
 */

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

export type StoredFile = { publicId: string; format: string; bytes: number; url: string };

export type UploadKind = "document" | "photo";

const TIMEOUT_MS = 30_000;

export function cloudinaryConfig(
  env: Record<string, string | undefined> = process.env,
): CloudinaryConfig | null {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
  };
}

/** Sorted name=value pairs joined with "&", then the secret appended, SHA-1 hex. */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const serialized = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1")
    .update(serialized + apiSecret)
    .digest("hex");
}

export class CloudinaryError extends Error {
  constructor(readonly status: number | null) {
    super(`Cloudinary request failed (${status ?? "network"})`);
    this.name = "CloudinaryError";
  }
}

export class CloudinaryStorage {
  constructor(
    private readonly config: CloudinaryConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private base() {
    return `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.config.cloudName)}/image`;
  }

  private signed(params: Record<string, string | number>) {
    const timestamp = Math.floor(this.now() / 1000);
    const all = { ...params, timestamp };
    return {
      ...all,
      api_key: this.config.apiKey,
      signature: signParams(all, this.config.apiSecret),
    };
  }

  /** PDFs, JPEGs and PNGs all use Cloudinary's "image" resource type. */
  async upload(file: Blob, kind: UploadKind, folder: string): Promise<StoredFile> {
    const params = this.signed({
      folder,
      public_id: randomBytes(16).toString("hex"),
      type: kind === "document" ? "private" : "upload",
    });
    const form = new FormData();
    form.set("file", file);
    for (const [k, v] of Object.entries(params)) form.set(k, String(v));
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base()}/upload`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CloudinaryError(null);
    }
    // The body is only read on success: error bodies can echo request details.
    if (!response.ok) throw new CloudinaryError(response.status);
    const body = (await response.json()) as {
      public_id?: string;
      format?: string;
      bytes?: number;
      secure_url?: string;
    };
    if (!body.public_id || !body.format || !body.secure_url)
      throw new CloudinaryError(response.status);
    return {
      publicId: body.public_id,
      format: body.format,
      bytes: body.bytes ?? file.size,
      url: body.secure_url,
    };
  }

  /** A signed download link for a private file, valid for `seconds`. */
  privateDownloadUrl(publicId: string, format: string, seconds = 300): string {
    const params = this.signed({
      public_id: publicId,
      format,
      type: "private",
      expires_at: Math.floor(this.now() / 1000) + seconds,
    });
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return `${this.base()}/download?${query}`;
  }

  async destroy(publicId: string, kind: UploadKind): Promise<void> {
    const params = this.signed({
      public_id: publicId,
      type: kind === "document" ? "private" : "upload",
      invalidate: "true",
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base()}/destroy`, {
        method: "POST",
        body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CloudinaryError(null);
    }
    if (!response.ok) throw new CloudinaryError(response.status);
  }
}

export function getStorage(): CloudinaryStorage | null {
  const config = cloudinaryConfig();
  return config ? new CloudinaryStorage(config) : null;
}

/** A square, face-centred thumbnail of a public photo. */
export function photoThumbnail(url: string, size = 256): string {
  return url.replace(
    "/image/upload/",
    `/image/upload/c_fill,g_face,w_${size},h_${size},f_auto,q_auto/`,
  );
}

export type UploadedVideo = {
  publicId: string;
  format: string;
  bytes: number;
  /** The eager (pre-made) versions, in the order asked for. */
  eager: { url: string; format: string; bytes: number }[];
};

/**
 * Copies a video (a public URL or the file itself) into Cloudinary under a fixed public ID, replacing
 * any earlier copy, and makes the `eager` versions straight away (ADR-090:
 * the WhatsApp sign-language demo). Signed like every upload here.
 */
export async function uploadVideoFromUrl(
  config: CloudinaryConfig,
  input: { source: string | Blob; publicId: string; eager: string },
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<UploadedVideo> {
  const params = {
    public_id: input.publicId,
    overwrite: "true",
    invalidate: "true",
    eager: input.eager,
    eager_async: "false",
    timestamp: Math.floor(now() / 1000),
  };
  const form = new FormData();
  form.set("file", input.source);
  for (const [k, v] of Object.entries(params)) form.set(k, String(v));
  form.set("api_key", config.apiKey);
  form.set("signature", signParams(params, config.apiSecret));
  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/video/upload`,
      { method: "POST", body: form, signal: AbortSignal.timeout(120_000) },
    );
  } catch {
    throw new CloudinaryError(null);
  }
  if (!response.ok) {
    // Only used by the setup script, where Cloudinary's reason (e.g. a bad
    // transformation) is needed to fix the problem. It never contains the secret.
    const reason = (
      (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    )?.error?.message;
    const error = new CloudinaryError(response.status);
    if (reason) error.message += `: ${reason.slice(0, 300)}`;
    throw error;
  }
  const body = (await response.json()) as {
    public_id?: string;
    format?: string;
    bytes?: number;
    eager?: { secure_url?: string; format?: string; bytes?: number }[];
  };
  if (!body.public_id) throw new CloudinaryError(response.status);
  return {
    publicId: body.public_id,
    format: body.format ?? "",
    bytes: body.bytes ?? 0,
    eager: (body.eager ?? []).map((e) => ({
      url: e.secure_url ?? "",
      format: e.format ?? "",
      bytes: e.bytes ?? 0,
    })),
  };
}
