import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SESSIONS_DIR = "sessions";

async function writeJsonIfMissing(filePath: string, data: unknown) {
  try {
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function writeTextIfMissing(filePath: string, content: string) {
  try {
    await writeFile(filePath, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sanitizeSessionId(sessionId: string | null) {
  if (!sessionId) {
    return randomUUID();
  }

  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) {
    throw new Error("Invalid session ID.");
  }

  return sessionId;
}
// here we are saving the uploaded file to the session and extracting text from it 
export async function saveUploadedFileToSession(file: File, existingSessionId?: string | null) {
  const sessionId = sanitizeSessionId(existingSessionId || null);
  const safeFileName = sanitizeFileName(file.name || "uploaded.pdf");
  const rootSessionsDir = path.join(process.cwd(), SESSIONS_DIR);
  const locksDir = path.join(rootSessionsDir, "_locks");
  const sessionDir = path.join(rootSessionsDir, sessionId);
  const tracesDir = path.join(sessionDir, "traces");
  const uploadsDir = path.join(sessionDir, "uploads");
  const textCacheDir = path.join(uploadsDir, ".text-cache");
  const filePath = path.join(uploadsDir, safeFileName);

  await mkdir(locksDir, { recursive: true });
  await mkdir(tracesDir, { recursive: true });
  await mkdir(textCacheDir, { recursive: true });

  await writeTextIfMissing(
    path.join(sessionDir, "AGENTS.md"),
    `# Session ${sessionId}\n\nThis folder contains uploaded files, extracted text, traces, and JSON outputs for this session.\n`
  );

  await writeJsonIfMissing(path.join(sessionDir, "asset.json"), {
    sessionId,
    status: "created",
    createdAt: new Date().toISOString(),
  });

  await writeJsonIfMissing(path.join(sessionDir, "audit-log.json"), []);
  await writeJsonIfMissing(path.join(sessionDir, "documents.json"), []);
  await writeJsonIfMissing(path.join(sessionDir, "re-extract-log.json"), []);
  await writeJsonIfMissing(path.join(sessionDir, "review-status.json"), {
    status: "pending",
  });

  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  return {
    sessionId,
    fileName: safeFileName,
    filePath,
    sessionDir,
    uploadsDir,
    textCacheDir,
    relativeFilePath: path.join(SESSIONS_DIR, sessionId, "uploads", safeFileName),
  };
}
// here we are saving the LiteParse markdown output in the text cache
export async function saveMarkdownToTextCache(options: {
  sessionId: string;
  fileName: string;
  textCacheDir: string;
  markdownText: string;
}) {
  const markdownFileName = `${path.parse(options.fileName).name}.md`;
  const markdownPath = path.join(options.textCacheDir, markdownFileName);
  const markdown = options.markdownText.trim().startsWith("#")
    ? `${options.markdownText.trim()}\n`
    : `# ${options.fileName}\n\n${options.markdownText.trim()}\n`;

  await writeFile(markdownPath, markdown);

  return {
    markdownFileName,
    markdownPath,
    relativeMarkdownPath: path.join(
      SESSIONS_DIR,
      options.sessionId,
      "uploads",
      ".text-cache",
      markdownFileName
    ),
  };
}

export async function saveSavedOutput(options: {
  sessionId: string;
  sessionDir: string;
  output: unknown;
}) {
  const outputPath = path.join(options.sessionDir, "saved-output.json");

  await writeFile(outputPath, `${JSON.stringify(options.output, null, 2)}\n`);

  return {
    outputPath,
    relativeOutputPath: path.join(SESSIONS_DIR, options.sessionId, "saved-output.json"),
  };
}
