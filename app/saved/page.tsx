import Link from "next/link";
import DeleteWorkspaceButton from "@/components/saved/DeleteWorkspaceButton";
import { listSavedWorkspaces } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  if (status === "failed") return "bg-red-100 text-red-700 ring-1 ring-red-200";
  if (status === "running") return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

export default async function SavedWorkspacesPage() {
  const workspaces = await listSavedWorkspaces();
  const completedCount = workspaces.filter((workspace) => workspace.status === "completed").length;

  return (
    <main className="aviation-shell min-h-screen px-4 py-8 text-white sm:px-6">

      <section className="relative mx-auto max-w-7xl">
        <div className="cockpit-panel mb-6 rounded-[2rem] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="inline-flex rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.3em] text-sky-100">
                ✈ Aircraft lease archive
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-5xl">Fleet utilization records</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                Review saved lessee PDF extractions for airframe, engines, APU, and landing gear usage. Each card represents one isolated aircraft workspace saved by the application.
              </p>
            </div>
            <Link href="/" className="rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 px-6 py-3 text-sm font-black text-slate-950 shadow-xl transition hover:-translate-y-0.5">
              + New utilization upload
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-sm font-bold text-slate-400">Total workspaces</p>
              <p className="mt-2 text-3xl font-black">{workspaces.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-sm font-bold text-slate-400">Completed lease records</p>
              <p className="mt-2 text-3xl font-black text-emerald-300">{completedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-sm font-bold text-slate-400">Audit trace files</p>
              <p className="mt-2 text-3xl font-black text-sky-300">{workspaces.reduce((total, workspace) => total + workspace.traceCount, 0)}</p>
            </div>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/95 p-10 text-center text-slate-950 shadow-2xl">
            <h2 className="text-xl font-black">No fleet records saved yet</h2>
            <p className="mt-2 text-slate-500">Upload an airline utilization PDF first, then the saved aircraft record will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((workspace) => (
              <div
                key={workspace.workspaceId}
                className="glass-panel group rounded-[2rem] p-4 text-slate-950 transition hover:-translate-y-1 hover:shadow-sky-950/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{workspace.hasResult ? "Lease record ready" : "Workspace created"}</p>
                    <h2 className="rr-mask mt-3 truncate text-xl font-black">{workspace.originalFilename}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusClass(workspace.status)}`}>
                    {workspace.status}
                  </span>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-slate-500">Aircraft workspace</p>
                    <p className="rr-mask mt-1 break-all font-semibold">{workspace.workspaceId}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <p className="text-slate-500">Last updated</p>
                      <p className="mt-1 font-semibold">{formatDate(workspace.updatedAt)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <p className="text-slate-500">Audit traces</p>
                      <p className="mt-1 font-semibold">{workspace.traceCount}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                  <Link href={`/saved/${workspace.workspaceId}`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-800">
                    Open record →
                  </Link>
                  <DeleteWorkspaceButton workspaceId={workspace.workspaceId} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
