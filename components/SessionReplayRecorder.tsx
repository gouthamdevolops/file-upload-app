"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReplayChunkPayload } from "@/lib/replays/types";

type RrwebRecord = {
  (options: {
    emit: (event: unknown) => void;
    maskInputOptions?: { password: boolean };
    blockClass?: string;
    maskTextClass?: string;
    slimDOMOptions?: "all";
    sampling?: { mousemove: number; scroll: number; media: number; input: "last" };
  }): () => void;
  addCustomEvent: (tag: string, payload: unknown) => void;
  takeFullSnapshot: (isCheckout?: boolean) => void;
};

type RrwebRecordModule = {
  record: RrwebRecord;
};

type RecorderState = {
  recordingId: string;
  seq: number;
  segmentId: number;
  lastFlushAt: number;
};

type RecorderSegment = {
  segmentId: number;
  path: string;
  entityId: string | null;
};

const STORAGE_KEY = "session-replay-state";
const STALE_AFTER_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5_000;
const KEEPALIVE_LIMIT_BYTES = 60 * 1024;
const ENTITY_ROUTE_RE = /^\/entities\/([A-Za-z0-9_-]+)/;

function shouldRecord(path: string) {
  if (process.env.NEXT_PUBLIC_SESSION_REPLAY !== "true") {
    return false;
  }

  if (path.startsWith("/replays")) {
    return false;
  }

  return true;
}

function entityIdFromPath(path: string) {
  return ENTITY_ROUTE_RE.exec(path)?.[1] ?? null;
}

function loadState(): RecorderState {
  const now = Date.now();

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);

    if (stored) {
      const state = JSON.parse(stored) as RecorderState;

      if (state.recordingId && now - state.lastFlushAt <= STALE_AFTER_MS) {
        return state;
      }
    }
  } catch {
    // Ignore invalid sessionStorage state and start a new recording.
  }

  return {
    recordingId: crypto.randomUUID(),
    seq: 0,
    segmentId: 0,
    lastFlushAt: now,
  };
}

function saveState(state: RecorderState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

class SessionReplayController {
  private mod: RrwebRecordModule | null = null;
  private loading: Promise<RrwebRecordModule> | null = null;
  private stopRecording: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buffer: unknown[] = [];
  private state: RecorderState | null = null;
  private segment: RecorderSegment | null = null;

  onRoute(pathname: string) {
    if (!this.mod) {
      this.loading ??= import("@rrweb/record").then((mod) => {
        this.mod = mod as RrwebRecordModule;
        this.onRoute(pathname);
        return this.mod;
      });
      return;
    }

    if (!shouldRecord(pathname)) {
      this.stop();
      return;
    }

    if (!this.stopRecording) {
      this.start(pathname);
      return;
    }

    if (this.segment?.path === pathname) {
      return;
    }

    void this.flush();
    this.segment = this.nextSegment(pathname);
    this.mod.record.takeFullSnapshot(true);
    this.mod.record.addCustomEvent("route", { path: pathname, entityId: this.segment.entityId });
    void this.flush();
  }

  start(pathname: string) {
    if (!this.mod || this.stopRecording) {
      return;
    }

    this.state = loadState();
    this.segment = this.nextSegment(pathname);

    this.stopRecording = this.mod.record({
      emit: (event) => {
        this.buffer.push(event);

        if (this.buffer.length >= 1000) {
          void this.flush();
        }
      },
      maskInputOptions: { password: true },
      blockClass: "rr-block",
      maskTextClass: "rr-mask",
      slimDOMOptions: "all",
      sampling: { mousemove: 100, scroll: 150, media: 800, input: "last" },
    });

    void this.flush();
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  stop() {
    void this.flush();
    this.stopRecording?.();
    this.stopRecording = null;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(keepalive = false) {
    if (!this.state || !this.segment || this.buffer.length === 0) {
      return;
    }

    const events = this.buffer.splice(0, this.buffer.length);
    const now = Date.now();
    this.state.seq += 1;
    this.state.lastFlushAt = now;
    saveState(this.state);

    const payload: ReplayChunkPayload = {
      recordingId: this.state.recordingId,
      seq: this.state.seq,
      segmentId: this.segment.segmentId,
      path: this.segment.path,
      entityId: this.segment.entityId,
      events,
    };

    const body = JSON.stringify(payload);

    if (keepalive && new Blob([body]).size > KEEPALIVE_LIMIT_BYTES) {
      return;
    }

    try {
      await fetch("/api/replays/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive,
      });
    } catch {
      this.buffer.unshift(...events);
    }
  }

  private nextSegment(path: string): RecorderSegment {
    if (!this.state) {
      this.state = loadState();
    }

    this.state.segmentId += 1;
    saveState(this.state);

    return {
      segmentId: this.state.segmentId,
      path,
      entityId: entityIdFromPath(path),
    };
  }
}

const controller = new SessionReplayController();

export function SessionReplayRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    controller.onRoute(pathname);
  }, [pathname]);

  useEffect(() => {
    const onPageHide = () => {
      void controller.flush(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void controller.flush();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
