import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const excludedFiles = new Set([
  "LICENSE",
  "data/selected-bcd.json",
  "data/source-history.json",
  "package-lock.json",
  "src/styles/global.css",
  "tools/audit-language.ts"
]);

const excludedPrefixes = [".github/"];
const checkedExtensions = new Set([".astro", ".json", ".md", ".mjs", ".svg", ".ts"]);

const prohibited = [
  { label: "former project name", pattern: /defen[sc]ecompat/giu },
  { label: "American defence spelling", pattern: /defense/giu },
  { label: "American behaviour spelling", pattern: /\bbehaviors?\b/giu },
  { label: "American recognise spelling", pattern: /\b(?:un)?recogniz(?:e[ds]?|ing)\b/giu },
  {
    label: "American normalise spelling",
    pattern: /\bnormaliz(?:e[ds]?|ing|ation|er|ers)\b/giu
  },
  { label: "American analyser spelling", pattern: /\banalyzers?\b/giu },
  { label: "American favourable spelling", pattern: /\b(?:un)?favorabl(?:e|y)\b/giu },
  { label: "American standardise spelling", pattern: /\bstandardiz(?:e[ds]?|ing)\b/giu },
  { label: "American summarise spelling", pattern: /\bsummariz(?:e[ds]?|ing)\b/giu },
  { label: "American serialise spelling", pattern: /\bserializ(?:e[ds]?|ing)\b/giu },
  { label: "American minimise spelling", pattern: /\bminimiz(?:e[ds]?|ing)\b/giu },
  { label: "American organisation spelling", pattern: /\borganizations?\b/giu },
  { label: "American label spelling", pattern: /\blabel(?:ed|ing)\b/giu },
  { label: "American modelling spelling", pattern: /\bmodeling\b/giu },
  { label: "American prioritise spelling", pattern: /\bprioritiz(?:e[ds]?|ing)\b/giu },
  { label: "American customise spelling", pattern: /\bcustomiz(?:e[ds]?|ing)\b/giu },
  { label: "American utilise spelling", pattern: /\butiliz(?:e[ds]?|ing)\b/giu }
] as const;

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(
    (file) =>
      checkedExtensions.has(extname(file)) &&
      !excludedFiles.has(file) &&
      !excludedPrefixes.some((prefix) => file.startsWith(prefix))
  );

const failures: string[] = [];

for (const file of trackedFiles) {
  const content = readFileSync(file, "utf8");
  for (const { label, pattern } of prohibited) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const offset = match.index;
      const line = content.slice(0, offset).split("\n").length;
      failures.push(`${file}:${String(line)}: ${label}: ${match[0]}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(
    `Australian-English audit found ${String(failures.length)} prohibited occurrence(s):\n${failures.join("\n")}`
  );
}

console.log(
  `Audited ${String(trackedFiles.length)} project-authored files; ControlCurrent and Australian-English terminology are consistent.`
);
