import { LiteParse } from "@llamaindex/liteparse";

export async function convertPdfToMarkdownWithLiteParse(filePath: string) {
  const parser = new LiteParse({
    outputFormat: "markdown",
    imageMode: "placeholder",
    extractLinks: true,
  });

  const result = await parser.parse(filePath);
  const markdown = result.text?.trim();

  if (!markdown) {
    throw new Error("LiteParse did not return markdown text for this PDF.");
  }

  return markdown;
}
