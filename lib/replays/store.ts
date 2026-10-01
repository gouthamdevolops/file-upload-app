import { promisify } from "node:util";
import { gzip as gzipCallback, gunzip as gunzipCallback } from "node:zlib";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  EntityIndexEntry,
  ReplayChunkPayload,
  ReplayMeta,
  ReplaySegment,
} from "@/lib/replays/types";

export type ReplayEventRange = {
  startTs: number;
  endTs: number;
};

const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);
const DATA_ROOT =
  process.env.DATA_ROOT?.trim() ||
  process.env.WORKSPACE_ROOT?.trim() ||
  process.env.APP_WORKSPACE_DIR?.trim() ||
  process.env.AZURE_FILES_MOUNT_PATH?.trim() ||
  "./workspace";
const REPLAY_ROOT = path.join(resolveDataRoot(), "replays");
const UUID_RE = /^[a-f0-9-]{36}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const recordingLocks = new Map<string, Promise<void>>();

function resolveDataRoot() {
  return path.isAbsolute(DATA_ROOT)
    ? path.normalize(DATA_ROOT)
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), DATA_ROOT);
}

function assertWithin(parent: string, child: string) {
  const relative = path.relative(parent, child);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes replay storage root.");
  }
}

function assertRecordingId(recordingId: string) {
  if (!UUID_RE.test(recordingId)) {
    throw new Error("Invalid recording id.");
  }
}

function assertSafeId(id: string, label: string) {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function recordingDir(recordingId: string) {
  assertRecordingId(recordingId);
  const dir = path.join(REPLAY_ROOT, "recordings", recordingId);
  assertWithin(REPLAY_ROOT, dir);
  return dir;
}

function chunkPath(recordingId: string, seq: number) {
  const file = path.join(recordingDir(recordingId), "chunks", `${String(seq).padStart(6, "0")}.json.gz`);
  assertWithin(REPLAY_ROOT, file);
  return file;
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

function eventTimestamp(event: unknown) {
  if (!event || typeof event !== "object" || !("timestamp" in event)) {
    return null;
  }

  const timestamp = Number((event as { timestamp: unknown }).timestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function validateChunk(body: unknown): {
  payload: ReplayChunkPayload;
  startTs: number;
  endTs: number;
} {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid replay chunk.");
  }

  const payload = body as ReplayChunkPayload;
  assertRecordingId(payload.recordingId);

  if (!Number.isInteger(payload.seq) || payload.seq < 1 || payload.seq > 1_000_000) {
    throw new Error("Invalid replay chunk seq.");
  }

  if (!Number.isInteger(payload.segmentId) || payload.segmentId < 1 || payload.segmentId > 1_000_000) {
    throw new Error("Invalid replay segment id.");
  }

  if (typeof payload.path !== "string" || payload.path.length > 512 || !payload.path.startsWith("/")) {
    throw new Error("Invalid replay path.");
  }

  if (payload.entityId !== null) {
    if (typeof payload.entityId !== "string") {
      throw new Error("Invalid replay entity id.");
    }

    assertSafeId(payload.entityId, "entity id");
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new Error("Replay events are required.");
  }

  const timestamps = payload.events.map(eventTimestamp).filter((item): item is number => item !== null);

  if (timestamps.length === 0) {
    throw new Error("Replay events must include numeric timestamps.");
  }

  return {
    payload,
    startTs: Math.min(...timestamps),
    endTs: Math.max(...timestamps),
  };
}

async function withRecordingLock<T>(recordingId: string, work: () => Promise<T>): Promise<T> {
  const previous = recordingLocks.get(recordingId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  recordingLocks.set(recordingId, previous.then(() => current));
  await previous;

  try {
    return await work();
  } finally {
    release();

    if (recordingLocks.get(recordingId) === current) {
      recordingLocks.delete(recordingId);
    }
  }
}

export async function appendChunk(
  payload: ReplayChunkPayload,
  range: ReplayEventRange,
  userAgent: string | null
) {
  let isNewSegment = false;

  await withRecordingLock(payload.recordingId, async () => {
    const dir = recordingDir(payload.recordingId);
    const chunksDir = path.join(dir, "chunks");
    const metaPath = path.join(dir, "meta.json");
    const segmentsPath = path.join(dir, "segments.json");

    await mkdir(chunksDir, { recursive: true });

    const existingMeta = await readJsonFile<ReplayMeta | null>(metaPath, null);

    await writeFile(chunkPath(payload.recordingId, payload.seq), await gzip(JSON.stringify(payload.events)));

    const meta: ReplayMeta = existingMeta
      ? {
          ...existingMeta,
          lastEventAt: Math.max(existingMeta.lastEventAt, range.endTs),
          chunkCount: Math.max(existingMeta.chunkCount, payload.seq),
        }
      : {
          recordingId: payload.recordingId,
          startedAt: range.startTs,
          lastEventAt: range.endTs,
          userAgent,
          chunkCount: payload.seq,
        };

    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

    const segments = await readJsonFile<ReplaySegment[]>(segmentsPath, []);
    const segment = segments.find((item) => item.segmentId === payload.segmentId);

    if (segment) {
      segment.startTs = Math.min(segment.startTs, range.startTs);
      segment.endTs = Math.max(segment.endTs, range.endTs);
      segment.firstChunk = Math.min(segment.firstChunk, payload.seq);
      segment.lastChunk = Math.max(segment.lastChunk, payload.seq);
      segment.path = payload.path;
      segment.entityId = payload.entityId;
    } else {
      isNewSegment = true;
      segments.push({
        segmentId: payload.segmentId,
        path: payload.path,
        entityId: payload.entityId,
        startTs: range.startTs,
        endTs: range.endTs,
        firstChunk: payload.seq,
        lastChunk: payload.seq,
      });
    }

    segments.sort((a, b) => a.segmentId - b.segmentId);
    await writeFile(segmentsPath, `${JSON.stringify(segments, null, 2)}\n`);
  });

  if (isNewSegment && payload.entityId) {
    const entry: EntityIndexEntry = {
      recordingId: payload.recordingId,
      segmentId: payload.segmentId,
      startedAt: range.startTs,
    };
    const entityIndexPath = path.join(REPLAY_ROOT, "index", "entities", `${payload.entityId}.ndjson`);
    assertWithin(REPLAY_ROOT, entityIndexPath);
    await mkdir(path.dirname(entityIndexPath), { recursive: true });
    await appendFile(entityIndexPath, `${JSON.stringify(entry)}\n`);
  }
}

export async function getRecording(recordingId: string) {
  const dir = recordingDir(recordingId);
  const meta = await readJsonFile<ReplayMeta | null>(path.join(dir, "meta.json"), null);

  if (!meta) {
    return null;
  }

  const segments = await readJsonFile<ReplaySegment[]>(path.join(dir, "segments.json"), []);
  return { meta, segments };
}

export async function readEvents(recordingId: string, segments: ReplaySegment[], segmentIds?: number[]) {
  const allowedSegmentIds = segmentIds ? new Set(segmentIds) : null;
  const chunkSeqs = new Set<number>();

  for (const segment of segments) {
    if (allowedSegmentIds && !allowedSegmentIds.has(segment.segmentId)) {
      continue;
    }

    for (let seq = segment.firstChunk; seq <= segment.lastChunk; seq++) {
      chunkSeqs.add(seq);
    }
  }

  const events: unknown[] = [];

  for (const seq of [...chunkSeqs].sort((a, b) => a - b)) {
    try {
      const chunkEvents = JSON.parse((await gunzip(await readFile(chunkPath(recordingId, seq)))).toString("utf8")) as unknown[];
      events.push(...chunkEvents);
    } catch {
      // Skip missing or corrupt chunks.
    }
  }

  return events.sort((a, b) => (eventTimestamp(a) || 0) - (eventTimestamp(b) || 0));
}

export async function listRecordings(limit = 200) {
  const recordingsDir = path.join(REPLAY_ROOT, "recordings");

  try {
    const ids = await readdir(recordingsDir);
    const recordings = await Promise.all(ids.filter((id) => UUID_RE.test(id)).map((id) => getRecording(id)));

    return recordings
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.meta.startedAt - a.meta.startedAt)
      .slice(0, limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function listEntityVisits(entityId: string) {
  assertSafeId(entityId, "entity id");
  const entityIndexPath = path.join(REPLAY_ROOT, "index", "entities", `${entityId}.ndjson`);
  assertWithin(REPLAY_ROOT, entityIndexPath);

  try {
    const content = await readFile(entityIndexPath, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EntityIndexEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
