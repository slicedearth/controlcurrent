import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manual deployment verification boundary", () => {
  it("binds checkout to the event SHA and gates upload on all verification commands", () => {
    const pages = readFileSync(".github/workflows/pages.yml", "utf8");
    expect(pages).toContain("github.event.workflow_run.head_sha || github.sha");
    expect(pages).toContain("github.event_name == 'workflow_dispatch'");
    const commands = [
      "run: npm ci",
      "run: npm run verify",
      "run: npm audit --audit-level=high",
      "run: npm run test:e2e:install:ci",
      "run: npm run test:e2e",
      "run: npm run build && npm run audit:public",
      "- name: Upload Pages artifact"
    ];
    let previous = -1;
    for (const command of commands) {
      const position = pages.indexOf(command, previous + 1);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    expect(pages).not.toMatch(/continue-on-error|if:.*always\(|\|\|\s*true/u);
    expect(pages).toContain("timeout-minutes: 30");
    const guidance = readFileSync("docs/deployment-security.md", "utf8");
    expect(guidance).toContain("no emergency verification bypass");
    expect(guidance).toContain("npm audit --audit-level=high");
    expect(guidance).toContain("npm run test:e2e");
  });

  it("adds manual-only checks without duplicating the successful automatic CI path", () => {
    const pages = readFileSync(".github/workflows/pages.yml", "utf8");
    for (const command of [
      "npm audit --audit-level=high",
      "npm run test:e2e:install:ci",
      "npm run build && npm run audit:public"
    ]) {
      expect(pages).toContain(
        `if: github.event_name == 'workflow_dispatch'\n        run: ${command}\n`
      );
    }
    expect(pages).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(pages).toContain("github.event.workflow_run.event == 'push'");
    expect(pages).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(pages).toContain("needs: build");
  });

  it("isolates loopback browser builds and restores the publication target before upload", () => {
    const pages = readFileSync(".github/workflows/pages.yml", "utf8");
    expect(pages).toContain("CONTROLCURRENT_DEPLOY_TARGET: github-pages");
    expect(pages).toContain(
      `if: github.event_name == 'workflow_dispatch'\n        env:\n          CONTROLCURRENT_DEPLOY_TARGET: ""\n        run: npm run test:e2e\n`
    );
    const restore = pages.split("- name: Restore and audit the publication build")[1];
    expect(restore).toBeDefined();
    const step = restore?.split("- name: Upload Pages artifact")[0] ?? "";
    expect(step).toContain("run: npm run build && npm run audit:public");
    expect(step).not.toContain("env:");
    expect(step).not.toContain("CONTROLCURRENT_DEPLOY_TARGET:");
  });

  it("keeps dedicated-origin preparation separate from remote hosting changes", () => {
    const guidance = readFileSync("docs/deployment-security.md", "utf8");
    expect(guidance).toContain("Do not select an account or domain implicitly");
    expect(guidance).toContain("Approve account, DNS and deployment changes explicitly");
    expect(guidance).toContain("ordinary navigation metadata may still be logged by the host");
  });
});
