import { describe, expect, it } from "vitest";
import {
  type CollectorManifest,
  type CollectorTransport,
  collectEvidenceBundle,
  collectorManifestSchema
} from "../src/collector";
import { inspectEvidenceBundle } from "../src/evidence-bundle";
import {
  FixedOriginCollectorTransport,
  isPublicCollectorAddress,
  sanitiseCollectorHeaders
} from "../tools/collector-network";
import { evidenceSourceContext } from "./helpers";

const manifest: CollectorManifest = {
  schemaVersion: 1,
  name: "Authorised staging capture",
  baseOrigin: "https://application.example",
  applicationId: "example-app",
  environment: "staging",
  revision: "0123456789abcdef",
  buildId: "build-42",
  producerId: "local-operator",
  completeness: "complete",
  surfaces: [
    {
      id: "sign-in",
      path: "/sign-in",
      role: "authentication",
      authentication: "anonymous",
      requiredEvidence: ["response", "html"],
      requiredControls: ["content-security-policy"],
      requiredComposites: []
    }
  ]
};
const primarySurface = manifest.surfaces[0];
if (!primarySurface) throw new Error("Collector fixture requires one surface.");

describe("authorised evidence collector", () => {
  it("generates a bounded scope inventory and contextual evidence bundle", async () => {
    const transport: CollectorTransport = {
      collect: () =>
        Promise.resolve([
          {
            status: 302,
            outcome: "redirect",
            headers: { location: "REDACTED" },
            contentType: "html",
            cache: "bypass",
            redirectTarget: "same_origin"
          },
          {
            status: 200,
            outcome: "final",
            headers: { "content-security-policy": "default-src 'self'" },
            contentType: "html",
            cache: "miss",
            body: "<main>Bounded fixture</main>"
          }
        ])
    };
    const times = [new Date("2026-07-24T00:00:00.000Z"), new Date("2026-07-24T00:00:01.000Z")];
    const bundle = await collectEvidenceBundle(manifest, transport, () => {
      const time = times.shift();
      if (!time) throw new Error("Collector fixture clock was exhausted.");
      return time;
    });

    expect(bundle.identity).toMatchObject({
      subject: {
        applicationId: "example-app",
        environment: "staging",
        revision: "0123456789abcdef",
        buildId: "build-42"
      },
      capture: {
        startedAt: "2026-07-24T00:00:00.000Z",
        completedAt: "2026-07-24T00:00:01.000Z",
        producer: {
          kind: "manual",
          id: "local-operator",
          version: "1.0.0"
        }
      }
    });
    expect(bundle.scopeInventory).toMatchObject({
      kind: "authorised_crawl",
      completeness: "complete",
      entries: [{ id: "sign-in", disposition: "included" }]
    });
    expect(bundle.responses).toHaveLength(2);
    expect(bundle.responses[0]).toMatchObject({
      schemaVersion: 2,
      context: {
        variantId: "sign-in-anonymous",
        sequence: 0,
        outcome: "redirect",
        redirectChainId: "sign-in-redirect"
      }
    });
    expect(bundle.htmlDocuments).toEqual([
      {
        schemaVersion: 1,
        name: "sign-in document",
        surfaceId: "sign-in",
        html: "<main>Bounded fixture</main>"
      }
    ]);
    expect(JSON.stringify(bundle)).not.toContain("application.example");
    expect(JSON.stringify(bundle)).not.toContain("/sign-in");
  });

  it("keeps a transport failure distinct from complete response coverage", async () => {
    const transport: CollectorTransport = {
      collect: () =>
        Promise.resolve([
          {
            outcome: "transport_error",
            headers: {},
            contentType: "unknown",
            cache: "unknown",
            errorKind: "timeout"
          }
        ])
    };
    const bundle = await collectEvidenceBundle(
      {
        ...manifest,
        surfaces: [{ ...primarySurface, requiredEvidence: ["response"] }]
      },
      transport,
      () => new Date("2026-07-24T00:00:00.000Z")
    );
    const report = await inspectEvidenceBundle(bundle, evidenceSourceContext);

    expect(report.coverage.errorResponses).toBe(1);
    expect(report.surfaceCoverage[0]).toMatchObject({
      state: "gap",
      observedEvidence: [],
      missingEvidence: ["response"]
    });
  });

  it("rejects ambiguous paths, duplicate surfaces, and unsupported collection scope", () => {
    expect(() =>
      collectorManifestSchema.parse({
        ...manifest,
        surfaces: [{ ...primarySurface, path: "/sign-in?token=private" }]
      })
    ).toThrow();
    expect(() =>
      collectorManifestSchema.parse({
        ...manifest,
        surfaces: [primarySurface, primarySurface]
      })
    ).toThrow();
    expect(() =>
      collectorManifestSchema.parse({
        ...manifest,
        surfaces: [{ ...primarySurface, requiredEvidence: ["request"] }]
      })
    ).toThrow();
  });

  it("rejects private, loopback, link-local, documentation, and mapped addresses", () => {
    expect(isPublicCollectorAddress("8.8.8.8")).toBe(true);
    expect(isPublicCollectorAddress("2606:4700:4700::1111")).toBe(true);
    for (const address of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "192.168.1.1",
      "192.0.2.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:127.0.0.1"
    ]) {
      expect(isPublicCollectorAddress(address), address).toBe(false);
    }
  });

  it("redacts cookie values and redirect locations and drops credential headers", () => {
    expect(
      sanitiseCollectorHeaders({
        authorization: "Bearer secret",
        cookie: "session=secret",
        location: "https://private.example/account?token=secret",
        "set-cookie": [
          "__Host-session=secret; Path=/; Secure; HttpOnly; SameSite=Lax",
          "preference=private; Path=/"
        ]
      })
    ).toEqual({
      location: "REDACTED",
      "set-cookie": [
        "__Host-redacted=REDACTED; Path=/; Secure; HttpOnly; SameSite=Lax",
        "redacted=REDACTED; Path=/"
      ]
    });
  });

  it("requires HTTPS before a public network request can begin", async () => {
    const transport = new FixedOriginCollectorTransport();
    await expect(
      transport.collect({
        baseOrigin: "http://8.8.8.8",
        path: "/",
        maximumBodyBytes: 1024,
        maximumRedirects: 1,
        timeoutMs: 100
      })
    ).rejects.toThrow(/requires HTTPS/u);
  });
});
