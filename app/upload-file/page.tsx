"use client";

import { useState } from "react";

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
};

type TraceEvent = {
  timestamp: string;
  type:
    | "session.started"
    | "model.started"
    | "tool.started"
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
  };
};

function formatEvent(event: TraceEvent) {
  const time = new Date(event.timestamp).toLocaleTimeString();

  if (event.type === "tool.started") {
    return `[${time}] TOOL STARTED: ${event.data.toolName} ${JSON.stringify(event.data.args || {})}`;
  }

  if (event.type === "tool.completed") {
    return `[${time}] TOOL COMPLETED: ${event.data.toolName}${event.data.isError ? " failed" : " completed"}`;
  }

  if (event.type === "session.failed") {
    return `[${time}] SESSION FAILED: ${event.data.message || "Extraction failed"}`;
  }

  return `[${time}] ${event.type.toUpperCase()}: ${JSON.stringify(event.data)}`;
}

export default function FileUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState("");
  const [structuredOutput, setStructuredOutput] = useState<StructuredOutput | null>(null);
  const [agentLog, setAgentLog] = useState("");
  const [loading, setLoading] = useState(false);

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
      setAgentLog(`[${new Date().toLocaleTimeString()}] UPLOAD READY: workspace ${uploadData.workspaceId}\n`);

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
        setAgentLog((current) => `${current}${formatEvent(event)}\n`);

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

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.24),_transparent_30%)]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-10">
        <div className="grid w-full gap-8">
          <div className="mx-auto max-w-3xl space-y-6 text-center">
            <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur">
              Pi powered aircraft extraction
            </div>

            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Extract aircraft PDF fields.
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                Upload once, then Pi reads the workspace document through safe custom tools and saves a structured result.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl">01</p>
                <p className="mt-2">Upload PDF</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl">02</p>
                <p className="mt-2">Pi uses tools</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl">03</p>
                <p className="mt-2">Result saved</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/95 p-5 text-slate-950 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-950">Analyze document</h2>
                <p className="mt-1 text-sm text-slate-500">PDF only, up to 10 MB.</p>
              </div>

              <div className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
                Workspace session
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col">
                <label
                  htmlFor="pdf-file"
                  className="group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-blue-500 hover:bg-blue-50"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-lg shadow-blue-600/30">↑</span>
                  <span className="mt-4 text-base font-semibold text-slate-900">Choose a PDF file</span>
                  <span className="mt-1 text-sm text-slate-500">Click to browse from your computer</span>
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
                  <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected PDF</p>
                      <p className="mt-1 truncate font-semibold text-slate-900">{file.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{fileSize} MB</p>
                    </div>

                    {!loading && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Extraction target</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This fixed extraction reads the uploaded document and finds total month cycles, total month hours,
                    total cycles since new, total time since new, and aircraft type.
                  </p>

                  {workspaceId && (
                    <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Workspace created</p>
                      <p className="mt-1 break-all">{workspaceId}</p>
                      <p className="mt-1">{filename}</p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleUploadAndAnalyze}
                  disabled={!file || loading}
                  className="mt-5 flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {loading ? "Running Pi..." : "Upload and extract"}
                </button>
              </div>
            </div>

            {message && (
              <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                <p className="font-semibold">Status</p>
                <p className="mt-1 text-blue-700">{message}</p>
              </div>
            )}

            {agentLog && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Live Pi session/tool trace
                </p>
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-sm leading-6 text-green-200">
{agentLog.trimStart()}
                </pre>
              </div>
            )}

            {structuredOutput && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Structured output</p>

                <div className="mt-4 overflow-x-auto rounded-xl bg-white p-4 text-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Value</th>
                        <th className="py-2">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structuredOutput.fields.map((field) => (
                        <tr key={field.name} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 pr-4 font-semibold">{field.name}</td>
                          <td className="py-3 pr-4">{field.value || "Not found"}</td>
                          <td className="py-3">{field.confidence}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
