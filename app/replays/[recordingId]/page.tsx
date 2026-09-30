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
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Session replay</p>
            <h1 className="mt-2 break-all text-4xl font-black">{recordingId}</h1>
          </div>
          <Link href="/replays" className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
            Back to replays
          </Link>
        </div>

        <ReplayPlayer recordingId={recordingId} segment={segment} entityId={entityId} />
      </div>
    </main>
  );
}
