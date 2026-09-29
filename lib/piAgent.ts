import { readFile, writeFile } from "node:fs/promises";
import {
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  getWorkspacePathsFromMetadata,
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

const COMPONENT_NAMES = [
  "Airframe",
  "Engine1",
  "Engine2",
  "APU",
  "LandingGearLeft",
  "LandingGearRight",
  "LandingGearNose",
] as const;

type ComponentName = (typeof COMPONENT_NAMES)[number];

type ResultField = {
  value: string | null;
  confidence: number;
};

export type ExtractionResult = Record<FieldName, ResultField>;

export type SourceBBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  matched_text: string;
};

export type ComponentExtraction = {
  SerialNumber: string | null;
  TSN: number | null;
  CSN: number | null;
  MonthlyUtil_Hrs: number | null;
  MonthlyUtil_Cyc: number | null;
  attachment_status: "Attached" | "Removed" | null;
  derate: string | null;
  location: string | null;
  extraction_confidence: number;
  raw_source_text: string | null;
  available: boolean;
  TSN_raw: string | null;
  CSN_raw: string | null;
  MonthlyUtil_Hrs_raw: string | null;
  MonthlyUtil_Cyc_raw: string | null;
  source_file: string | null;
  current_aircraft: string | null;
  SerialNumber_bbox: SourceBBox | null;
  TSN_bbox: SourceBBox | null;
  CSN_bbox: SourceBBox | null;
  MonthlyUtil_Hrs_bbox: SourceBBox | null;
  MonthlyUtil_Cyc_bbox: SourceBBox | null;
  location_bbox: SourceBBox | null;
};

export type ComponentExtractionResult = Partial<Record<ComponentName, ComponentExtraction>>;

export type WorkspaceExtractionOutput = {
  fields: ExtractionResult;
  components: ComponentExtractionResult;
};

export type ExtractionTableField = {
  name: FieldName;
  value: string | null;
  confidence: number;
};

export type TraceEvent = {
  timestamp: string;
  type:
    | "session.started"
    | "model.started"
    | "turn.started"
    | "turn.completed"
    | "assistant.started"
    | "assistant.text.started"
    | "assistant.text.delta"
    | "assistant.text.completed"
    | "assistant.thinking.started"
    | "assistant.thinking.delta"
    | "assistant.thinking.completed"
    | "assistant.tool_call.started"
    | "assistant.tool_call.delta"
    | "assistant.tool_call.completed"
    | "assistant.completed"
    | "tool.started"
    | "tool.updated"
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

export function resultToTableFields(result: ExtractionResult): ExtractionTableField[] {
  return FIELD_NAMES.map((name) => ({
    name,
    value: result[name].value,
    confidence: result[name].confidence,
  }));
}

function tableFieldsToResult(fields: ExtractionTableField[] | ExtractionResult): ExtractionResult {
  if (!Array.isArray(fields)) {
    return normalizeResult(fields);
  }

  const result = {} as ExtractionResult;

  for (const fieldName of FIELD_NAMES) {
    const field = fields.find((item) => item.name === fieldName);
    result[fieldName] = normalizeField({
      value: field?.value ?? null,
      confidence: field?.confidence ?? 0,
    });
  }

  return result;
}

const nullableString = Type.Union([Type.String(), Type.Null()]);
const nullableNumber = Type.Union([Type.Number(), Type.Null()]);

function bboxSchema() {
  return Type.Union([
    Type.Object(
      {
        page: Type.Number(),
        x: Type.Number(),
        y: Type.Number(),
        width: Type.Number(),
        height: Type.Number(),
        matched_text: Type.String(),
      },
      { additionalProperties: false }
    ),
    Type.Null(),
  ]);
}

function componentSchema() {
  return Type.Object(
    {
      SerialNumber: nullableString,
      TSN: nullableNumber,
      CSN: nullableNumber,
      MonthlyUtil_Hrs: nullableNumber,
      MonthlyUtil_Cyc: nullableNumber,
      attachment_status: Type.Union([Type.Literal("Attached"), Type.Literal("Removed"), Type.Null()]),
      derate: nullableString,
      location: nullableString,
      extraction_confidence: Type.Number({ minimum: 0, maximum: 1 }),
      raw_source_text: nullableString,
      available: Type.Boolean(),
      TSN_raw: nullableString,
      CSN_raw: nullableString,
      MonthlyUtil_Hrs_raw: nullableString,
      MonthlyUtil_Cyc_raw: nullableString,
      source_file: nullableString,
      current_aircraft: nullableString,
      SerialNumber_bbox: bboxSchema(),
      TSN_bbox: bboxSchema(),
      CSN_bbox: bboxSchema(),
      MonthlyUtil_Hrs_bbox: bboxSchema(),
      MonthlyUtil_Cyc_bbox: bboxSchema(),
      location_bbox: bboxSchema(),
    },
    { additionalProperties: false }
  );
}

function createWorkspaceTools(options: {
  documentPath: string;
  documentJsonPath: string;
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

  const findTextCoordinatesTool = defineTool({
    name: "find_text_coordinates",
    label: "Find Text Coordinates",
    description: "Search the parsed LiteParse JSON text items and return coordinates for matching text.",
    promptSnippet: "Find coordinates/bounding boxes for extracted values in the parsed PDF JSON.",
    promptGuidelines: [
      "Use this when you need bbox/source coordinates for a specific extracted value.",
      "Search for exact values such as serial numbers, hour strings, cycle strings, aircraft registration.",
    ],
    parameters: Type.Object(
      {
        query: Type.String({ description: "Text/value to locate in parsed PDF text items." }),
        maxMatches: Type.Optional(Type.Number({ description: "Maximum coordinate matches to return. Values above 20 are capped." })),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const query = params.query.trim().slice(0, 120);

      if (!query) {
        throw new Error("query is required.");
      }

      const maxMatches = Math.min(20, Math.max(1, Math.trunc(params.maxMatches ?? 8)));
      const parsed = JSON.parse(await readFile(options.documentJsonPath, "utf8")) as {
        pages?: { pageNum?: number; textItems?: { text?: string; x?: number; y?: number; width?: number; height?: number }[] }[];
      };
      const lowerQuery = query.toLowerCase();
      const matches: { page: number; x: number; y: number; width: number; height: number; matched_text: string }[] = [];

      for (const page of parsed.pages || []) {
        for (const item of page.textItems || []) {
          const text = item.text || "";

          if (text.toLowerCase().includes(lowerQuery)) {
            matches.push({
              page: page.pageNum || 0,
              x: item.x || 0,
              y: item.y || 0,
              width: item.width || 0,
              height: item.height || 0,
              matched_text: text,
            });

            if (matches.length >= maxMatches) {
              return {
                content: [{ type: "text" as const, text: JSON.stringify({ query, matches }) }],
                details: { query, matchCount: matches.length },
              };
            }
          }
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
    description: "Save the final aircraft/component utilization extraction result. This is the final terminating action.",
    promptSnippet: "Save the final five-field summary plus component extraction result and terminate the run.",
    promptGuidelines: [
      "Call save_result exactly once after you have extracted the five summary fields and component fields.",
      "Use null and confidence 0 for absent summary fields. Summary confidence is 0 through 100.",
      "For missing components, set available false and unknown values to null.",
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
        components: Type.Object(
          {
            Airframe: componentSchema(),
            Engine1: componentSchema(),
            Engine2: componentSchema(),
            APU: componentSchema(),
            LandingGearLeft: componentSchema(),
            LandingGearRight: componentSchema(),
            LandingGearNose: componentSchema(),
          },
          { additionalProperties: false }
        ),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const result = normalizeResult(params as ExtractionResult);
      const components = (params as { components?: ComponentExtractionResult }).components || {};
      const payload = {
        fields: resultToTableFields(result),
        components,
        savedAt: new Date().toISOString(),
      };

      await writeFile(options.resultPath, `${JSON.stringify(payload, null, 2)}\n`);
      options.onEvent(createTraceEvent("result.saved", { fields: payload.fields, components: COMPONENT_NAMES }));

      return {
        content: [{ type: "text" as const, text: "Saved aircraft/component utilization extraction result." }],
        details: { fields: result, components },
      };
    },
  });

  return [readDocumentTool, grepDocumentTool, findTextCoordinatesTool, saveResultTool];
}

function sanitizeToolArgs(toolName: string, args: Record<string, unknown> | unknown) {
  if (!args || typeof args !== "object") {
    return {};
  }

  const toolArgs = args as Record<string, unknown>;
  if (toolName === "read_document") {
    return { offset: toolArgs.offset, limit: toolArgs.limit };
  }

  if (toolName === "grep_document") {
    return { query: toolArgs.query, maxMatches: toolArgs.maxMatches };
  }

  if (toolName === "find_text_coordinates") {
    return { query: toolArgs.query, maxMatches: toolArgs.maxMatches };
  }

  if (toolName === "save_result") {
    return { fields: FIELD_NAMES, components: COMPONENT_NAMES };
  }

  return {};
}

function summarizeAssistantContent(message: {
  content?: { type: string; id?: string; text?: string; name?: string; arguments?: unknown }[];
}) {
  const content = Array.isArray(message.content) ? message.content : [];

  return content.map((item) => {
    if (item.type === "text") {
      return { type: "text", text: item.text || "" };
    }

    if (item.type === "toolCall") {
      return { type: "toolCall", id: item.id, name: item.name, arguments: item.arguments };
    }

    if (item.type === "thinking") {
      return {
        type: "thinking",
        text: "Private reasoning was produced by the model. Hidden chain-of-thought is not displayed in the UI.",
      };
    }

    return { type: item.type };
  });
}

function sanitizeToolResult(toolName: string, result: Record<string, unknown> | unknown) {
  if (!result || typeof result !== "object") {
    return {};
  }

  const details = (result as Record<string, unknown>).details as Record<string, unknown> | undefined;

  const content = (result as Record<string, unknown>).content;
  const contentPreview = Array.isArray(content)
    ? content
        .map((item) => {
          if (item && typeof item === "object" && "text" in item) {
            return String((item as { text: unknown }).text);
          }

          return "";
        })
        .join("\n")
        .slice(0, 2000)
    : undefined;

  if (toolName === "read_document") {
    return {
      nextOffset: details?.nextOffset,
      endOfDocument: details?.endOfDocument,
      charactersReturned: details?.charactersReturned,
      contentPreview,
    };
  }

  if (toolName === "grep_document") {
    return {
      query: details?.query,
      matchCount: details?.matchCount,
      contentPreview,
    };
  }

  if (toolName === "find_text_coordinates") {
    return {
      query: details?.query,
      matchCount: details?.matchCount,
      contentPreview,
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
}): Promise<WorkspaceExtractionOutput> {
  const paths = await getWorkspacePathsFromMetadata(options.workspaceId);
  const emit = (event: TraceEvent) => {
    options.onEvent?.(event);
  };
  const metadata = await readWorkspaceMetadata(options.workspaceId);
  const modelRuntime = await ModelRuntime.create();
  const openRouterModel = (process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5").trim();
  const thinkingLevel = ((process.env.PI_THINKING_LEVEL || "low").trim() || "low") as
    | "off"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";
  const model = modelRuntime.getModel("openrouter", openRouterModel);

  if (!model) {
    throw new Error("Pi OpenRouter model was not found.");
  }

  await updateWorkspaceMetadata(options.workspaceId, { status: "running" });

  const sessionManager = metadata.sessionFile
    ? SessionManager.open(metadata.sessionFile, paths.tracesDir, paths.workspaceDir)
    : SessionManager.create(paths.workspaceDir, paths.tracesDir);

  const tools = createWorkspaceTools({
    documentPath: paths.documentPath,
    documentJsonPath: paths.documentJsonPath,
    resultPath: paths.resultPath,
    onEvent: emit,
  });

  const { session } = await createAgentSession({
    cwd: paths.workspaceDir,
    model,
    modelRuntime,
    noTools: "builtin",
    tools: ["read_document", "grep_document", "find_text_coordinates", "save_result"],
    customTools: tools,
    sessionManager,
    thinkingLevel,
  });

  await updateWorkspaceMetadata(options.workspaceId, {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile || null,
  });

  emit(createTraceEvent("session.started", { workspaceId: options.workspaceId, sessionId: session.sessionId }));

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "agent_start") {
      emit(createTraceEvent("model.started", { model: model.id || openRouterModel }));
    }

    if (event.type === "turn_start") {
      emit(createTraceEvent("turn.started"));
    }

    if (event.type === "turn_end") {
      emit(createTraceEvent("turn.completed"));
    }

    if (event.type === "message_start" && event.message.role === "assistant") {
      emit(createTraceEvent("assistant.started", { role: event.message.role }));
    }

    if (event.type === "message_update") {
      const assistantEvent = event.assistantMessageEvent;

      if (assistantEvent.type === "text_start") {
        emit(createTraceEvent("assistant.text.started", { contentIndex: assistantEvent.contentIndex }));
      }

      if (assistantEvent.type === "text_delta") {
        emit(createTraceEvent("assistant.text.delta", { delta: assistantEvent.delta }));
      }

      if (assistantEvent.type === "text_end") {
        emit(createTraceEvent("assistant.text.completed", { contentIndex: assistantEvent.contentIndex }));
      }

      if (assistantEvent.type === "thinking_start") {
        emit(createTraceEvent("assistant.thinking.started", { contentIndex: assistantEvent.contentIndex }));
      }

      if (assistantEvent.type === "thinking_delta") {
        // Do not repeat a hidden-reasoning placeholder for every private token.
        // Only thinking_start/thinking_end are surfaced.
      }

      if (assistantEvent.type === "thinking_end") {
        emit(
          createTraceEvent("assistant.thinking.completed", {
            contentIndex: assistantEvent.contentIndex,
            note: "Private reasoning completed. Hidden chain-of-thought is not displayed; visible progress and tool activity are streamed instead.",
          })
        );
      }

      if (assistantEvent.type === "toolcall_start") {
        const toolCall = assistantEvent.partial.content[assistantEvent.contentIndex];

        emit(
          createTraceEvent("assistant.tool_call.started", {
            contentIndex: assistantEvent.contentIndex,
            toolName: toolCall?.type === "toolCall" ? toolCall.name : undefined,
            toolCallId: toolCall?.type === "toolCall" ? toolCall.id : undefined,
          })
        );
      }

      if (assistantEvent.type === "toolcall_delta") {
        // Tool-call argument chunks are consolidated at toolcall_end.
      }

      if (assistantEvent.type === "toolcall_end") {
        emit(
          createTraceEvent("assistant.tool_call.completed", {
            contentIndex: assistantEvent.contentIndex,
            toolName: assistantEvent.toolCall.name,
            toolCallId: assistantEvent.toolCall.id,
            args: sanitizeToolArgs(assistantEvent.toolCall.name, assistantEvent.toolCall.arguments),
          })
        );
      }
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      emit(
        createTraceEvent("assistant.completed", {
          role: event.message.role,
          content: summarizeAssistantContent(event.message),
        })
      );
    }

    if (event.type === "tool_execution_start") {
      emit(
        createTraceEvent("tool.started", {
          toolName: event.toolName,
          args: sanitizeToolArgs(event.toolName, event.args || {}),
        })
      );
    }

    if (event.type === "tool_execution_update") {
      emit(
        createTraceEvent("tool.updated", {
          toolName: event.toolName,
          args: sanitizeToolArgs(event.toolName, event.args || {}),
          partialResult: sanitizeToolResult(event.toolName, event.partialResult || {}),
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
    await session.prompt(`## Extraction Task: Aircraft Utilization Fields

## Field Summary (5 fields)

| # | Field | Type | Required label variants |
|---|-------|------|-------------------------|
| 1 | total_month_cycles | TEXT | CYCLES/LANDINGS DURING MONTH; Total Cycles Made During Month |
| 2 | total_month_hours | TEXT | HOURS FLOWN DURING MONTH; Total Hours Flown During Month |
| 3 | total_new_cycles | TEXT | TOTAL CYCLES SINCE NEW; Total Cycles Since New |
| 4 | total_new_time | TEXT | AIRCRAFT TOTAL TIME SINCE NEW; Total Time Since New |
| 5 | aircraft_type | TEXT | A/C TYPE; Aircraft Type |

<fields>
<field name="total_month_cycles">
  <instruction>Cycles or landings during the reporting month. Return the numeric value only.</instruction>
</field>
<field name="total_month_hours">
  <instruction>Hours flown during the reporting month. Return the numeric hour value only.</instruction>
</field>
<field name="total_new_cycles">
  <instruction>Total aircraft cycles since new. Return the numeric value only.</instruction>
</field>
<field name="total_new_time">
  <instruction>Aircraft total time since new. Return the numeric hour/time value only. Remove commas unless needed for meaning.</instruction>
</field>
<field name="aircraft_type">
  <instruction>Aircraft type/model, for example 737-800 or A320-200.</instruction>
</field>
</fields>

## Component Extraction

Also extract component utilization for these components when present:

- Airframe
- Engine1
- Engine2
- APU
- LandingGearLeft
- LandingGearRight
- LandingGearNose

For each component return:

- SerialNumber
- TSN: numeric total time since new, converting HH:MM to decimal hours rounded to 2 decimals (example 37020:50 -> 37020.83)
- CSN: numeric cycles since new
- MonthlyUtil_Hrs: numeric period/monthly hours, converting HH:MM to decimal hours
- MonthlyUtil_Cyc: numeric period/monthly cycles
- attachment_status: Attached, Removed, or null
- derate
- location
- extraction_confidence: 0 through 1
- raw_source_text: concise source snippet used
- available: false when the component is absent
- TSN_raw, CSN_raw, MonthlyUtil_Hrs_raw, MonthlyUtil_Cyc_raw
- source_file: uploaded PDF filename when known
- current_aircraft: registration/current aircraft when known
- *_bbox fields: use find_text_coordinates for extracted values and save the closest matching coordinate object; use null when unavailable.

## Action

1. First write a short visible plan in plain text explaining which labels/components you will search. Do not reveal hidden/private chain-of-thought.
2. Use grep_document to locate likely labels and values.
3. Use read_document when more context is needed.
4. Use find_text_coordinates for key extracted values so bbox fields can be saved from the parsed PDF JSON.
5. After tool results, write a short visible summary of what you found and why each value is selected.
6. Call save_result exactly once with all 5 summary fields and all component objects.
7. After save_result completes, write a final concise Markdown summary table of the summary fields and components.

## Rules

- Do not invent values.
- Use null and confidence 0 when a summary value is absent.
- Summary confidence must be a number from 0 to 100.
- Component extraction_confidence must be a number from 0 to 1.
- For missing components, set available false and all unknown values/bboxes to null.
- Keep visible notes concise but informative, similar to an extraction trace.
- Hidden/private chain-of-thought is not required; use brief visible progress summaries instead.`);

    const resultPayload = JSON.parse(await readFile(paths.resultPath, "utf8")) as {
      fields: ExtractionTableField[] | ExtractionResult;
      components?: ComponentExtractionResult;
    };
    await updateWorkspaceMetadata(options.workspaceId, { status: "completed" });

    return {
      fields: tableFieldsToResult(resultPayload.fields),
      components: resultPayload.components || {},
    };
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
