import { z } from "zod";
import { deploymentProfileSchema, type DeploymentProfile } from "./contracts";
import type { BoundedStorage } from "./profile-storage";
import { canonicalJson } from "./canonical";

export const PLAN_LIBRARY_KEY = "controlcurrent.plans.v1";
export const MAX_SAVED_PLANS = 12;
export const MAX_PLAN_LIBRARY_BYTES = 64 * 1_024;
const entrySchema = z.object({ id: z.uuid(), profile: deploymentProfileSchema }).strict();
export const planLibrarySchema = z
  .object({ schemaVersion: z.literal(1), plans: z.array(entrySchema).max(MAX_SAVED_PLANS) })
  .strict()
  .refine(
    (library) => new Set(library.plans.map((entry) => entry.id)).size === library.plans.length,
    "Saved plan identifiers must be unique."
  );
export type PlanLibrary = z.infer<typeof planLibrarySchema>;

export function readPlanLibrary(storage: BoundedStorage): PlanLibrary {
  const contents = storage.getItem(PLAN_LIBRARY_KEY);
  if (contents === null) return { schemaVersion: 1, plans: [] };
  if (new TextEncoder().encode(contents).byteLength > MAX_PLAN_LIBRARY_BYTES)
    throw new Error("The saved plan library exceeds its byte limit and was left untouched.");
  const result = planLibrarySchema.safeParse(JSON.parse(contents) as unknown);
  if (!result.success)
    throw new Error(
      "The saved plan library is invalid or from a newer version and was left untouched."
    );
  return result.data;
}

export function writePlanLibrary(storage: BoundedStorage, input: unknown): void {
  const library = planLibrarySchema.parse(input);
  const contents = canonicalJson(library, 0);
  if (new TextEncoder().encode(contents).byteLength > MAX_PLAN_LIBRARY_BYTES)
    throw new Error("The saved plan library exceeds its byte limit.");
  storage.setItem(PLAN_LIBRARY_KEY, contents);
}

export function addPlan(library: PlanLibrary, id: string, profile: DeploymentProfile): PlanLibrary {
  if (library.plans.length >= MAX_SAVED_PLANS)
    throw new Error("You can save up to 12 named plans. Delete one before adding another.");
  return planLibrarySchema.parse({ ...library, plans: [...library.plans, { id, profile }] });
}

export function renamePlan(library: PlanLibrary, id: string, name: string): PlanLibrary {
  if (!library.plans.some((entry) => entry.id === id)) throw new Error("Choose a saved plan.");
  return planLibrarySchema.parse({
    ...library,
    plans: library.plans.map((entry) =>
      entry.id === id ? { ...entry, profile: { ...entry.profile, name } } : entry
    )
  });
}

export function removePlan(library: PlanLibrary, id: string): PlanLibrary {
  if (!library.plans.some((entry) => entry.id === id)) throw new Error("Choose a saved plan.");
  return planLibrarySchema.parse({
    ...library,
    plans: library.plans.filter((entry) => entry.id !== id)
  });
}
