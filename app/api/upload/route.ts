import { createWorkspaceForUpload, saveWorkspaceMarkdown, saveWorkspaceParsedJson } from "@/lib/session";
import { parsePdfWithLiteParse } from "@/lib/liteparse";

export const runtime = "nodejs";

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      return Response.json(
        { success: false, error: "PDF must be 10 MB or smaller." },
        { status: 400 }
      );
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return Response.json(
        { success: false, error: "Only PDF files are supported." },
        { status: 400 }
      );
    }

    const workspace = await createWorkspaceForUpload(file);
    const parsedDocument = await parsePdfWithLiteParse(workspace.originalFilePath);
    await saveWorkspaceMarkdown(workspace.workspaceId, parsedDocument.markdown, workspace.metadata.storedOriginalFilename);
    await saveWorkspaceParsedJson(workspace.workspaceId, parsedDocument.parsedJson, workspace.metadata.storedOriginalFilename);

    return Response.json({
      success: true,
      workspaceId: workspace.workspaceId,
      filename: workspace.metadata.originalFilename,
    });
  } catch (error) {
    console.error("Upload API error:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Something went wrong while uploading the PDF.",
      },
      { status: 500 }
    );
  }
}
