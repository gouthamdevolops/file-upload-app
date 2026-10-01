"use client";

import "rrweb-player/dist/style.css";
import { useEffect, useRef, useState } from "react";

type ReplayResponse = {
  meta: Record<string, unknown>;
  segments: { segmentId: number; path: string; entityId: string | null }[];
  events: unknown[];
};

type ReplayPlayerProps = {
  recordingId: string;
  segment?: string;
  entityId?: string;
};

type RrwebPlayerInstance = {
  $destroy?: () => void;
  destroy?: () => void;
};

type RrwebPlayerConstructor = new (options: {
  target: HTMLElement;
  props: {
    events: unknown[];
    width: number;
    height: number;
    maxScale: number;
    autoPlay: boolean;
    skipInactive: boolean;
    tags: Record<string, string>;
  };
}) => RrwebPlayerInstance;

function destroyPlayer(player: RrwebPlayerInstance | null) {
  player?.$destroy?.();
  player?.destroy?.();
}

export function ReplayPlayer({ recordingId, segment, entityId }: ReplayPlayerProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<RrwebPlayerInstance | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();

    if (segment) {
      params.set("segment", segment);
    }

    if (entityId) {
      params.set("entityId", entityId);
    }

    const url = `/api/replays/${recordingId}${params.size ? `?${params.toString()}` : ""}`;
    let cancelled = false;

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Replay request failed: ${response.status}`);
        }

        return (await response.json()) as ReplayResponse;
      })
      .then((data) => {
        if (!cancelled) {
          setReplay(data);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Replay load failed.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recordingId, segment, entityId]);

  useEffect(() => {
    if (!replay || !targetRef.current) {
      return;
    }

    let cancelled = false;

    async function mountPlayer(currentReplay: ReplayResponse) {
      const mod = (await import("rrweb-player")) as unknown as { default: RrwebPlayerConstructor };

      if (cancelled || !targetRef.current) {
        return;
      }

      destroyPlayer(playerRef.current);
      targetRef.current.innerHTML = "";
      playerRef.current = new mod.default({
        target: targetRef.current,
        props: {
          events: currentReplay.events,
          width: 1280,
          height: 720,
          maxScale: 1,
          autoPlay: false,
          skipInactive: true,
          tags: { route: "#7c3aed" },
        },
      });
    }

    void mountPlayer(replay);

    return () => {
      cancelled = true;
      destroyPlayer(playerRef.current);
      playerRef.current = null;
    };
  }, [replay]);

  if (error) {
    return <div className="rounded-[2rem] border border-red-300/20 bg-red-950/60 p-6 text-red-100 shadow-2xl">{error}</div>;
  }

  if (!replay) {
    return <div className="cockpit-panel rounded-[1.5rem] p-4 text-slate-300">Loading black box replay...</div>;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="glass-panel overflow-x-auto rounded-[1.5rem] p-3 text-slate-950">
        <div ref={targetRef} />
      </div>

      <aside className="cockpit-panel rounded-[1.5rem] p-4 text-white">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-300">Flight path segments</p>
        <div className="mt-4 space-y-3">
          {replay.segments.map((item) => (
            <a
              key={item.segmentId}
              href={`/replays/${recordingId}?segment=${item.segmentId}`}
              className="block rounded-xl border border-sky-200/10 bg-white/10 p-3 text-sm transition hover:bg-sky-300/15"
            >
              <span className="font-black">Segment {item.segmentId}</span>
              <span className="mt-1 block break-all text-slate-300">{item.path}</span>
              {item.entityId && <span className="mt-2 inline-flex rounded-full bg-sky-300/15 px-2 py-1 text-xs font-bold text-sky-200">{item.entityId}</span>}
            </a>
          ))}
        </div>
      </aside>
    </div>
  );
}
