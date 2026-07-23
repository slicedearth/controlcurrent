import { profileEvaluationSchema } from "./contracts";
import { canonicalJson } from "./canonical";

export const MAX_EXPORT_BYTES = 512 * 1_024;

export function exportProfileEvaluation(input: unknown): string {
  const evaluation = profileEvaluationSchema.parse(input);
  const serialised = canonicalJson(evaluation);
  if (new TextEncoder().encode(serialised).byteLength > MAX_EXPORT_BYTES) {
    throw new Error(`Profile export exceeds the ${String(MAX_EXPORT_BYTES)}-byte limit.`);
  }
  return serialised;
}

export function csvSafeCell(value: string): string {
  const sanitized = value.replaceAll("\u0000", "").replaceAll(/\r\n?/gu, "\n");
  const protectedValue = /^[=+\-@\t\r]/u.test(sanitized) ? `'${sanitized}` : sanitized;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}
