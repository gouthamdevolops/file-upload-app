import Link from "next/link";
import { ReplayPlayer } from "@/components/ReplayPlayer";

export default async function ReplayPage({
  params,
  searchParams,
}: PageProps<"/replays/[recordingId]">) {
  const { recordingId } = await params;
  const query = await searchParams;
  const segment = typeof query.segment === "string" ? query.segment : undefined;
  const entityId = typeof query.entityId === "string" ? query.entityId : undefined;

  return (
    <main className="aviation-shell min-h-screen px-5 py-8 text-white sm:px-6">
      <section className="relative z-10 mx-auto max-w-7xl space-y-6">
        <div className="cockpit-panel rounded-[2rem] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/replays" className="text-sm font-bold text-sky-200 hover:text-white">← Back to flight deck audit records</Link>
              <p className="mt-4 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.3em] text-amber-100">
                Session black box replay
              </p>
              <h1 className="mt-4 break-all font-mono text-xl font-black tracking-[-0.03em] text-white sm:text-4xl">{recordingId}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Replay the exact browser interaction trail captured while users reviewed aircraft lease records and extraction outputs.
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
        </div>

        <ReplayPlayer recordingId={recordingId} segment={segment} entityId={entityId} />
      </section>
    </main>
  );
}
