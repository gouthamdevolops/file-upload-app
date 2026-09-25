"use server";

import PDFParser from "pdf2json";
// here we are extracting text from the uploaded pdf file 
export async function extractPdfTextFromFile(file: File) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are supported.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return new Promise<string>((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);

    pdfParser.on("pdfParser_dataError", (error) => {
      const parserError = error instanceof Error ? error : error.parserError;

      reject(
        new Error(
          parserError instanceof Error
            ? parserError.message
            : "Failed to read PDF."
        )
      );
    });

    pdfParser.on("pdfParser_dataReady", () => {
      const text = pdfParser.getRawTextContent().trim();
      pdfParser.destroy();
      resolve(text);
    });

    pdfParser.parseBuffer(buffer);
  });
}
