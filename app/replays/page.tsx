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
  const totalSegments = recordings.reduce((total, recording) => total + recording.segments.length, 0);

  return (
    <main className="aviation-shell min-h-screen px-5 py-8 text-white sm:px-6">
      <section className="relative z-10 mx-auto max-w-7xl space-y-6">
        <div className="cockpit-panel rounded-[2rem] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="inline-flex rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.3em] text-sky-100">
                ✈ Operator audit replay
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-5xl">Flight deck audit records</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                Review recorded application sessions like a cockpit voice/data review: what was opened, which lease record was inspected, and how the extraction workflow was used.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/saved" className="rounded-full border border-sky-200/20 bg-white/10 px-5 py-3 text-sm font-black text-sky-50 transition hover:bg-sky-300/20">
                Fleet Records
              </Link>
              <Link href="/upload-file" className="rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 px-5 py-3 text-sm font-black text-slate-950 shadow-xl transition hover:-translate-y-0.5">
                Back to cockpit
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-sky-200/10 bg-white/10 p-4">
              <p className="text-sm font-bold text-slate-300">Replay recordings</p>
              <p className="mt-2 text-3xl font-black text-white">{recordings.length}</p>
            </div>
            <div className="rounded-2xl border border-sky-200/10 bg-white/10 p-4">
              <p className="text-sm font-bold text-slate-300">Captured page segments</p>
              <p className="mt-2 text-3xl font-black text-sky-200">{totalSegments}</p>
            </div>
            <div className="rounded-2xl border border-sky-200/10 bg-white/10 p-4">
              <p className="text-sm font-bold text-slate-300">Mode</p>
              <p className="mt-2 text-3xl font-black text-amber-200">Audit</p>
            </div>
          </div>
        </div>

        <div className="glass-panel overflow-hidden rounded-[2rem] p-4 text-slate-950">
          <div className="mb-4 flex items-center justify-between gap-3 px-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-700">Recorded sessions</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">Application flight logs</h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-3 pr-4">Recording</th>
                  <th className="py-3 pr-4">Started</th>
                  <th className="py-3 pr-4">Duration</th>
                  <th className="py-3 pr-4">Segments</th>
                  <th className="py-3 pr-4">Lease records opened</th>
                  <th className="py-3">Replay</th>
                </tr>
              </thead>
              <tbody>
                {recordings.map(({ meta, segments }) => {
                  const entities = [...new Set(segments.map((segment) => segment.entityId).filter(Boolean))];

                  return (
                    <tr key={meta.recordingId} className="border-b border-slate-200 last:border-0">
                      <td className="py-4 pr-4 font-mono text-xs font-bold text-slate-600">{meta.recordingId}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatDate(meta.startedAt)}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatDuration(meta.startedAt, meta.lastEventAt)}</td>
                      <td className="py-4 pr-4 text-slate-700">{segments.length}</td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {entities.length > 0 ? (
                            entities.map((entityId) => (
                              <Link key={entityId} href={`/replays/${meta.recordingId}?entityId=${entityId}`} className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800 ring-1 ring-sky-200">
                                {entityId}
                              </Link>
                            ))
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <Link href={`/replays/${meta.recordingId}`} className="rounded-full bg-[#0b1f3a] px-4 py-2 text-xs font-black text-white transition hover:bg-sky-800">
                          Play audit
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {recordings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No audit replay recordings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
