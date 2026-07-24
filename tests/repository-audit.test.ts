import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_JSON_FILE_BYTES,
  MAX_PUBLIC_JSON_TOTAL_BYTES,
  auditCiWorkflow,
  auditPagesWorkflow,
  auditPublicJson,
  auditPublicJsonTotal,
  auditRepositoryPaths,
  auditWorkflow
} from "../src/repository-audit";

describe("repository publication audit", () => {
  it("accepts only the declared public data and synthetic example paths", () => {
    expect(() =>
      auditRepositoryPaths([
        "data/selected-bcd.json",
        "data/change-events.json",
        "data/source-history.json",
        "examples/headers.example.json",
        "src/catalogue.ts"
      ])
    ).not.toThrow();
    expect(() => auditRepositoryPaths(["data/raw-export.json"])).toThrow(
      /not an approved public data file/u
    );
    expect(() => auditRepositoryPaths(["examples/production.json"])).toThrow(
      /not an approved synthetic example file/u
    );
  });

  it("rejects local assessment and attestation exports even when nested", () => {
    for (const file of [
      "controlcurrent-collected-evidence.json",
      "controlcurrent-profile.json",
      "controlcurrent-engineering-report.md",
      "controlcurrent-policy.json",
      "controlcurrent-decision-report.html",
      "controlcurrent-decision-packet.json",
      "source-review.json",
      "reports/controlcurrent-evidence-report.json",
      "audit/statement.json",
      "sigstore-bundle.json"
    ]) {
      expect(() => auditRepositoryPaths([file])).toThrow(/must not be tracked/u);
    }
  });

  it("rejects personal, credential-like and private-network JSON", () => {
    const rejected = [
      '{"email":"analyst@example.com"}',
      '{"api_key":"abcdefghijk"}',
      '{"host":"http://127.0.0.1:8080"}',
      '{"host":"https://192.168.1.20"}'
    ];
    for (const contents of rejected) {
      expect(() => auditPublicJson("data/test.json", contents, contents.length)).toThrow(
        /prohibited public JSON content/u
      );
    }
  });

  it("enforces per-file and aggregate byte limits", () => {
    expect(() => auditPublicJson("data/test.json", "{}", MAX_PUBLIC_JSON_FILE_BYTES + 1)).toThrow(
      /file bound/u
    );
    expect(() => auditPublicJsonTotal(MAX_PUBLIC_JSON_TOTAL_BYTES + 1)).toThrow(
      /aggregate size bound/u
    );
  });

  it("accepts reviewed immutable action references", () => {
    const workflow = `
name: CI
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)} # v7.0.0
      - uses: ./local-action
`;
    expect(() =>
      auditWorkflow(".github/workflows/ci.yml", workflow, workflow.length)
    ).not.toThrow();
  });

  it("rejects mutable actions and privileged workflow patterns", () => {
    const rejected = [
      "on:\n  pull_request_target:\n",
      "jobs:\n  test:\n    runs-on: self-hosted\n",
      "permissions: write-all\n",
      "steps:\n  - uses: actions/checkout@v7 # v7.0.0\n",
      `steps:\n  - uses: actions/checkout@${"a".repeat(40)}\n`
    ];
    for (const workflow of rejected) {
      expect(() =>
        auditWorkflow(".github/workflows/unsafe.yml", workflow, workflow.length)
      ).toThrow();
    }
  });

  it("keeps Pages credentials out of the dependency build job", () => {
    const safe = `
jobs:
  build:
    env:
      CONTROLCURRENT_DEPLOY_TARGET: github-pages
    permissions:
      contents: read
      pages: read
  deploy:
    permissions:
      pages: write
      id-token: write
`;
    expect(() => auditPagesWorkflow(safe)).not.toThrow();

    const privilegedBuild = safe.replace("      pages: read", "      pages: write");
    expect(() => auditPagesWorkflow(privilegedBuild)).toThrow(/build job must limit Pages/u);
  });

  it("binds automatic Pages publication to the successful main push checked by CI", () => {
    const safe = `
on:
  workflow_run:
    workflows:
      - CI
    types:
      - completed
    branches:
      - main
jobs:
  build:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main')
    env:
      CONTROLCURRENT_DEPLOY_TARGET: github-pages
    permissions:
      contents: read
      pages: read
    steps:
      - uses: actions/checkout@${"a".repeat(40)} # v7.0.1
        with:
          ref: \${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}
  deploy:
    permissions:
      pages: write
      id-token: write
`;
    expect(() => auditPagesWorkflow(safe)).not.toThrow();

    for (const unsafe of [
      safe.replace("conclusion == 'success'", "conclusion == 'failure'"),
      safe.replace("workflow_run.event == 'push'", "workflow_run.event == 'pull_request'"),
      safe.replace("workflow_run.head_branch == 'main'", "workflow_run.head_branch == 'release'"),
      safe.replace("workflow_run.head_sha || github.sha", "github.sha"),
      safe.replace(
        "CONTROLCURRENT_DEPLOY_TARGET: github-pages",
        "CONTROLCURRENT_DEPLOY_TARGET: preview"
      )
    ]) {
      expect(() => auditPagesWorkflow(unsafe)).toThrow(/Pages/u);
    }
  });

  it("requires a gated browser suite and a complete dependency audit in CI", () => {
    const safe = `
jobs:
  verify:
    steps:
      - run: npm audit --audit-level=high
  browser:
    needs: verify
    steps:
      - run: npm run test:e2e:install:ci
      - run: npm run test:e2e
`;
    expect(() => auditCiWorkflow(safe)).not.toThrow();

    for (const unsafe of [
      safe.replace("npm audit --audit-level=high", "npm audit --omit=dev --audit-level=high"),
      safe.replace("    needs: verify\n", ""),
      safe.replace("npm run test:e2e:install:ci", "playwright install"),
      safe.replace("npm run test:e2e\n", "npm test\n")
    ]) {
      expect(() => auditCiWorkflow(unsafe)).toThrow(/CI|browser|dependencies/u);
    }
  });
});
