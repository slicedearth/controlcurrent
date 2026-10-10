import { MAX_DECISION_PACKET_BYTES } from "../decision-packet";

/** The caller owns user-visible status; an unsuccessful click still releases the Blob URL. */
export function downloadText(contents: string, filename: string, type: string): void {
  if (new TextEncoder().encode(contents).byteLength > MAX_DECISION_PACKET_BYTES) {
    throw new Error(
      "The export exceeds the 4 MiB limit. Nothing was downloaded; reduce the selected scope and try again."
    );
  }
  const url = URL.createObjectURL(new Blob([contents], { type }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
