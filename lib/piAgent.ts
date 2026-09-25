import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const extractedFieldSchema = z.object({
  name: z.enum([
    "total_month_cycles",
    "total_month_hours",
    "total_new_cycles",
    "total_new_time",
    "aircraft_type",
  ]),
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

export const piExtractedOutputSchema = z.object({
  fields: z.array(extractedFieldSchema),
});

export type PiExtractedOutput = z.infer<typeof piExtractedOutputSchema>;

function extractJsonObject(text: string) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);

  if (jsonMatch?.[1]) {
    return jsonMatch[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Pi agent did not return a JSON object.");
  }

  return text.slice(start, end + 1);
}

export async function extractFieldsWithPiAgent(options: {
  markdown: string;
  modelId?: string;
}) {
  const modelRuntime = await ModelRuntime.create();
  const model = modelRuntime.getModel(
    "openrouter",
    options.modelId || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"
  );

  if (!model) {
    throw new Error("Pi OpenRouter model was not found.");
  }

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    modelRuntime,
    noTools: "all",
    sessionManager: SessionManager.inMemory(),
    thinkingLevel: "off",
  });

  try {
    await session.prompt(`Extract the following fields from the markdown document.

Return ONLY valid JSON. Do not include markdown fences or explanation.

Required JSON format:
{
  "fields": [
    { "name": "total_month_cycles", "value": "", "confidence": 0 },
    { "name": "total_month_hours", "value": "", "confidence": 0 },
    { "name": "total_new_cycles", "value": "", "confidence": 0 },
    { "name": "total_new_time", "value": "", "confidence": 0 },
    { "name": "aircraft_type", "value": "", "confidence": 0 }
  ]
}

Mapping hints:
- total_month_cycles: CYCLES/LANDINGS DURING MONTH or Total Cycles Made During Month
- total_month_hours: HOURS FLOWN DURING MONTH or Total Hours Flown During Month
- total_new_cycles: TOTAL CYCLES SINCE NEW or Total Cycles Since New
- total_new_time: AIRCRAFT TOTAL TIME SINCE NEW or Total Time Since New
- aircraft_type: A/C TYPE or Aircraft Type

If a value is not found, use an empty string and confidence 0.1.

Markdown document:
${options.markdown}`);

    const text = session.getLastAssistantText();

    if (!text) {
      throw new Error("Pi agent returned an empty response.");
    }

    const jsonText = extractJsonObject(text);
    const parsed = JSON.parse(jsonText);

    return piExtractedOutputSchema.parse(parsed);
  } finally {
    session.dispose();
  }
}
