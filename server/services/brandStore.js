import { mkdir, readFile, writeFile, access, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, "../../data/brand-dna");
const MAX_BYTES = 15 * 1024 * 1024;

export function brandDnaWorkspaceDir(workspaceId) {
  const safe = String(workspaceId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(DATA_ROOT, safe);
}

function manifestPath(workspaceId) {
  return join(brandDnaWorkspaceDir(workspaceId), "manifest.json");
}

function contextPath(workspaceId) {
  return join(brandDnaWorkspaceDir(workspaceId), "context.json");
}

export function sanitizeKnowledgeBaseFilename(name) {
  return String(name || "file")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .slice(0, 180);
}

export function isAllowedBrandDnaUpload(name, mime) {
  const n = String(name || "").toLowerCase();
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/") || m.startsWith("audio/") || m.startsWith("text/")) return true;
  if (m.includes("pdf") || m.includes("presentation") || m.includes("msword") || m.includes("officedocument")) {
    return true;
  }
  return /\.(pdf|pptx?|docx?|txt|md|png|jpe?g|webp|gif|webm|wav|mp3|m4a|ogg)$/i.test(n);
}

export async function readBrandDnaManifest(workspaceId) {
  try {
    const raw = await readFile(manifestPath(workspaceId), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.files) ? parsed.files : Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeBrandDnaManifest(workspaceId, files) {
  const dir = brandDnaWorkspaceDir(workspaceId);
  await mkdir(dir, { recursive: true });
  await writeFile(manifestPath(workspaceId), JSON.stringify({ files, updatedAt: new Date().toISOString() }, null, 2));
}

export async function readBrandContext(workspaceId) {
  try {
    const raw = await readFile(contextPath(workspaceId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeBrandContext(workspaceId, patch) {
  const dir = brandDnaWorkspaceDir(workspaceId);
  await mkdir(dir, { recursive: true });
  const existing = (await readBrandContext(workspaceId)) || {};
  const next = {
    ...existing,
    ...patch,
    workspaceId,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(contextPath(workspaceId), JSON.stringify(next, null, 2));
  return next;
}

export async function saveBrandDnaBinary({
  workspaceId,
  name,
  mime,
  size,
  base64,
  category = "brand_knowledge",
  transcript,
}) {
  if (!base64) throw new Error("base64 is required");
  if (size > MAX_BYTES) throw new Error(`${name || "File"} exceeds 15MB limit`);
  if (!isAllowedBrandDnaUpload(name, mime)) {
    throw new Error(`Unsupported file type for ${name}`);
  }

  const id = randomUUID();
  const safeName = sanitizeKnowledgeBaseFilename(name || "file.bin");
  const dir = brandDnaWorkspaceDir(workspaceId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${id}-${safeName}`);
  await writeFile(filePath, Buffer.from(base64, "base64"));

  const file = {
    id,
    category,
    name: safeName,
    mime: mime || "application/octet-stream",
    size: size || 0,
    createdAt: new Date().toISOString(),
    path: filePath,
    url: `/api/brand-dna/assets/${encodeURIComponent(workspaceId)}/${encodeURIComponent(id)}`,
    transcript: typeof transcript === "string" ? transcript : undefined,
  };

  const existing = await readBrandDnaManifest(workspaceId);
  const next =
    category === "logo"
      ? [file, ...existing.filter((f) => f?.category !== "logo")]
      : [file, ...existing];
  await writeBrandDnaManifest(workspaceId, next);
  return file;
}

export async function findBrandDnaAsset(workspaceId, fileId) {
  const files = await readBrandDnaManifest(workspaceId);
  const file = files.find((f) => f.id === fileId);
  if (!file?.path) return null;
  try {
    await access(file.path);
    return file;
  } catch {
    return null;
  }
}

/** Remove a KB/logo asset from disk, manifest, and brand context. */
export async function deleteBrandDnaAsset(workspaceId, fileId) {
  const id = String(fileId || "").trim();
  if (!id) throw new Error("fileId is required");

  const files = await readBrandDnaManifest(workspaceId);
  const target = files.find((f) => f?.id === id);
  const nextManifest = files.filter((f) => f?.id !== id);
  await writeBrandDnaManifest(workspaceId, nextManifest);

  if (target?.path) {
    try {
      await unlink(target.path);
    } catch {
      /* already gone */
    }
  }

  const ctx = (await readBrandContext(workspaceId)) || {};
  const prevKb = Array.isArray(ctx.knowledgeFiles) ? ctx.knowledgeFiles : [];
  const patch = {
    knowledgeFiles: prevKb.filter((f) => f?.id !== id),
  };
  if (ctx.logoUrl && target?.url && ctx.logoUrl === target.url) {
    patch.logoUrl = "";
  }
  await writeBrandContext(workspaceId, patch);

  return { deleted: Boolean(target), file: target ? { id: target.id, name: target.name } : null };
}

export { MAX_BYTES as BRAND_DNA_MAX_BYTES };
