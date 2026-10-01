"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SourceBBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  matched_text: string;
};

type ComponentExtraction = {
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

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

const componentDisplayFields: { key: keyof ComponentExtraction; label: string }[] = [
  { key: "SerialNumber", label: "Serial Number" },
  { key: "location", label: "Location" },
  { key: "TSN", label: "TSN" },
  { key: "CSN", label: "CSN" },
  { key: "MonthlyUtil_Hrs", label: "Monthly Util Hrs" },
  { key: "MonthlyUtil_Cyc", label: "Monthly Util Cyc" },
  { key: "attachment_status", label: "Attachment Status" },
  { key: "derate", label: "Derate" },
  { key: "available", label: "Available" },
  { key: "extraction_confidence", label: "Extraction Confidence" },
  { key: "TSN_raw", label: "TSN Raw" },
  { key: "CSN_raw", label: "CSN Raw" },
  { key: "MonthlyUtil_Hrs_raw", label: "Monthly Util Hrs Raw" },
  { key: "MonthlyUtil_Cyc_raw", label: "Monthly Util Cyc Raw" },
  { key: "source_file", label: "Source File" },
  { key: "current_aircraft", label: "Current Aircraft" },
];

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
    <main className="aviation-shell min-h-screen text-[#0f172a]">
      <div className="relative z-10 border-b border-sky-200/20 bg-[#061225]/70 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200/25 bg-sky-400/15 text-2xl font-black text-sky-100 shadow-lg">✈</div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.34em] text-sky-200">AeroLease Ledger</p>
              <p className="text-sm font-semibold text-slate-200">Aircraft utilization evidence platform</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/saved" className="rounded-xl border border-sky-200/20 bg-white/10 px-4 py-2 text-sm font-bold text-sky-50 shadow-sm transition hover:bg-sky-300/20">Fleet Records</Link>
            <Link href="/replays" className="rounded-xl border border-sky-200/20 bg-white/10 px-4 py-2 text-sm font-bold text-sky-50 shadow-sm transition hover:bg-sky-300/20">Audit Replays</Link>
          </nav>
        </div>
      </div>

      <section className="relative z-10 mx-auto grid max-w-[1500px] gap-6 px-5 py-6 xl:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="glass-panel overflow-hidden rounded-[2rem]">
            <div className="runway-card border-b border-sky-200/10 p-6 text-white">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">Flight-hour return intake</p>
              <h1 className="mt-4 text-4xl font-black leading-tight tracking-[-0.04em]">Upload monthly aircraft usage PDF</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">Convert airline/operator PDF returns into structured lease utilization records for airframe, engines, APU, and landing gear.</p>
            </div>

            <div className="p-6">
              <label htmlFor="pdf-file" className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-sky-300 bg-gradient-to-br from-sky-50 via-white to-blue-50 px-6 py-8 text-center transition hover:border-sky-600 hover:shadow-lg hover:shadow-sky-900/10">
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-700 to-blue-950 text-3xl text-white shadow-xl shadow-sky-900/30">✈</span>
                <span className="mt-4 text-lg font-black text-slate-950">Select utilization report</span>
                <span className="mt-1 text-sm text-slate-500">PDF only · max 10 MB · saved as isolated workspace</span>
                <input id="pdf-file" type="file" accept=".pdf,application/pdf" onChange={handleFileChange} disabled={loading} className="sr-only" />
              </label>

              {file && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Selected aircraft report</p>
                  <p className="rr-mask mt-1 truncate text-base font-black text-slate-950">{file.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{fileSize} MB</p>
                  {!loading && <button type="button" onClick={handleClear} className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Remove file</button>}
                </div>
              )}

              <button type="button" onClick={handleUploadAndAnalyze} disabled={!file || loading} className="mt-5 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-sky-700 to-blue-950 px-5 py-4 text-sm font-black uppercase tracking-[0.14em] text-white shadow-xl shadow-sky-900/25 transition hover:-translate-y-0.5 hover:shadow-sky-900/40 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none">
                {loading ? "Building lease record..." : "Extract utilization data"}
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-5">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1d4ed8]">Workspace control</p>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <span className="text-slate-500">Processing status</span>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${completed ? "bg-emerald-100 text-emerald-700" : loading ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>{completed ? "completed" : loading ? "running" : workspaceId ? "ready" : "waiting"}</span>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-slate-500">Aircraft workspace ID</p>
                <p className="rr-mask mt-1 break-all font-semibold text-slate-900">{workspaceId || "Created after upload"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-slate-500">Source report</p>
                <p className="rr-mask mt-1 break-all font-semibold text-slate-900">{filename || file?.name || "No report selected"}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="cockpit-panel rounded-[2rem] p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-300">Lease return extraction</p>
                <h2 className="mt-2 text-4xl font-black tracking-[-0.04em] text-white">Aircraft utilization dashboard</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">This workspace reads the lessee PDF and captures lease-critical usage values: total time/cycles, component serials, TSN/CSN, monthly utilization, and attachment status.</p>
              </div>
              <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">Airline return → Structured record</div>
            </div>
          </div>

          {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900">{message}</div>}

          {structuredOutput && (
            <div className="glass-panel rounded-[2rem] p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Aircraft summary</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">Lease utilization fields</h2>
                </div>
                <span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-black text-emerald-700">Saved record</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {structuredOutput.fields.map((field) => (
                  <div key={field.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{fieldLabels[field.name]}</p>
                    <p className="mt-3 break-words text-xl font-black text-slate-950">{field.value || "Not found"}</p>
                    <p className="mt-3 text-xs font-bold text-slate-500">Confidence {field.confidence}%</p>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#1d4ed8]" style={{ width: `${Math.max(0, Math.min(100, field.confidence))}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {structuredOutput?.components && Object.keys(structuredOutput.components).length > 0 && (
            <div className="glass-panel rounded-[2rem] p-6">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1d4ed8]">Tracked assets</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Component utilization register</h2>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {componentOrder.filter((name) => structuredOutput.components?.[name]).map((name) => {
                  const component = structuredOutput.components?.[name];
                  if (!component) return null;
                  const confidence = Math.round((component.extraction_confidence || 0) * 100);
                  const status = component.attachment_status || (component.available ? "Available" : "Not found");
                  return (
                    <div key={name} className="rounded-3xl border border-slate-200 bg-[#fbfcfe] p-5 shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Asset module</p>
                          <h3 className="mt-1 text-2xl font-black text-[#0b1f3a]">{name}</h3>
                        </div>
                        <span className="rounded-full bg-[#e0f2fe] px-3 py-1 text-xs font-black text-[#075985]">{status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {componentDisplayFields.map((field) => (
                          <div key={field.key} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{field.label}</p>
                            <p className="mt-1 break-words font-black text-slate-950">{formatCell(component[field.key])}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 rounded-2xl bg-slate-100 p-3">
                        <div className="flex justify-between text-xs font-bold text-slate-600"><span>Extraction confidence</span><span>{confidence}%</span></div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#d7a348]" style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="cockpit-panel rounded-[2rem] p-6 text-white">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7a348]">Audit trail</p>
                <h2 className="mt-2 text-2xl font-black">Extraction activity log</h2>
              </div>
              <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black">{traceLines.length} events</span>
            </div>
            {traceLines.length > 0 ? (
              <div ref={traceRef} className="h-[30rem] overflow-auto rounded-2xl bg-[#06101f] p-4 font-mono text-xs leading-6 text-slate-200">
                {traceLines.map((line, index) => {
                  const item = parseLogLine(line);
                  return <div key={`${line}-${index}`} className="flex gap-2 py-1"><span className="shrink-0 text-slate-500">{item.time || "--:--:--"}</span><span className="shrink-0 text-sky-300">{item.label}</span><pre className="whitespace-pre-wrap break-words">{item.text}</pre></div>;
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">Extraction audit events will appear here after upload.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
