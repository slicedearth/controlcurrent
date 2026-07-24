import { fingerprintCanonical } from "./canonical-fingerprint";
import { type EvidenceBundleReport, evidenceBundleReportSchema } from "./contracts";

export async function fingerprintEvidenceReportBody(input: unknown): Promise<string> {
  return fingerprintCanonical(input);
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
