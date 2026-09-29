import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "workspace";
const WORKSPACE_PREFIX = "workspace-";

export type WorkspaceStatus = "ready" | "running" | "completed" | "failed";

export type WorkspaceMetadata = {
  workspaceId: string;
  sessionId: string | null;
  sessionFile: string | null;
  originalFilename: string;
  storedOriginalFilename: string;
  storedMarkdownFilename: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
};

function assertWorkspaceId(workspaceId: string) {
  const uuid = workspaceId.startsWith(WORKSPACE_PREFIX)
    ? workspaceId.slice(WORKSPACE_PREFIX.length)
    : "";

  if (!/^[a-f0-9-]{36}$/i.test(uuid)) {
    throw new Error("Invalid workspace ID.");
  }
}

function getWorkspaceRootDir() {
  return path.isAbsolute(WORKSPACE_ROOT)
    ? WORKSPACE_ROOT
    : path.join(/*turbopackIgnore: true*/ process.cwd(), WORKSPACE_ROOT);
}

function sanitizeFilename(filename: string, fallback: string) {
  const base = path.basename(filename || fallback).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return base || fallback;
}

function getMarkdownFilename(filename: string) {
  const parsed = path.parse(sanitizeFilename(filename, "document.pdf"));
  return `${parsed.name || "document"}.md`;
}

function getParsedJsonFilename(filename: string) {
  const parsed = path.parse(sanitizeFilename(filename, "document.pdf"));
  return `${parsed.name || "document"}.json`;
}

export function getWorkspacePaths(workspaceId: string, originalFilename = "original.pdf") {
  assertWorkspaceId(workspaceId);

  const workspaceDir = path.join(/*turbopackIgnore: true*/ getWorkspaceRootDir(), workspaceId);
  const uploadsDir = path.join(workspaceDir, "uploads");
  const resultsDir = path.join(workspaceDir, "results");
  const tracesDir = path.join(workspaceDir, "traces");
  const storedOriginalFilename = sanitizeFilename(originalFilename, "original.pdf");
  const storedMarkdownFilename = getMarkdownFilename(storedOriginalFilename);
  const storedParsedJsonFilename = getParsedJsonFilename(storedOriginalFilename);

  return {
    workspaceId,
    workspaceDir,
    uploadsDir,
    resultsDir,
    tracesDir,
    storedOriginalFilename,
    storedMarkdownFilename,
    storedParsedJsonFilename,
    originalFilePath: path.join(uploadsDir, storedOriginalFilename),
    documentPath: path.join(uploadsDir, storedMarkdownFilename),
    documentJsonPath: path.join(uploadsDir, storedParsedJsonFilename),
    resultPath: path.join(resultsDir, "result.json"),
    metadataPath: path.join(workspaceDir, "session.json"),
  };
}

export async function createWorkspaceForUpload(file: File) {
  const workspaceId = `${WORKSPACE_PREFIX}${randomUUID()}`;
  const paths = getWorkspacePaths(workspaceId, file.name || "original.pdf");
  const now = new Date().toISOString();

  await mkdir(paths.uploadsDir, { recursive: true });
  await mkdir(paths.resultsDir, { recursive: true });
  await mkdir(paths.tracesDir, { recursive: true });

  await writeFile(paths.originalFilePath, Buffer.from(await file.arrayBuffer()));

  const metadata: WorkspaceMetadata = {
    workspaceId,
    sessionId: null,
    sessionFile: null,
    originalFilename: file.name || "original.pdf",
    storedOriginalFilename: paths.storedOriginalFilename,
    storedMarkdownFilename: paths.storedMarkdownFilename,
    status: "ready",
    createdAt: now,
    updatedAt: now,
  };

  await writeWorkspaceMetadata(workspaceId, metadata);

  return {
    ...paths,
    metadata,
  };
}

export async function readWorkspaceMetadata(workspaceId: string) {
  const paths = getWorkspacePaths(workspaceId);
  const metadata = JSON.parse(await readFile(paths.metadataPath, "utf8")) as WorkspaceMetadata;

  if (metadata.workspaceId !== workspaceId) {
    throw new Error("Workspace metadata does not match requested workspace.");
  }

  metadata.storedOriginalFilename ||= sanitizeFilename(metadata.originalFilename, "original.pdf");
  metadata.storedMarkdownFilename ||= getMarkdownFilename(metadata.storedOriginalFilename);

  return metadata;
}

export async function getWorkspacePathsFromMetadata(workspaceId: string) {
  const metadata = await readWorkspaceMetadata(workspaceId);
  return getWorkspacePaths(workspaceId, metadata.storedOriginalFilename || metadata.originalFilename);
}

export async function writeWorkspaceMetadata(workspaceId: string, metadata: WorkspaceMetadata) {
  const paths = getWorkspacePaths(workspaceId);
  await writeFile(
    paths.metadataPath,
    `${JSON.stringify({ ...metadata, updatedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

export async function updateWorkspaceMetadata(
  workspaceId: string,
  patch: Partial<Omit<WorkspaceMetadata, "workspaceId" | "createdAt">>
) {
  const current = await readWorkspaceMetadata(workspaceId);
  const next: WorkspaceMetadata = {
    ...current,
    ...patch,
    workspaceId,
    updatedAt: new Date().toISOString(),
  };

  await writeWorkspaceMetadata(workspaceId, next);

  return next;
}

export async function saveWorkspaceMarkdown(workspaceId: string, markdownText: string, originalFilename = "original.pdf") {
  const paths = getWorkspacePaths(workspaceId, originalFilename);
  const markdown = markdownText.trim().startsWith("#")
    ? `${markdownText.trim()}\n`
    : `# ${workspaceId}\n\n${markdownText.trim()}\n`;

  await writeFile(paths.documentPath, markdown);

  return paths.documentPath;
}

export async function saveWorkspaceParsedJson(workspaceId: string, parsedJson: unknown, originalFilename = "original.pdf") {
  const paths = getWorkspacePaths(workspaceId, originalFilename);
  await writeFile(paths.documentJsonPath, `${JSON.stringify(parsedJson, null, 2)}\n`);
  return paths.documentJsonPath;
}
