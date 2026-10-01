import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteWorkspaceButton from "@/components/saved/DeleteWorkspaceButton";
import { readSavedWorkspaceDetails } from "@/lib/session";

export const dynamic = "force-dynamic";

type ResultPayload = {
  fields?: { name: string; value: string | null; confidence: number }[] | Record<string, { value: string | null; confidence: number }>;
  components?: Record<string, Record<string, unknown>>;
};

function isResultPayload(value: unknown): value is ResultPayload {
  return Boolean(value && typeof value === "object");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const componentDisplayFields = [
  ["SerialNumber", "Serial Number"],
  ["location", "Location"],
  ["TSN", "TSN"],
  ["CSN", "CSN"],
  ["MonthlyUtil_Hrs", "Monthly Util Hrs"],
  ["MonthlyUtil_Cyc", "Monthly Util Cyc"],
  ["attachment_status", "Attachment Status"],
  ["derate", "Derate"],
  ["available", "Available"],
  ["extraction_confidence", "Extraction Confidence"],
  ["TSN_raw", "TSN Raw"],
  ["CSN_raw", "CSN Raw"],
  ["MonthlyUtil_Hrs_raw", "Monthly Util Hrs Raw"],
  ["MonthlyUtil_Cyc_raw", "Monthly Util Cyc Raw"],
  ["source_file", "Source File"],
  ["current_aircraft", "Current Aircraft"],
] as const;

function getFields(result: unknown) {
  if (!isResultPayload(result) || !result.fields) return [];

  if (Array.isArray(result.fields)) return result.fields;

  return Object.entries(result.fields).map(([name, field]) => ({
    name,
    value: field?.value ?? null,
    confidence: field?.confidence ?? 0,
  }));
}

export default async function SavedWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const detail = await readSavedWorkspaceDetails(workspaceId).catch(() => null);

  if (!detail) notFound();

  const fields = getFields(detail.result);
  const components = isResultPayload(detail.result) ? detail.result.components || {} : {};

  return (
    <main className="aviation-shell min-h-screen px-4 py-8 text-white sm:px-6">

      <section className="relative mx-auto max-w-7xl space-y-6">
        <div className="cockpit-panel rounded-[2rem] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/saved" className="text-sm font-bold text-sky-200 hover:text-white">← Back to fleet records</Link>
              <p className="mt-4 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-amber-100">
                Saved aircraft lease evidence
              </p>
              <h1 className="rr-mask mt-4 break-words text-3xl font-black tracking-[-0.035em] sm:text-5xl">{detail.originalFilename}</h1>
              <p className="rr-mask mt-3 break-all text-slate-300">{detail.workspaceId}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <DeleteWorkspaceButton workspaceId={detail.workspaceId} redirectTo="/saved" />
              <Link href="/" className="rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 px-5 py-3 text-sm font-black text-slate-950 shadow-xl transition hover:-translate-y-0.5">
                New utilization upload
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="glass-panel rounded-[2rem] p-4 text-slate-950">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-700">Record control</p>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ["Status", detail.status],
                  ["Created", formatDate(detail.createdAt)],
                  ["Updated", formatDate(detail.updatedAt)],
                  ["Audit traces", detail.traceCount],
                  ["Lease record", detail.hasResult ? "Available" : "Not saved yet"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-slate-500">{label}</p>
                    <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>

          </aside>

          <section className="min-w-0 space-y-5">
            {fields.length > 0 && (
              <div className="glass-panel rounded-[2rem] p-4 text-slate-950">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Utilization summary</p>
                <h2 className="mt-2 text-xl font-black">Aircraft-level lease metrics</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.name} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{field.name}</p>
                      <p className="mt-2 break-words text-xl font-black">{field.value || "Not found"}</p>
                      <p className="mt-2 text-sm font-bold text-emerald-700">Confidence: {field.confidence}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(components).length > 0 && (
              <div className="glass-panel rounded-[2rem] p-4 text-slate-950">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-700">Tracked assets</p>
                <h2 className="mt-2 text-xl font-black">Airframe and component values</h2>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {Object.entries(components).map(([name, component]) => (
                    <div key={name} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
                      <h3 className="text-xl font-black">{name}</h3>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        {componentDisplayFields.map(([key, label]) => (
                          <div key={key}>
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                            <p className="mt-1 break-words font-bold">{formatCell(component[key])}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </section>
        </div>
      </section>
    </main>
  );
}
