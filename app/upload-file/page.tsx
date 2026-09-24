"use client";

import { useState } from "react";

export default function FileUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
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
    setMessage("");
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a PDF first.");
      return;
    }

    if (!query.trim()) {
      setMessage("Please enter what you want to know from the PDF.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Analyzing PDF...");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("query", query.trim());

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      console.log("API STATUS:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = errorText || "Something went wrong while analyzing the PDF.";

        try {
          const data: { error?: string } = JSON.parse(errorText);
          errorMessage = data.error || errorMessage;
        } catch {
          // Keep the plain text error message.
        }

        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error("The server did not return a stream.");
      }

      setMessage("");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        answer += decoder.decode(value, { stream: true });
        setMessage(answer);
      }

      answer += decoder.decode();

      setMessage(answer || "No relevant information was found in the PDF.");
    } catch (error) {
      console.error("UPLOAD ERROR:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while analyzing the PDF."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setQuery("");
    setMessage("");
  };

  const fileSize = file ? (file.size / 1024 / 1024).toFixed(2) : null;

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.24),_transparent_30%)]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-10">
        <div className="grid w-full gap-8">
          <div className="mx-auto max-w-3xl space-y-6 text-center">
            <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur">
              AI powered PDF reader
            </div>

            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Chat with your PDF in seconds.
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                Upload a document, ask a question, and get a streamed answer
                based only on the content inside your PDF.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl">01</p>
                <p className="mt-2">Upload PDF</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl">02</p>
                <p className="mt-2">Ask anything</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl">03</p>
                <p className="mt-2">Get answers</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/95 p-5 text-slate-950 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-950">
                  Analyze document
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  PDF only, up to 10 MB.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
                Live stream
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col">
                <label
                  htmlFor="pdf-file"
                  className="group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-blue-500 hover:bg-blue-50"
                >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-lg shadow-blue-600/30">
                ↑
              </span>
              <span className="mt-4 text-base font-semibold text-slate-900">
                Choose a PDF file
              </span>
              <span className="mt-1 text-sm text-slate-500">
                Click to browse from your computer
              </span>
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Selected PDF
                  </p>
                  <p className="mt-1 truncate font-semibold text-slate-900">
                    {file.name}
                  </p>
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

              <div className="flex flex-col">
                <label
                  htmlFor="query"
                  className="mb-2 block text-sm font-semibold text-slate-900"
                >
                  Your question
                </label>

                <textarea
                  id="query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={loading}
                  placeholder="Example: Summarize this PDF in five bullet points."
                  rows={8}
                  className="min-h-72 w-full flex-1 resize-none rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!file || !query.trim() || loading}
                  className="mt-5 flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {loading ? "Analyzing..." : "Analyze PDF"}
                </button>
              </div>
            </div>

            {loading && (
              <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                <p className="font-semibold">Processing your document</p>
                <p className="mt-1 text-blue-700">
                  Extracting text and streaming the answer as it is generated.
                </p>
              </div>
            )}

            {message && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    Answer
                  </p>
                  {loading && (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      Streaming
                    </span>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto rounded-xl bg-white p-4">
                  <p className="whitespace-pre-line break-words leading-7 text-slate-800">
                    {message}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
