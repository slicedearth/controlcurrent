export type VersionRelation = "before" | "equal" | "after" | "unknown";

type ParsedVersion = {
  parts: number[];
  uncertainUpperBound: boolean;
};

function parseVersion(value: string): ParsedVersion | undefined {
  const trimmed = value.trim();
  if (trimmed === "" || /^(preview|all|none)$/iu.test(trimmed)) {
    return undefined;
  }

  const uncertainUpperBound = trimmed.startsWith("≤");
  const withoutBound = trimmed.replace(/^≤\s*/u, "");
  const candidate = withoutBound.includes("-")
    ? (withoutBound.split("-", 2)[1] ?? withoutBound)
    : withoutBound;
  const match = /^\d+(?:\.\d+){0,3}$/u.exec(candidate);
  if (!match) {
    return undefined;
  }

  return {
    parts: candidate.split(".").map((part) => Number.parseInt(part, 10)),
    uncertainUpperBound
  };
}

function compareParts(left: readonly number[], right: readonly number[]): VersionRelation {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart < rightPart) return "before";
    if (leftPart > rightPart) return "after";
  }
  return "equal";
}

export function compareBrowserVersions(left: string, right: string): VersionRelation {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) {
    return "unknown";
  }
  return compareParts(parsedLeft.parts, parsedRight.parts);
}

export function thresholdState(
  baseline: string,
  threshold: string
): "met" | "not_met" | "uncertain" {
  const parsedThreshold = parseVersion(threshold);
  const parsedBaseline = parseVersion(baseline);
  if (!parsedThreshold || !parsedBaseline) {
    return "uncertain";
  }
  const relation = compareParts(parsedBaseline.parts, parsedThreshold.parts);
  if (relation === "after" || relation === "equal") {
    return "met";
  }
  return parsedThreshold.uncertainUpperBound ? "uncertain" : "not_met";
}
