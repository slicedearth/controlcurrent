import { describe, expect, it } from "vitest";
import { MAX_HEADER_BLOCK_BYTES, inspectHeaders, parseHeaderBlock } from "../src/assurance";

function finding(report: ReturnType<typeof inspectHeaders>, controlId: string) {
  const result = report.findings.find((candidate) => candidate.controlId === controlId);
  if (!result) throw new Error(`Missing finding for ${controlId}.`);
  return result;
}

describe("offline response-header assurance", () => {
  it("parses recognised controls without retaining cookie names or values", () => {
    const report = inspectHeaders(
      parseHeaderBlock(`HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; script-src 'nonce-REDACTED' 'strict-dynamic'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; require-trusted-types-for 'script'; upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Permissions-Policy: camera=(), microphone=()
Referrer-Policy: no-referrer
Set-Cookie: __Host-session=very-secret-value; Path=/; Secure; HttpOnly; SameSite=Lax
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff`)
    );

    expect(report.findings).toHaveLength(29);
    expect(report.recognisedHeaderCount).toBe(10);
    expect(finding(report, "content-security-policy").state).toBe("observed");
    expect(finding(report, "csp-nonces").state).toBe("observed");
    expect(finding(report, "csp-hashes").state).toBe("missing");
    expect(finding(report, "strict-dynamic").state).toBe("observed");
    expect(finding(report, "trusted-types").state).toBe("observed");
    expect(finding(report, "strict-transport-security").evidence).toContain("max-age 31536000");
    expect(finding(report, "secure-cookie-prefixes").state).toBe("observed");
    expect(finding(report, "partitioned-cookies").state).toBe("not_evaluated");
    expect(finding(report, "subresource-integrity").state).toBe("not_evaluated");
    expect(JSON.stringify(report)).not.toContain("__Host-session");
    expect(JSON.stringify(report)).not.toContain("very-secret-value");
    expect(JSON.stringify(report)).not.toContain("REDACTED");
  });

  it("evaluates only the final response in a redirect-style header block", () => {
    const snapshot = parseHeaderBlock(`HTTP/1.1 301 Moved Permanently
Content-Security-Policy: default-src 'none'

HTTP/2 200
X-Content-Type-Options: nosniff`);
    const report = inspectHeaders(snapshot);

    expect(finding(report, "content-security-policy").state).toBe("missing");
    expect(finding(report, "x-content-type-options").state).toBe("observed");
    expect(report.inputHeaderCount).toBe(1);
  });

  it("keeps malformed and duplicate policy evidence explicit", () => {
    const duplicateCsp = inspectHeaders(
      parseHeaderBlock("Content-Security-Policy: default-src 'self'; default-src 'none'")
    );
    expect(finding(duplicateCsp, "content-security-policy").state).toBe("invalid");

    const duplicateSingleton = inspectHeaders({
      schemaVersion: 1,
      name: "Duplicate singleton",
      headers: {
        "X-Content-Type-Options": ["nosniff", "nosniff"]
      }
    });
    expect(finding(duplicateSingleton, "x-content-type-options").state).toBe("invalid");
  });

  it("validates cookie-prefix requirements without exposing cookie identity", () => {
    const report = inspectHeaders(
      parseHeaderBlock("Set-Cookie: __Host-private=secret; Domain=example.test; Path=/")
    );
    const result = finding(report, "secure-cookie-prefixes");

    expect(result.state).toBe("invalid");
    expect(result.evidence).toBe("1 prefixed cookies; 1 invalid");
    expect(JSON.stringify(result)).not.toContain("__Host-private");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("refuses credentials, folded lines, and oversized input", () => {
    expect(() => parseHeaderBlock("Authorization: Bearer secret")).toThrow(
      /Sensitive request header/u
    );
    expect(() => parseHeaderBlock("X-Test: one\n two")).toThrow(/folded header/u);
    expect(() => parseHeaderBlock("x".repeat(MAX_HEADER_BLOCK_BYTES + 1))).toThrow(/exceeds/u);
  });

  it("normalises mixed-case JSON header names and ignores unknown fields safely", () => {
    const report = inspectHeaders({
      schemaVersion: 1,
      name: "Mixed case",
      headers: {
        "Referrer-Policy": "strict-origin",
        Server: "example"
      }
    });

    expect(report.inputHeaderCount).toBe(2);
    expect(report.recognisedHeaderCount).toBe(1);
    expect(finding(report, "referrer-policy").state).toBe("observed");
    expect(JSON.stringify(report)).not.toContain("example");
  });
});
