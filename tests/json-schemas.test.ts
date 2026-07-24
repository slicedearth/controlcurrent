import { describe, expect, it } from "vitest";
import {
  generatePublicJsonSchema,
  PUBLIC_JSON_SCHEMAS,
  publicJsonSchemaManifest
} from "../src/json-schemas";

describe("public JSON Schemas", () => {
  it("publishes one deterministic draft 2020-12 schema for every selected contract", () => {
    expect(PUBLIC_JSON_SCHEMAS).toHaveLength(6);
    for (const definition of PUBLIC_JSON_SCHEMAS) {
      const schema = generatePublicJsonSchema(definition);
      expect(schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: `https://slicedearth.github.io/controlcurrent/schemas/${definition.file}`,
        title: definition.title,
        type: "object",
        additionalProperties: false
      });
      expect(generatePublicJsonSchema(definition)).toEqual(schema);
      expect(schema.$comment).toContain("necessary but not sufficient");
    }
  });

  it("uses relative bounded paths in the public manifest", () => {
    const manifest = publicJsonSchemaManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.schemas).toHaveLength(PUBLIC_JSON_SCHEMAS.length);
    for (const entry of manifest.schemas) {
      expect(entry.path).toMatch(/^[a-z0-9-]+\.schema\.json$/u);
      expect(entry.path).not.toContain("/");
    }
  });
});
