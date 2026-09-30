export type ReplayChunkPayload = {
  recordingId: string;
  seq: number;
  segmentId: number;
  path: string;
  entityId: string | null;
  events: unknown[];
};

export type ReplayMeta = {
  recordingId: string;
  startedAt: number;
  lastEventAt: number;
  userAgent: string | null;
  chunkCount: number;
};

export type ReplaySegment = {
  segmentId: number;
  path: string;
  entityId: string | null;
  startTs: number;
  endTs: number;
  firstChunk: number;
  lastChunk: number;
};

export type EntityIndexEntry = {
  recordingId: string;
  segmentId: number;
  startedAt: number;
};
