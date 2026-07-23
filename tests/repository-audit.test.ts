import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_JSON_FILE_BYTES,
  MAX_PUBLIC_JSON_TOTAL_BYTES,
  auditPublicJson,
  auditPublicJsonTotal,
  auditRepositoryPaths
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
      "controlcurrent-profile.json",
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
});
