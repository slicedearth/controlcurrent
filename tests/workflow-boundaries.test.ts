import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("publication workflow hardening", () => {
  it("restores a separately audited toolchain before any package-manager invocation", () => {
    for (const name of ["ci", "pages", "source-review", "update-dry-run"]) {
      const workflow = readFileSync(`.github/workflows/${name}.yml`, "utf8");
      expect(workflow).not.toContain("npm install --global");
      expect(workflow).not.toContain("cache: npm");
      expect(workflow).toContain("package-manager-cache: false");
      expect(workflow.indexOf("run: node tools/bootstrap-npm.ts")).toBeLessThan(
        workflow.indexOf("run: npm ci")
      );
    }
    expect(readFileSync(".nvmrc", "utf8").trim()).toBe("24");
    const guidance = readFileSync("docs/dependency-policy.md", "utf8");
    expect(guidance).toContain("outside the application");
    expect(guidance).toContain("never executes the runner's npm");
    expect(guidance).toContain("not enforced by `packageManager` alone");
    expect(
      readFileSync(".github/workflows/ci.yml", "utf8").match(/run: node tools\/bootstrap-npm.ts/gu)
    ).toHaveLength(2);
    expect(readFileSync(".github/workflows/source-review.yml", "utf8")).toContain(
      "if: always() && steps.toolchain.outcome == 'success'"
    );
  });

  it("gates both publication paths and rechecks the exact build commit after environment approval", () => {
    const workflow = readFileSync(".github/workflows/pages.yml", "utf8");
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"
    );
    expect(workflow.match(/run: node tools\/publication-gate.ts/gu)).toHaveLength(2);
    expect(workflow).toContain('GATE_WAIT_SECONDS: "600"');
    expect(workflow).toContain('GATE_WAIT_SECONDS: "0"');
    expect(workflow).toContain("release_sha: ${{ steps.release.outputs.sha }}");
    expect(workflow.indexOf("Require current verified release")).toBeLessThan(
      workflow.indexOf("Install locked dependencies")
    );
    const deploy = workflow.split("\n  deploy:\n")[1] ?? "";
    expect(deploy).toContain("ref: ${{ needs.build.outputs.release_sha }}");
    expect(deploy).toContain("RELEASE_SHA: ${{ needs.build.outputs.release_sha }}");
    expect(deploy).toContain("sparse-checkout: tools/publication-gate.ts");
    expect(deploy).toContain("package-manager-cache: false");
    expect(deploy).not.toMatch(/npm (?:ci|install|run)/u);
    expect(deploy.indexOf("Recheck current release")).toBeLessThan(
      deploy.indexOf("- name: Deploy Pages artifact")
    );
    expect(workflow.match(/actions: read/gu)).toHaveLength(2);
    expect(workflow).not.toContain("actions: write");
  });

  it("keeps paired security actions on the same reviewed immutable revision", () => {
    const workflow = readFileSync(".github/workflows/codeql.yml", "utf8");
    for (const action of ["init", "analyze"]) {
      expect(workflow).toContain(
        `github/codeql-action/${action}@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2`
      );
    }
  });
});

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
