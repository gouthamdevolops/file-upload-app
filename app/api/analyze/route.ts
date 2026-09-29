import { readFile } from "node:fs/promises";
import { getWorkspacePathsFromMetadata } from "@/lib/session";
import { resultToTableFields, runWorkspaceExtraction, TraceEvent } from "@/lib/piAgent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: unknown };

    if (typeof body.workspaceId !== "string") {
      return Response.json(
        { success: false, error: "workspaceId is required." },
        { status: 400 }
      );
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        {
          success: false,
          error: "Missing OPENROUTER_API_KEY. Put it in .env.local or Vercel environment variables.",
        },
        { status: 500 }
      );
    }

    const workspaceId = body.workspaceId;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: TraceEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          const extraction = await runWorkspaceExtraction({ workspaceId, onEvent: send });
          const paths = await getWorkspacePathsFromMetadata(workspaceId);
          const savedResult = JSON.parse(await readFile(paths.resultPath, "utf8"));

          send({
            timestamp: new Date().toISOString(),
            type: "session.completed",
            data: {
              workspaceId,
              result: {
                fields: resultToTableFields(extraction.fields),
                components: extraction.components,
                raw: savedResult,
              },
            },
          });
        } catch (error) {
          send({
            timestamp: new Date().toISOString(),
            type: "session.failed",
            data: {
              message: error instanceof Error ? error.message : "Extraction failed.",
            },
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("Analyze API error:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Something went wrong while analyzing the PDF.",
      },
      { status: 500 }
    );
  }
}
