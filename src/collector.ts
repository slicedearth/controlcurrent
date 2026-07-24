import { z } from "zod";
import {
  type EvidenceBundleInput,
  evidenceBundleInputSchema,
  evidenceCompositeIdSchema
} from "./contracts";

export const COLLECTOR_VERSION = "1.0.0";
export const MAX_COLLECTOR_MANIFEST_BYTES = 64 * 1_024;
export const MAX_COLLECTOR_BODY_BYTES = 128 * 1_024;
export const MAX_COLLECTOR_REDIRECTS = 5;
export const COLLECTOR_TIMEOUT_MS = 10_000;

const opaqueIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/u);
const pathSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => {
    if (!value.startsWith("/") || value.startsWith("//")) return false;
    const parsed = new URL(value, "https://collector.invalid");
    return (
      parsed.origin === "https://collector.invalid" && parsed.hash === "" && parsed.search === ""
    );
  }, "Collector paths must be absolute same-origin paths without query strings or fragments.");

const collectorSurfaceSchema = z
  .object({
    id: opaqueIdSchema,
    path: pathSchema,
    role: z.enum(["document", "api", "authentication", "logout", "embedded", "other"]),
    authentication: z.enum(["anonymous", "unknown"]).default("anonymous"),
    requiredEvidence: z
      .array(z.enum(["response", "html"]))
      .min(1)
      .max(2),
    requiredControls: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/u))
      .max(64)
      .default([]),
    requiredComposites: z.array(evidenceCompositeIdSchema).max(3).default([])
  })
  .strict()
  .superRefine((surface, context) => {
    if (new Set(surface.requiredEvidence).size !== surface.requiredEvidence.length) {
      context.addIssue({
        code: "custom",
        message: "Collector required evidence kinds must be unique.",
        path: ["requiredEvidence"]
      });
    }
    if (new Set(surface.requiredControls).size !== surface.requiredControls.length) {
      context.addIssue({
        code: "custom",
        message: "Collector required controls must be unique.",
        path: ["requiredControls"]
      });
    }
    if (new Set(surface.requiredComposites).size !== surface.requiredComposites.length) {
      context.addIssue({
        code: "custom",
        message: "Collector required composites must be unique.",
        path: ["requiredComposites"]
      });
    }
  });

export const collectorManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(80),
    baseOrigin: z
      .url()
      .max(512)
      .refine((value) => {
        const url = new URL(value);
        return (
          ["https:", "http:"].includes(url.protocol) &&
          url.username === "" &&
          url.password === "" &&
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === ""
        );
      }, "The collector base origin must contain only a scheme, host, and optional port."),
    applicationId: opaqueIdSchema,
    environment: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}$/u),
    revision: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u),
    buildId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u)
      .optional(),
    producerId: opaqueIdSchema,
    completeness: z.enum(["complete", "unknown"]),
    surfaces: z.array(collectorSurfaceSchema).min(1).max(32)
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = manifest.surfaces.map((surface) => surface.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Collector surface IDs must be unique.",
        path: ["surfaces"]
      });
    }
    const paths = manifest.surfaces.map((surface) => surface.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        message: "Collector surface paths must be unique.",
        path: ["surfaces"]
      });
    }
  });
export type CollectorManifest = z.infer<typeof collectorManifestSchema>;

export type CollectorHop = {
  status?: number;
  outcome: "final" | "redirect" | "http_error" | "transport_error";
  headers: Record<string, string | string[]>;
  contentType:
    "html" | "json" | "javascript" | "css" | "font" | "image" | "text" | "other" | "unknown";
  cache: "hit" | "miss" | "revalidated" | "bypass" | "unknown";
  body?: string;
  redirectTarget?: "same_origin" | "cross_origin" | "unknown";
  errorKind?: "timeout" | "dns" | "tls" | "connection" | "other";
};

export type CollectorTransport = {
  collect(input: {
    baseOrigin: string;
    path: string;
    maximumBodyBytes: number;
    maximumRedirects: number;
    timeoutMs: number;
  }): Promise<readonly CollectorHop[]>;
};

export async function collectEvidenceBundle(
  manifestInput: unknown,
  transport: CollectorTransport,
  clock: () => Date = () => new Date()
): Promise<EvidenceBundleInput> {
  const manifest = collectorManifestSchema.parse(manifestInput);
  const startedAt = clock().toISOString();
  const responses: EvidenceBundleInput["responses"] = [];
  const htmlDocuments: EvidenceBundleInput["htmlDocuments"] = [];

  for (const surface of manifest.surfaces) {
    const hops = await transport.collect({
      baseOrigin: manifest.baseOrigin,
      path: surface.path,
      maximumBodyBytes: MAX_COLLECTOR_BODY_BYTES,
      maximumRedirects: MAX_COLLECTOR_REDIRECTS,
      timeoutMs: COLLECTOR_TIMEOUT_MS
    });
    if (hops.length === 0 || hops.length > MAX_COLLECTOR_REDIRECTS + 1) {
      throw new Error(`Collector returned an invalid hop count for ${surface.id}.`);
    }
    const redirectChainId = hops.some((hop) => hop.outcome === "redirect")
      ? `${surface.id}-redirect`
      : undefined;
    for (const [sequence, hop] of hops.entries()) {
      responses.push({
        schemaVersion: 2,
        name: `${surface.id} response ${String(sequence + 1)}`,
        surfaceId: surface.id,
        context: {
          schemaVersion: 1,
          variantId: `${surface.id}-${surface.authentication}`,
          sequence,
          outcome: hop.outcome,
          status: hop.status,
          contentType: hop.contentType,
          authentication: surface.authentication,
          cache: hop.cache,
          redirectChainId: hop.outcome === "redirect" ? redirectChainId : undefined,
          redirectTarget: hop.outcome === "redirect" ? hop.redirectTarget : undefined,
          errorKind: hop.errorKind
        },
        headers: hop.headers
      });
      if (
        hop.outcome === "final" &&
        hop.contentType === "html" &&
        hop.body !== undefined &&
        surface.requiredEvidence.includes("html")
      ) {
        htmlDocuments.push({
          schemaVersion: 1,
          name: `${surface.id} document`,
          surfaceId: surface.id,
          html: hop.body
        });
      }
    }
  }

  const completedAt = clock().toISOString();
  return evidenceBundleInputSchema.parse({
    schemaVersion: 4,
    name: manifest.name,
    identity: {
      subject: {
        applicationId: manifest.applicationId,
        environment: manifest.environment,
        revision: manifest.revision,
        buildId: manifest.buildId
      },
      capture: {
        startedAt,
        completedAt,
        producer: {
          kind: "manual",
          id: manifest.producerId,
          version: COLLECTOR_VERSION
        }
      }
    },
    scopeInventory: {
      schemaVersion: 1,
      name: `${manifest.name} collector scope`,
      kind: "authorised_crawl",
      generatedAt: startedAt,
      completeness: manifest.completeness,
      entries: manifest.surfaces.map((surface) => ({
        id: surface.id,
        disposition: "included"
      }))
    },
    surfaces: manifest.surfaces.map((surface) => ({
      id: surface.id,
      role: surface.role,
      requiredEvidence: surface.requiredEvidence,
      requiredControls: surface.requiredControls,
      requiredComposites: surface.requiredComposites
    })),
    responses,
    htmlDocuments,
    resourceBytes: [],
    requests: [],
    webauthn: []
  });
}
