import { describe, expect, it } from "vitest";
import {
  inspectEvidenceBundle,
  inspectFetchMetadata,
  inspectHtmlResources,
  inspectWebauthnConfiguration
} from "../src/evidence-bundle";

function finding(report: ReturnType<typeof inspectEvidenceBundle>, controlId: string) {
  const result = report.findings.find((candidate) => candidate.controlId === controlId);
  if (!result) throw new Error(`Missing finding for ${controlId}.`);
  return result;
}

describe("bounded evidence bundles", () => {
  it("parses HTML without execution or retaining resource locations", () => {
    const executionProbe = globalThis as typeof globalThis & {
      controlCurrentExecuted?: boolean;
    };
    executionProbe.controlCurrentExecuted = false;
    const report = inspectHtmlResources({
      schemaVersion: 1,
      name: "Document shell",
      html: `<!doctype html>
<script>globalThis.controlCurrentExecuted = true</script>
<script src="/assets/app.js" integrity="sha384-YWJj"></script>
<link rel="stylesheet" href="https://cdn.example.invalid/app.css" integrity="sha512-ZGVm">
<img src="https://private.example.invalid/person.png">`
    });

    expect(report.finding.state).toBe("observed");
    expect(report.eligibleResourceCount).toBe(2);
    expect(report.protectedResourceCount).toBe(2);
    expect(report.relativeReferenceCount).toBe(1);
    expect(report.absoluteReferenceCount).toBe(1);
    expect(report.algorithms).toEqual(["sha384", "sha512"]);
    expect(executionProbe.controlCurrentExecuted).toBe(false);
    expect(JSON.stringify(report)).not.toContain("app.js");
    expect(JSON.stringify(report)).not.toContain("cdn.example");
    expect(JSON.stringify(report)).not.toContain("person.png");
  });

  it("keeps missing and invalid integrity evidence explicit", () => {
    const partial = inspectHtmlResources({
      schemaVersion: 1,
      name: "Partial SRI",
      html: `<script src="/one.js" integrity="sha256-YWJj"></script>
<script src="/two.js"></script>`
    });
    const invalid = inspectHtmlResources({
      schemaVersion: 1,
      name: "Invalid SRI",
      html: '<link rel="stylesheet" href="/app.css" integrity="md5-YWJj">'
    });

    expect(partial.finding.state).toBe("inconclusive");
    expect(partial.unprotectedResourceCount).toBe(1);
    expect(invalid.finding.state).toBe("invalid");
    expect(invalid.invalidIntegrityCount).toBe(1);
  });

  it("reduces Fetch Metadata requests without retaining unrelated headers", () => {
    const report = inspectFetchMetadata({
      schemaVersion: 1,
      name: "Top-level navigation",
      headers: {
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-User": "?1",
        Referer: "https://private.example.invalid/account"
      }
    });

    expect(report.finding.state).toBe("observed");
    expect(report.recognisedHeaderCount).toBe(4);
    expect(JSON.stringify(report)).not.toContain("private.example");
    expect(() =>
      inspectFetchMetadata({
        schemaVersion: 1,
        name: "Credentialled request",
        headers: { Cookie: "session=secret" }
      })
    ).toThrow(/Sensitive request header/u);
  });

  it("accepts only reduced WebAuthn configuration", () => {
    const report = inspectWebauthnConfiguration({
      schemaVersion: 1,
      name: "Passkey registration",
      operation: "create",
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required",
      attestation: "none",
      mediation: "unspecified",
      prfRequested: true
    });

    expect(
      report.findings.find((item) => item.controlId === "webauthn-platform-authenticator")?.state
    ).toBe("observed");
    expect(report.findings.find((item) => item.controlId === "webauthn-prf")?.state).toBe(
      "observed"
    );
    expect(() =>
      inspectWebauthnConfiguration({
        schemaVersion: 1,
        name: "Unsafe raw options",
        operation: "create",
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "required",
        attestation: "none",
        mediation: "unspecified",
        challenge: "secret",
        user: { id: "personal-identifier" }
      })
    ).toThrow();
  });

  it("combines response, HTML, request, and WebAuthn evidence conservatively", () => {
    const report = inspectEvidenceBundle({
      schemaVersion: 1,
      name: "Release candidate",
      responses: [
        {
          schemaVersion: 1,
          name: "Document response",
          headers: {
            "Content-Security-Policy":
              "default-src 'self'; script-src 'nonce-YWJj'; base-uri 'none'",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "credentialless",
            "Set-Cookie": "__Host-session=secret; Path=/; Secure; HttpOnly; SameSite=Lax"
          }
        }
      ],
      htmlDocuments: [
        {
          schemaVersion: 1,
          name: "Document HTML",
          html: '<script src="/app.js" integrity="sha384-YWJj"></script>'
        }
      ],
      requests: [
        {
          schemaVersion: 1,
          name: "Navigation request",
          headers: {
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document"
          }
        }
      ],
      webauthn: [
        {
          schemaVersion: 1,
          name: "Passkey retrieval",
          operation: "get",
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "unspecified",
          attestation: "unspecified",
          mediation: "conditional",
          prfRequested: true
        }
      ]
    });

    expect(report.coverage).toEqual({
      responses: 1,
      htmlDocuments: 1,
      requests: 1,
      webauthn: 1
    });
    expect(finding(report, "csp-nonces").state).toBe("observed");
    expect(finding(report, "subresource-integrity").state).toBe("observed");
    expect(finding(report, "fetch-metadata").state).toBe("observed");
    expect(finding(report, "webauthn-conditional-mediation").state).toBe("observed");
    expect(report.composites.find((item) => item.id === "strict-csp-candidate")?.state).toBe(
      "satisfied"
    );
    expect(
      report.composites.find((item) => item.id === "cross-origin-isolation-candidate")?.state
    ).toBe("satisfied");
    expect(report.composites.find((item) => item.id === "cookie-attribute-coverage")?.state).toBe(
      "satisfied"
    );
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain("__Host-session");
    expect(serialised).not.toContain("secret");
    expect(serialised).not.toContain("/app.js");
    expect(serialised).not.toContain("nonce-YWJj");
  });

  it("surfaces route variation instead of choosing the favourable response", () => {
    const report = inspectEvidenceBundle({
      schemaVersion: 1,
      name: "Route comparison",
      responses: [
        {
          schemaVersion: 1,
          name: "Protected route",
          headers: { "Content-Security-Policy": "default-src 'self'" }
        },
        {
          schemaVersion: 1,
          name: "Unprotected route",
          headers: { "X-Content-Type-Options": "nosniff" }
        }
      ]
    });

    expect(finding(report, "content-security-policy").state).toBe("inconclusive");
    expect(finding(report, "x-content-type-options").state).toBe("inconclusive");
  });
});
