import Link from "next/link";
import { listRecordings } from "@/lib/replays/store";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatDuration(startedAt: number, lastEventAt: number) {
  const seconds = Math.max(0, Math.round((lastEventAt - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export default async function ReplaysPage() {
  const recordings = process.env.NEXT_PUBLIC_SESSION_REPLAY === "true" ? await listRecordings(200) : [];

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Session replay</p>
            <h1 className="mt-2 text-4xl font-black">Replays</h1>
          </div>
          <Link href="/upload-file" className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
            Back to app
          </Link>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/30">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3 pr-4">Recording</th>
                <th className="py-3 pr-4">Started</th>
                <th className="py-3 pr-4">Duration</th>
                <th className="py-3 pr-4">Pages</th>
                <th className="py-3 pr-4">Entities opened</th>
                <th className="py-3">Full session</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map(({ meta, segments }) => {
                const entities = [...new Set(segments.map((segment) => segment.entityId).filter(Boolean))];

                return (
                  <tr key={meta.recordingId} className="border-b border-white/10 last:border-0">
                    <td className="py-4 pr-4 font-mono text-xs font-bold text-slate-300">{meta.recordingId}</td>
                    <td className="py-4 pr-4 text-slate-300">{formatDate(meta.startedAt)}</td>
                    <td className="py-4 pr-4 text-slate-300">{formatDuration(meta.startedAt, meta.lastEventAt)}</td>
                    <td className="py-4 pr-4 text-slate-300">{segments.length}</td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {entities.length > 0 ? (
                          entities.map((entityId) => (
                            <Link
                              key={entityId}
                              href={`/replays/${meta.recordingId}?entityId=${entityId}`}
                              className="rounded-full bg-cyan-300/15 px-3 py-1 text-xs font-bold text-cyan-200"
                            >
                              {entityId}
                            </Link>
                          ))
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <Link
                        href={`/replays/${meta.recordingId}`}
                        className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-black text-slate-950"
                      >
                        Play
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {recordings.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No replay recordings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
