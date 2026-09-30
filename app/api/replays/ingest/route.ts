import { NextResponse } from "next/server";
import { appendChunk, validateChunk } from "@/lib/replays/store";

const MAX_BODY_BYTES = 20 * 1024 * 1024;

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_SESSION_REPLAY !== "true") {
    return json({ error: "disabled" }, 404);
  }

  try {
    const raw = await req.arrayBuffer();

    if (raw.byteLength > MAX_BODY_BYTES) {
      return json({ error: "too large" }, 413);
    }

    const decoded = new TextDecoder().decode(raw);
    const { payload, startTs, endTs } = validateChunk(JSON.parse(decoded));

    await appendChunk(payload, { startTs, endTs }, req.headers.get("user-agent"));

    return json({ ok: true });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Invalid replay chunk.",
      },
      400
    );
  }
}
