import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { extractPdfTextFromFile } from "@/lib/uploadFile";

export const runtime = "nodejs";

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_TEXT_CHARS = 60_000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const query = formData.get("query");

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

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return Response.json(
        { success: false, error: "Only PDF files are supported." },
        { status: 400 }
      );
    }

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

    const pdfText = await extractPdfTextFromFile(file);

    if (!pdfText) {
      return Response.json(
        { success: false, error: "No readable text was found in this PDF." },
        { status: 400 }
      );
    }

    const openrouter = createOpenRouter({ apiKey });
    const documentText = pdfText.slice(0, MAX_PDF_TEXT_CHARS);

    const result = streamText({
      model: openrouter(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"),
      system:
        "Answer the user's question using only the PDF text provided. If the answer is not in the PDF, say that it was not found in the PDF.",
      prompt: `Question:\n${query.trim()}\n\nPDF text:\n${documentText}`,
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
