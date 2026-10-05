import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reviewable manual deployment boundary", () => {
  it("binds checkout to the event SHA without silently removing the manual override", () => {
    const pages = readFileSync(".github/workflows/pages.yml", "utf8");
    expect(pages).toContain("github.event.workflow_run.head_sha || github.sha");
    expect(pages).toContain("run: npm run verify");
    expect(pages).toContain("github.event_name == 'workflow_dispatch'");
    const guidance = readFileSync("docs/deployment-security.md", "utf8");
    expect(guidance).toContain("not complete CI parity");
    expect(guidance).toContain("npm audit --audit-level=high");
    expect(guidance).toContain("npm run test:e2e");
    expect(guidance).toContain("requires maintainer approval");
  });
});
