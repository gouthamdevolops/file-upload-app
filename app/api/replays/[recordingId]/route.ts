import { NextResponse } from "next/server";
import { getRecording, readEvents } from "@/lib/replays/store";

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(
  req: Request,
  context: RouteContext<"/api/replays/[recordingId]">
) {
  if (process.env.NEXT_PUBLIC_SESSION_REPLAY !== "true") {
    return json({ error: "disabled" }, 404);
  }

  try {
    const { recordingId } = await context.params;
    const recording = await getRecording(recordingId);

    if (!recording) {
      return json({ error: "not found" }, 404);
    }

    const url = new URL(req.url);
    const entityId = url.searchParams.get("entityId");
    const segmentParam = url.searchParams.get("segment");
    let segmentIds: number[] | undefined;

    if (entityId) {
      segmentIds = recording.segments
        .filter((segment) => segment.entityId === entityId)
        .map((segment) => segment.segmentId);
    } else if (segmentParam) {
      const segmentId = Number(segmentParam);

      if (!Number.isInteger(segmentId)) {
        return json({ error: "invalid segment" }, 400);
      }

      segmentIds = [segmentId];
    }

    const events = await readEvents(recordingId, recording.segments, segmentIds);

    return json({
      meta: recording.meta,
      segments: recording.segments,
      events,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Replay read failed.",
      },
      400
    );
  }
}
