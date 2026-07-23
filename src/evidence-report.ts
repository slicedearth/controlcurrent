import { canonicalJson } from "./canonical";
import { type EvidenceBundleReport, evidenceBundleReportSchema } from "./contracts";

export async function fingerprintEvidenceReportBody(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input, 0));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateEvidenceReport(input: unknown): Promise<EvidenceBundleReport> {
  const report = evidenceBundleReportSchema.parse(input);
  const { reportFingerprint, ...body } = report;
  const calculated = await fingerprintEvidenceReportBody(body);
  if (calculated !== reportFingerprint) {
    throw new Error("Reduced evidence report fingerprint does not match its canonical content.");
  }
  return report;
}
