import { LiteParse } from "@llamaindex/liteparse";

export async function parsePdfWithLiteParse(filePath: string) {
  const parser = new LiteParse({
    outputFormat: "markdown",
    imageMode: "placeholder",
    extractLinks: true,
    extractBlocks: true,
    extractContentBounds: true,
    extractTextMetadata: true,
    emitWordBoxes: true,
  });

  const result = await parser.parse(filePath);
  const markdown = result.text?.trim();

  if (!markdown) {
    throw new Error("LiteParse did not return markdown text for this PDF.");
  }

  return {
    markdown,
    parsedJson: result,
  };
}

export async function convertPdfToMarkdownWithLiteParse(filePath: string) {
  const { markdown } = await parsePdfWithLiteParse(filePath);
  return markdown;
}
