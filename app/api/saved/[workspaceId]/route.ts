import { deleteSavedWorkspace } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await deleteSavedWorkspace(workspaceId);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not delete saved extraction.",
      },
      { status: 400 }
    );
  }
}
