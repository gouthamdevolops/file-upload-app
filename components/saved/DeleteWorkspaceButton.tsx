"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteWorkspaceButton({
  workspaceId,
  redirectTo,
  className = "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60",
}: {
  workspaceId: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this saved extraction workspace? This cannot be undone.")) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/saved/${workspaceId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Delete failed.");
      }

      if (redirectTo) {
        router.push(redirectTo);
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Delete failed.");
      setDeleting(false);
    }
  };

  return (
    <button type="button" onClick={handleDelete} disabled={deleting} className={className}>
      {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}
