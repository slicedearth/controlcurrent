import { z, type ZodType } from "zod";
import {
  decisionPacketSchema,
  evidenceBundleReportSchema,
  evidencePolicyEvaluationSchema,
  evidencePolicyProfileSchema,
  policyEvaluationSchema,
  policyProfileSchema
} from "./contracts";

export const PUBLIC_JSON_SCHEMA_VERSION = 1;

export const PUBLIC_JSON_SCHEMAS = [
  {
    id: "browser-policy-profile",
    title: "ControlCurrent browser policy profile",
    file: "browser-policy-profile.schema.json",
    contractVersion: 1,
    schema: policyProfileSchema
  },
  {
    id: "browser-policy-evaluation",
    title: "ControlCurrent browser policy evaluation",
    file: "browser-policy-evaluation.schema.json",
    contractVersion: 1,
    schema: policyEvaluationSchema
  },
  {
    id: "evidence-policy-profile",
    title: "ControlCurrent evidence policy profile",
    file: "evidence-policy-profile.schema.json",
    contractVersion: 4,
    schema: evidencePolicyProfileSchema
  },
  {
    id: "reduced-evidence-report",
    title: "ControlCurrent reduced evidence report",
    file: "reduced-evidence-report.schema.json",
    contractVersion: 7,
    schema: evidenceBundleReportSchema
  },
  {
    id: "evidence-policy-evaluation",
    title: "ControlCurrent evidence policy evaluation",
    file: "evidence-policy-evaluation.schema.json",
    contractVersion: 4,
    schema: evidencePolicyEvaluationSchema
  },
  {
    id: "decision-packet",
    title: "ControlCurrent two-part decision packet",
    file: "decision-packet.schema.json",
    contractVersion: 1,
    schema: decisionPacketSchema
  }
] as const satisfies readonly {
  id: string;
  title: string;
  file: string;
  contractVersion: number;
  schema: ZodType;
}[];

export function generatePublicJsonSchema(definition: (typeof PUBLIC_JSON_SCHEMAS)[number]) {
  return {
    ...z.toJSONSchema(definition.schema, {
      target: "draft-2020-12",
      unrepresentable: "throw"
    }),
    $id: `https://slicedearth.github.io/controlcurrent/schemas/${definition.file}`,
    title: definition.title,
    $comment:
      "The runtime validator also enforces bounded cross-field invariants that JSON Schema cannot fully express. Passing this schema is necessary but not sufficient for acceptance by ControlCurrent."
  };
}

export function publicJsonSchemaManifest() {
  return {
    schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
    dialect: "https://json-schema.org/draft/2020-12/schema",
    schemas: PUBLIC_JSON_SCHEMAS.map(({ contractVersion, file, id, title }) => ({
      id,
      title,
      contractVersion,
      path: file
    }))
  };
}
