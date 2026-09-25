import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import {
  saveMarkdownToTextCache,
  saveSavedOutput,
  saveUploadedFileToSession,
} from "@/lib/session";
import { convertPdfToMarkdownWithLiteParse } from "@/lib/liteparse";
import { extractFieldsWithPiAgent } from "@/lib/piAgent";
import { runSessionInspectionTool } from "@/lib/sessionTool";

export const runtime = "nodejs";

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_TEXT_CHARS = 60_000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const query = formData.get("query");
    const mode = formData.get("mode");
    const requestedSessionId = formData.get("sessionId");

    if (!(file instanceof File)) {
      return Response.json(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (typeof query !== "string" || !query.trim()) {
      return Response.json(
        { success: false, error: "Please enter a question." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      return Response.json(
        { success: false, error: "PDF must be 10 MB or smaller." },
        { status: 400 }
      );
    }
// here we are validating the file type
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return Response.json(
        { success: false, error: "Only PDF files are supported." },
        { status: 400 }
      );
    }
// here we are saving the uploaded file to the session and extracting text from it 
    const savedUpload = await saveUploadedFileToSession(
      file,
      typeof requestedSessionId === "string" ? requestedSessionId : null
    );

    console.log("SAVED UPLOAD:", savedUpload);

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error:
            "Missing OPENROUTER_API_KEY. Put it in a root .env.local file and restart next dev.",
        },
        { status: 500 }
      );
    }
// here we are converting the saved PDF file to structured markdown using LiteParse
    const markdownText = await convertPdfToMarkdownWithLiteParse(savedUpload.filePath);

    const savedMarkdown = await saveMarkdownToTextCache({
      sessionId: savedUpload.sessionId,
      fileName: savedUpload.fileName,
      textCacheDir: savedUpload.textCacheDir,
      markdownText,
    });

    console.log("SAVED MARKDOWN:", savedMarkdown);

    const sessionInspection = await runSessionInspectionTool({
      sessionId: savedUpload.sessionId,
      sessionDir: savedUpload.sessionDir,
      uploadsDir: savedUpload.uploadsDir,
      textCacheDir: savedUpload.textCacheDir,
      uploadedFilePath: savedUpload.filePath,
      markdownPath: savedMarkdown.markdownPath,
    });

    console.log("SESSION INSPECTION:", sessionInspection.tracePath);

    const openrouter = createOpenRouter({ apiKey });
    const documentText = markdownText.slice(0, MAX_PDF_TEXT_CHARS);
    const model = openrouter(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");

    if (mode === "structured") {
      const output = await extractFieldsWithPiAgent({
        markdown: documentText,
      });

      const savedOutputData = {
        sessionId: savedUpload.sessionId,
        document: {
          fileName: savedUpload.fileName,
          savedFile: savedUpload.relativeFilePath,
          markdownFile: savedMarkdown.relativeMarkdownPath,
        },
        ...output,
      };

      const savedOutput = await saveSavedOutput({
        sessionId: savedUpload.sessionId,
        sessionDir: savedUpload.sessionDir,
        output: savedOutputData,
      });

      console.log("SAVED OUTPUT:", savedOutput.relativeOutputPath);

      return Response.json({
        success: true,
        sessionId: savedUpload.sessionId,
        savedFile: savedUpload.relativeFilePath,
        markdownFile: savedMarkdown.relativeMarkdownPath,
        savedOutput: savedOutput.relativeOutputPath,
        output: savedOutputData,
      });
    }

    const result = streamText({
      model,
      system:
        "Answer the user's question using only the PDF markdown provided. If the answer is not in the PDF, say that it was not found in the PDF.",
      prompt: `Question:\n${query.trim()}\n\nPDF markdown:\n${documentText}`,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Analyze API error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);

    return Response.json(
      {
        success: false,
        error: errorMessage || "Something went wrong while analyzing the PDF.",
      },
      { status: 500 }
    );
  }
}
