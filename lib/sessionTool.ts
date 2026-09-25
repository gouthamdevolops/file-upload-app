import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type SessionToolInput = {
  sessionId: string;
  sessionDir: string;
  uploadsDir: string;
  textCacheDir: string;
  uploadedFilePath: string;
  markdownPath: string;
};

async function listFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });

  return Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      const entryStat = await stat(entryPath);

      return {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: entryStat.size,
      };
    })
  );
}

export async function runSessionInspectionTool(input: SessionToolInput) {
  const markdown = await readFile(input.markdownPath, "utf8");

  const report = {
    toolName: "session-inspection-tool",
    sessionId: input.sessionId,
    status: "completed",
    paths: {
      sessionDir: input.sessionDir,
      uploadsDir: input.uploadsDir,
      textCacheDir: input.textCacheDir,
      uploadedFilePath: input.uploadedFilePath,
      markdownPath: input.markdownPath,
    },
    files: {
      sessionRoot: await listFiles(input.sessionDir),
      uploads: await listFiles(input.uploadsDir),
      textCache: await listFiles(input.textCacheDir),
    },
    markdownPreview: markdown.slice(0, 1200),
    completedAt: new Date().toISOString(),
  };

  const tracePath = path.join(input.sessionDir, "traces", "session-inspection.json");
  await writeFile(tracePath, `${JSON.stringify(report, null, 2)}\n`);

  return {
    ...report,
    tracePath,
  };
}
