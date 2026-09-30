"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ComponentExtraction = {
  SerialNumber: string | null;
  TSN: number | null;
  CSN: number | null;
  MonthlyUtil_Hrs: number | null;
  MonthlyUtil_Cyc: number | null;
  attachment_status: "Attached" | "Removed" | null;
  location: string | null;
  extraction_confidence: number;
  available: boolean;
};

type StructuredOutput = {
  fields: {
    name:
      | "total_month_cycles"
      | "total_month_hours"
      | "total_new_cycles"
      | "total_new_time"
      | "aircraft_type";
    value: string | null;
    confidence: number;
  }[];
  components?: Record<string, ComponentExtraction>;
};

type TraceEvent = {
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
  data: {
    workspaceId?: string;
    sessionId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    result?: StructuredOutput;
    message?: string;
    isError?: boolean;
    delta?: string;
    note?: string;
    role?: string;
    contentIndex?: number;
    toolCallId?: string;
    content?: unknown;
    partialResult?: unknown;
  };
};

const TRACE_SEPARATOR = "\u001e";

const fieldLabels: Record<StructuredOutput["fields"][number]["name"], string> = {
  total_month_cycles: "Total Month Cycles",
  total_month_hours: "Total Month Hours",
  total_new_cycles: "Total Cycles Since New",
  total_new_time: "Total Time Since New",
  aircraft_type: "Aircraft Type",
};

const componentOrder = [
  "Airframe",
  "Engine1",
  "Engine2",
  "APU",
  "LandingGearLeft",
  "LandingGearRight",
  "LandingGearNose",
];

const componentThemes: Record<string, { card: string; badge: string; bar: string; accent: string }> = {
  Airframe: {
    card: "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-sky-50",
    badge: "bg-blue-100 text-blue-700",
    bar: "from-blue-500 to-sky-500",
    accent: "text-blue-700",
  },
  Engine1: {
    card: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-green-50",
    badge: "bg-emerald-100 text-emerald-700",
    bar: "from-emerald-500 to-green-500",
    accent: "text-emerald-700",
  },
  Engine2: {
    card: "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-purple-50",
    badge: "bg-violet-100 text-violet-700",
    bar: "from-violet-500 to-purple-500",
    accent: "text-violet-700",
  },
  APU: {
    card: "border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50",
    badge: "bg-orange-100 text-orange-700",
    bar: "from-orange-500 to-amber-500",
    accent: "text-orange-700",
  },
  LandingGearLeft: {
    card: "border-pink-200 bg-gradient-to-br from-pink-50 via-white to-rose-50",
    badge: "bg-pink-100 text-pink-700",
    bar: "from-pink-500 to-rose-500",
    accent: "text-pink-700",
  },
  LandingGearRight: {
    card: "border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-teal-50",
    badge: "bg-cyan-100 text-cyan-700",
    bar: "from-cyan-500 to-teal-500",
    accent: "text-cyan-700",
  },
  LandingGearNose: {
    card: "border-yellow-200 bg-gradient-to-br from-yellow-50 via-white to-lime-50",
    badge: "bg-yellow-100 text-yellow-700",
    bar: "from-yellow-500 to-lime-500",
    accent: "text-yellow-700",
  },
};

function formatCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatAssistantContent(content: unknown) {
  if (!Array.isArray(content)) {
    return prettyJson(content || []);
  }

  return content
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return `BLOCK ${index + 1}\n${String(item)}`;
      }

      const block = item as { type?: string; text?: string; name?: string; id?: string; arguments?: unknown };

      if (block.type === "thinking") {
        return `THINKING\n${block.text || "Private reasoning happened, but hidden chain-of-thought is not displayed."}`;
      }

      if (block.type === "text") {
        return `TEXT\n${block.text || ""}`;
      }

      if (block.type === "toolCall") {
        return `TOOL CALL ${block.name || "tool"}${block.id ? ` (${block.id})` : ""}\n${prettyJson(block.arguments || {})}`;
      }

      return `${(block.type || "block").toUpperCase()}\n${prettyJson(block)}`;
    })
    .join("\n\n────────────────────────\n\n");
}

function formatEvent(event: TraceEvent) {
  const time = new Date(event.timestamp).toLocaleTimeString();

  if (event.type === "assistant.text.delta") {
    return String(event.data.delta || "");
  }

  if (event.type === "assistant.thinking.delta" || event.type === "assistant.tool_call.delta") {
    return "";
  }

  if (event.type === "assistant.completed") {
    const content = Array.isArray(event.data.content) ? event.data.content : [];
    const hasOnlyText = content.length > 0 && content.every((item) => item && typeof item === "object" && (item as { type?: string }).type === "text");

    if (hasOnlyText) {
      return "";
    }

    return `[${time}] ASSISTANT MESSAGE: ${formatAssistantContent(event.data.content)}`;
  }

  if (event.type === "assistant.tool_call.started") {
    return `[${time}] TOOL CALL STARTED: ${event.data.toolName || "tool"} ${event.data.toolCallId || ""}`;
  }

  if (event.type === "assistant.text.started") {
    return `[${time}] ASSISTANT STREAMING: `;
  }

  if (event.type === "assistant.text.completed") {
    return "";
  }

  if (event.type === "assistant.tool_call.completed") {
    return `[${time}] TOOL CALL READY: ${event.data.toolName || "tool"} ${JSON.stringify(event.data.args || {})}`;
  }

  if (event.type === "assistant.thinking.started") {
    return `[${time}] THINKING STARTED: private reasoning started`;
  }

  if (event.type === "assistant.thinking.completed") {
    return `[${time}] THINKING COMPLETED: ${event.data.note || "private reasoning completed"}`;
  }

  if (event.type === "tool.started") {
    return `[${time}] TOOL STARTED: ${event.data.toolName} ${JSON.stringify(event.data.args || {})}`;
  }

  if (event.type === "tool.updated") {
    return `[${time}] TOOL UPDATED: ${event.data.toolName} ${JSON.stringify(event.data.partialResult || {})}`;
  }

  if (event.type === "tool.completed") {
    return `[${time}] TOOL RESULT: ${event.data.toolName}${event.data.isError ? " failed" : " completed"}\n${prettyJson(event.data.result || {})}`;
  }

  if (event.type === "session.failed") {
    return `[${time}] SESSION FAILED: ${event.data.message || "Extraction failed"}`;
  }

  return `[${time}] ${event.type.toUpperCase()}: ${prettyJson(event.data)}`;
}

function eventBadgeClass(eventType: TraceEvent["type"]) {
  if (eventType === "session.failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (eventType === "tool.started" || eventType === "tool.updated" || eventType.startsWith("assistant.tool_call")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (eventType === "assistant.text.delta" || eventType.startsWith("assistant.thinking")) {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }

  if (eventType === "tool.completed" || eventType === "result.saved" || eventType === "session.completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function formatReadableText(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return "streaming...";
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }

  return text;
}

function parseLogLine(line: string) {
  const match = line.match(/^\[(.*?)\]\s([^:]+):\s?([\s\S]*)$/);

  if (!match) {
    return { time: "", label: "trace", text: formatReadableText(line), badgeClass: "border-slate-200 bg-slate-50 text-slate-700" };
  }

  const label = match[2].toLowerCase().replaceAll(" ", ".") as TraceEvent["type"];

  return {
    time: match[1],
    label: match[2],
    text: formatReadableText(match[3]),
    badgeClass: eventBadgeClass(label),
  };
}

export default function FileUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState("");
  const [structuredOutput, setStructuredOutput] = useState<StructuredOutput | null>(null);
  const [agentLog, setAgentLog] = useState("");
  const [loading, setLoading] = useState(false);
  const traceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!traceRef.current) {
      return;
    }

    traceRef.current.scrollTop = traceRef.current.scrollHeight;
  }, [agentLog]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (
      selectedFile.type !== "application/pdf" &&
      !selectedFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setFile(null);
      setMessage("Please select a PDF file.");
      return;
    }

    setFile(selectedFile);
    setWorkspaceId("");
    setFilename("");
    setMessage("");
    setStructuredOutput(null);
    setAgentLog("");
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) {
      setMessage("Please select a PDF first.");
      return;
    }

    try {
      setLoading(true);
      setStructuredOutput(null);
      setAgentLog("");
      setMessage("Uploading PDF and extracting markdown...");

      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed.");
      }

      const uploadData = (await uploadResponse.json()) as {
        workspaceId: string;
        filename: string;
      };

      setWorkspaceId(uploadData.workspaceId);
      setFilename(uploadData.filename);
      setMessage("Running Pi extraction session...");
      setAgentLog(`[${new Date().toLocaleTimeString()}] UPLOAD READY: workspace ${uploadData.workspaceId}${TRACE_SEPARATOR}`);

      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: uploadData.workspaceId }),
      });

      if (!analyzeResponse.ok) {
        const data = await analyzeResponse.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed.");
      }

      if (!analyzeResponse.body) {
        throw new Error("The server did not return a stream.");
      }

      const reader = analyzeResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleLine = (line: string) => {
        if (!line.trim()) {
          return;
        }

        const event = JSON.parse(line) as TraceEvent;
        const formattedEvent = formatEvent(event);

        if (!formattedEvent.trim()) {
          return;
        }

        if (event.type === "assistant.text.delta") {
          setAgentLog((current) => {
            const withoutTrailingSeparator = current.endsWith(TRACE_SEPARATOR)
              ? current.slice(0, -TRACE_SEPARATOR.length)
              : current;

            return `${withoutTrailingSeparator}${formattedEvent}${TRACE_SEPARATOR}`;
          });
        } else {
          setAgentLog((current) => `${current}${current.endsWith(TRACE_SEPARATOR) || !current ? "" : TRACE_SEPARATOR}${formattedEvent}${TRACE_SEPARATOR}`);
        }

        if (event.type === "session.completed" && event.data.result) {
          setStructuredOutput(event.data.result);
          setMessage("Extraction completed.");
        }

        if (event.type === "session.failed") {
          throw new Error(event.data.message || "Extraction failed.");
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        lines.forEach(handleLine);
      }

      buffer += decoder.decode();
      handleLine(buffer);
    } catch (error) {
      console.error("EXTRACTION ERROR:", error);
      setMessage(error instanceof Error ? error.message : "Something went wrong while analyzing the PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setWorkspaceId("");
    setFilename("");
    setMessage("");
    setStructuredOutput(null);
    setAgentLog("");
  };

  const fileSize = file ? (file.size / 1024 / 1024).toFixed(2) : null;
  const traceLines = agentLog.split(TRACE_SEPARATOR).filter(Boolean);
  const completed = Boolean(structuredOutput);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#08111f] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,_rgba(59,130,246,0.38),_transparent_30%),radial-gradient(circle_at_85%_15%,_rgba(20,184,166,0.22),_transparent_28%),radial-gradient(circle_at_50%_100%,_rgba(168,85,247,0.25),_transparent_35%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]" />

      <section className="relative mx-auto min-h-screen w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 shadow-lg backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
                Pi workspace extraction
              </div>
              <Link
                href="/replays"
                className="inline-flex items-center rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-100"
              >
                View Replays
              </Link>
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              Extract aircraft fields with a safe Pi agent.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Upload once. The server creates an isolated workspace, Pi reads only through safe tools,
              and the final structured result is saved as JSON.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              ["01", "Upload", "PDF becomes workspace"],
              ["02", "Trace", "Pi tools stream live"],
              ["03", "Save", "Result JSON is written"],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-3xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur">
                <p className="text-sm font-bold text-cyan-200">{step}</p>
                <p className="mt-2 font-bold text-white">{title}</p>
                <p className="mt-1 text-sm text-slate-300">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/95 p-6 text-slate-950 shadow-2xl shadow-black/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Input</p>
                  <h2 className="mt-2 text-2xl font-black">Upload PDF</h2>
                  <p className="mt-1 text-sm text-slate-500">PDF only, up to 10 MB.</p>
                </div>
                <div className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">
                  LiteParse
                </div>
              </div>

              <label
                htmlFor="pdf-file"
                className="mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-blue-50 px-5 py-8 text-center transition hover:border-blue-500 hover:from-blue-50 hover:to-cyan-50"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 text-3xl text-white shadow-xl shadow-blue-600/30">↑</span>
                <span className="mt-5 text-lg font-black text-slate-900">Choose PDF file</span>
                <span className="mt-1 text-sm text-slate-500">The original stays server-side in the workspace.</span>
                <input
                  id="pdf-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="sr-only"
                />
              </label>

              {file && (
                <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Selected file</p>
                      <p className="rr-mask mt-1 truncate font-bold text-slate-900">{file.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{fileSize} MB</p>
                    </div>

                    {!loading && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleUploadAndAnalyze}
                disabled={!file || loading}
                className="mt-5 flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 font-black text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {loading ? "Running Pi extraction..." : "Upload and extract"}
              </button>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/95 p-6 text-slate-950 shadow-2xl shadow-black/30">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Workspace</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <span className="text-slate-500">Status</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${completed ? "bg-emerald-100 text-emerald-700" : loading ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                    {completed ? "completed" : loading ? "running" : workspaceId ? "ready" : "waiting"}
                  </span>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-slate-500">Workspace ID</p>
                  <p className="rr-mask mt-1 break-all font-semibold text-slate-900">{workspaceId || "Created after upload"}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-slate-500">Filename</p>
                  <p className="rr-mask mt-1 break-all font-semibold text-slate-900">{filename || file?.name || "No file selected"}</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            {message && (
              <div className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 text-blue-900 shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-3 w-3 rounded-full bg-blue-600 shadow-[0_0_16px_rgba(37,99,235,0.6)]" />
                  <div>
                    <p className="font-black">Current status</p>
                    <p className="mt-1 text-sm text-blue-700">{message}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-[2rem] border border-white/10 bg-white/95 p-6 text-slate-950 shadow-2xl shadow-black/30">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Live trace</p>
                  <h2 className="mt-2 text-2xl font-black">Live streaming agent transcript</h2>
                </div>
                <span className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
                  {traceLines.length} events
                </span>
              </div>

              {traceLines.length > 0 ? (
                <div
                  ref={traceRef}
                  className="h-[32rem] min-w-0 overflow-y-auto overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-inner"
                >
                  <div className="min-w-full font-mono text-xs leading-6 sm:text-sm">
                    {traceLines.map((line, index) => {
                      const item = parseLogLine(line);

                      return (
                        <div key={`${line}-${index}`} className="min-w-0 py-1">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="shrink-0 text-slate-500">{item.time || "--:--:--"}</span>
                            <span className="shrink-0 text-cyan-300">{item.label}</span>
                            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-100 [overflow-wrap:anywhere]">
                              {item.text}
                            </pre>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
                  Pi events, streamed assistant output, and tool-call details will appear here while extraction is running.
                </div>
              )}
            </div>

            {structuredOutput && (
              <>
                <div className="rounded-[2rem] border border-white/10 bg-white/95 p-6 text-slate-950 shadow-2xl shadow-black/30">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Result</p>
                      <h2 className="mt-2 text-2xl font-black">Structured aircraft fields</h2>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-black text-emerald-700">
                      Saved to result.json
                    </span>
                  </div>

                  <div className="grid min-w-0 gap-4 md:grid-cols-2">
                    {structuredOutput.fields.map((field) => (
                      <div key={field.name} className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">{fieldLabels[field.name]}</p>
                        <p className="mt-3 break-words text-2xl font-black text-slate-950">{field.value || "Not found"}</p>
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>Confidence</span>
                            <span>{field.confidence}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                              style={{ width: `${Math.max(0, Math.min(100, field.confidence))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {structuredOutput.components && Object.keys(structuredOutput.components).length > 0 && (
                  <div className="mt-8 lg:-ml-[360px] xl:-ml-[400px]">
                    <div className="mb-5">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Component extraction</p>
                      <h3 className="mt-2 text-3xl font-black text-white">Individual components</h3>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                      {componentOrder
                        .filter((name) => structuredOutput.components?.[name])
                        .map((name) => {
                          const component = structuredOutput.components?.[name];

                          if (!component) {
                            return null;
                          }

                          const theme = componentThemes[name] || componentThemes.Airframe;
                          const confidence = Math.round((component.extraction_confidence || 0) * 100);
                          const status = component.attachment_status || (component.available ? "Available" : "Not found");

                          return (
                            <div
                              key={name}
                              className="min-h-[360px] rounded-[2rem] border border-white/10 bg-slate-900/80 p-7 text-white shadow-2xl shadow-black/25 backdrop-blur"
                            >
                              <div className="mb-5 flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${theme.accent}`}>Component</p>
                                  <h4 className="mt-3 break-words text-3xl font-black text-white">{name}</h4>
                                </div>
                                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>{status}</span>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Serial</p>
                                  <p className="mt-1 break-words text-lg font-black text-white">{formatCell(component.SerialNumber)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Location</p>
                                  <p className="mt-1 break-words text-lg font-black text-white">{formatCell(component.location)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">TSN</p>
                                  <p className="mt-1 break-words text-lg font-black text-white">{formatCell(component.TSN)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">CSN</p>
                                  <p className="mt-1 break-words text-lg font-black text-white">{formatCell(component.CSN)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Month Hrs</p>
                                  <p className="mt-1 break-words text-lg font-black text-white">{formatCell(component.MonthlyUtil_Hrs)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Month Cyc</p>
                                  <p className="mt-1 break-words text-lg font-black text-white">{formatCell(component.MonthlyUtil_Cyc)}</p>
                                </div>
                              </div>

                              <div className="mt-5">
                                <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-300">
                                  <span>Confidence</span>
                                  <span>{confidence}%</span>
                                </div>
                                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`}
                                    style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
