import { readFile, writeFile } from "node:fs/promises";
import {
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  getWorkspacePaths,
  readWorkspaceMetadata,
  updateWorkspaceMetadata,
} from "@/lib/session";

const FIELD_NAMES = [
  "total_month_cycles",
  "total_month_hours",
  "total_new_cycles",
  "total_new_time",
  "aircraft_type",
] as const;

type FieldName = (typeof FIELD_NAMES)[number];

type ResultField = {
  value: string | null;
  confidence: number;
};

export type ExtractionResult = Record<FieldName, ResultField>;

export type TraceEvent = {
  timestamp: string;
  type:
    | "session.started"
    | "model.started"
    | "tool.started"
    | "tool.completed"
    | "result.saved"
    | "session.completed"
    | "session.failed";
  data: Record<string, unknown>;
};

function createTraceEvent(type: TraceEvent["type"], data: Record<string, unknown> = {}): TraceEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
}

function normalizeField(field: ResultField): ResultField {
  const value = typeof field.value === "string" && field.value.trim() ? field.value.trim() : null;
  const confidence = Number(field.confidence);

  return {
    value,
    confidence: value === null ? 0 : Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0)),
  };
}

function normalizeResult(params: ExtractionResult): ExtractionResult {
  const result = {} as ExtractionResult;

  for (const fieldName of FIELD_NAMES) {
    result[fieldName] = normalizeField(params[fieldName]);
  }

  return result;
}

export function resultToTableFields(result: ExtractionResult) {
  return FIELD_NAMES.map((name) => ({
    name,
    value: result[name].value,
    confidence: result[name].confidence,
  }));
}

function createWorkspaceTools(options: {
  documentPath: string;
  resultPath: string;
  onEvent: (event: TraceEvent) => void;
}) {
  const readDocumentTool = defineTool({
    name: "read_document",
    label: "Read Document",
    description: "Read a bounded chunk from the workspace Markdown document.",
    promptSnippet: "Read bounded chunks from the workspace document.",
    promptGuidelines: [
      "Use read_document when you need nearby context from the document.",
      "Never ask for paths; this tool already reads the workspace document.",
    ],
    parameters: Type.Object(
      {
        offset: Type.Number({ description: "Character offset to start reading from. Use 0 for the beginning." }),
        limit: Type.Number({ description: "Maximum characters to read. Values above 12000 are capped." }),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const offset = Math.trunc(params.offset);
      const limit = Math.min(12_000, Math.max(1, Math.trunc(params.limit)));

      if (offset < 0) {
        throw new Error("offset must be 0 or greater.");
      }

      const markdown = await readFile(options.documentPath, "utf8");
      const content = markdown.slice(offset, offset + limit);
      const nextOffset = offset + content.length;
      const endOfDocument = nextOffset >= markdown.length;

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ content, offset, nextOffset, endOfDocument }) }],
        details: { offset, limit, nextOffset, endOfDocument, charactersReturned: content.length },
      };
    },
  });

  const grepDocumentTool = defineTool({
    name: "grep_document",
    label: "Grep Document",
    description: "Search the workspace Markdown document using literal case-insensitive matching.",
    promptSnippet: "Search the workspace document for likely labels and values.",
    promptGuidelines: [
      "Use grep_document first to find aircraft utilization labels.",
      "Search for label variants such as cycles, hours, total time, aircraft type, A/C TYPE.",
    ],
    parameters: Type.Object(
      {
        query: Type.String({ description: "Literal text to search for, case-insensitive." }),
        maxMatches: Type.Optional(Type.Number({ description: "Maximum matches to return. Values above 20 are capped." })),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const query = params.query.trim().slice(0, 120);

      if (!query) {
        throw new Error("query is required.");
      }

      const maxMatches = Math.min(20, Math.max(1, Math.trunc(params.maxMatches ?? 8)));
      const markdown = await readFile(options.documentPath, "utf8");
      const lines = markdown.split(/\r?\n/);
      const lowerQuery = query.toLowerCase();
      const matches: { lineNumber: number; excerpt: string }[] = [];

      for (let index = 0; index < lines.length && matches.length < maxMatches; index++) {
        if (lines[index].toLowerCase().includes(lowerQuery)) {
          const start = Math.max(0, index - 1);
          const end = Math.min(lines.length, index + 2);
          matches.push({
            lineNumber: index + 1,
            excerpt: lines.slice(start, end).join("\n").slice(0, 1000),
          });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ query, matches }) }],
        details: { query, matchCount: matches.length },
      };
    },
  });

  const saveResultTool = defineTool({
    name: "save_result",
    label: "Save Result",
    description: "Save the final aircraft utilization extraction result. This is the final terminating action.",
    promptSnippet: "Save the final extraction result and terminate the run.",
    promptGuidelines: [
      "Call save_result exactly once after you have extracted the five required fields.",
      "Use null and confidence 0 for absent fields. Confidence is 0 through 100.",
      "Do not emit free-form JSON; use save_result as the final action.",
    ],
    parameters: Type.Object(
      {
        total_month_cycles: Type.Object(
          { value: Type.Union([Type.String(), Type.Null()]), confidence: Type.Number({ minimum: 0, maximum: 100 }) },
          { additionalProperties: false }
        ),
        total_month_hours: Type.Object(
          { value: Type.Union([Type.String(), Type.Null()]), confidence: Type.Number({ minimum: 0, maximum: 100 }) },
          { additionalProperties: false }
        ),
        total_new_cycles: Type.Object(
          { value: Type.Union([Type.String(), Type.Null()]), confidence: Type.Number({ minimum: 0, maximum: 100 }) },
          { additionalProperties: false }
        ),
        total_new_time: Type.Object(
          { value: Type.Union([Type.String(), Type.Null()]), confidence: Type.Number({ minimum: 0, maximum: 100 }) },
          { additionalProperties: false }
        ),
        aircraft_type: Type.Object(
          { value: Type.Union([Type.String(), Type.Null()]), confidence: Type.Number({ minimum: 0, maximum: 100 }) },
          { additionalProperties: false }
        ),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const result = normalizeResult(params as ExtractionResult);
      const payload = {
        fields: result,
        savedAt: new Date().toISOString(),
      };

      await writeFile(options.resultPath, `${JSON.stringify(payload, null, 2)}\n`);
      options.onEvent(createTraceEvent("result.saved", { fields: result }));

      return {
        content: [{ type: "text" as const, text: "Saved aircraft utilization extraction result." }],
        details: { fields: result },
        terminate: true,
      };
    },
  });

  return [readDocumentTool, grepDocumentTool, saveResultTool];
}

function sanitizeToolArgs(toolName: string, args: Record<string, unknown>) {
  if (toolName === "read_document") {
    return { offset: args.offset, limit: args.limit };
  }

  if (toolName === "grep_document") {
    return { query: args.query, maxMatches: args.maxMatches };
  }

  if (toolName === "save_result") {
    return { fields: FIELD_NAMES };
  }

  return {};
}

function sanitizeToolResult(toolName: string, result: Record<string, unknown>) {
  const details = result.details as Record<string, unknown> | undefined;

  if (toolName === "read_document") {
    return {
      nextOffset: details?.nextOffset,
      endOfDocument: details?.endOfDocument,
      charactersReturned: details?.charactersReturned,
    };
  }

  if (toolName === "grep_document") {
    return {
      query: details?.query,
      matchCount: details?.matchCount,
    };
  }

  if (toolName === "save_result") {
    return { saved: true };
  }

  return {};
}

export async function runWorkspaceExtraction(options: {
  workspaceId: string;
  onEvent?: (event: TraceEvent) => void;
}) {
  const paths = getWorkspacePaths(options.workspaceId);
  const emit = options.onEvent || (() => {});
  const metadata = await readWorkspaceMetadata(options.workspaceId);
  const modelRuntime = await ModelRuntime.create();
  const model = modelRuntime.getModel(
    "openrouter",
    process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"
  );

  if (!model) {
    throw new Error("Pi OpenRouter model was not found.");
  }

  await updateWorkspaceMetadata(options.workspaceId, { status: "running" });

  const sessionManager = metadata.sessionFile
    ? SessionManager.open(metadata.sessionFile, paths.tracesDir, paths.workspaceDir)
    : SessionManager.create(paths.workspaceDir, paths.tracesDir);

  const tools = createWorkspaceTools({
    documentPath: paths.documentPath,
    resultPath: paths.resultPath,
    onEvent: emit,
  });

  const { session } = await createAgentSession({
    cwd: paths.workspaceDir,
    model,
    modelRuntime,
    noTools: "builtin",
    tools: ["read_document", "grep_document", "save_result"],
    customTools: tools,
    sessionManager,
    thinkingLevel: "off",
  });

  await updateWorkspaceMetadata(options.workspaceId, {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile || null,
  });

  emit(createTraceEvent("session.started", { workspaceId: options.workspaceId, sessionId: session.sessionId }));

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "agent_start") {
      emit(createTraceEvent("model.started", { model: model.id || process.env.OPENROUTER_MODEL }));
    }

    if (event.type === "tool_execution_start") {
      emit(
        createTraceEvent("tool.started", {
          toolName: event.toolName,
          args: sanitizeToolArgs(event.toolName, event.args || {}),
        })
      );
    }

    if (event.type === "tool_execution_end") {
      emit(
        createTraceEvent("tool.completed", {
          toolName: event.toolName,
          isError: event.isError,
          result: sanitizeToolResult(event.toolName, event.result || {}),
        })
      );
    }
  });

  try {
    await session.prompt(`Extract the five aircraft utilization fields from the workspace document.

Required fields:
- total_month_cycles: CYCLES/LANDINGS DURING MONTH or Total Cycles Made During Month
- total_month_hours: HOURS FLOWN DURING MONTH or Total Hours Flown During Month
- total_new_cycles: TOTAL CYCLES SINCE NEW or Total Cycles Since New
- total_new_time: AIRCRAFT TOTAL TIME SINCE NEW or Total Time Since New
- aircraft_type: A/C TYPE or Aircraft Type

Tool rules:
- Use grep_document to locate likely labels and values.
- Use read_document when more context is needed.
- Do not invent values.
- Use null and confidence 0 when a value is absent.
- Confidence must be a number from 0 to 100.
- Finish by calling save_result exactly once.
- Do not output JSON or a prose answer; the save_result tool is the final answer.`);

    const resultPayload = JSON.parse(await readFile(paths.resultPath, "utf8")) as { fields: ExtractionResult };
    await updateWorkspaceMetadata(options.workspaceId, { status: "completed" });

    return resultPayload.fields;
  } catch (error) {
    await updateWorkspaceMetadata(options.workspaceId, { status: "failed" });
    emit(
      createTraceEvent("session.failed", {
        message: error instanceof Error ? error.message : "Extraction failed.",
      })
    );
    throw error;
  } finally {
    unsubscribe();
    session.dispose();
  }
}
