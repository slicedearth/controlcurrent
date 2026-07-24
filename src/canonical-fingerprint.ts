import { canonicalJson } from "./canonical";

export async function fingerprintCanonical(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input, 0));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
