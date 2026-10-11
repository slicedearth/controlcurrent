import { describe, expect, it } from "vitest";
import { DIRECTIVE_CONTROLS } from "../src/catalogue";
import { selectedSnapshot } from "../src/data";
import type { DeploymentProfile } from "../src/contracts";
import {
  addPlan,
  MAX_PLAN_LIBRARY_BYTES,
  MAX_SAVED_PLANS,
  PLAN_LIBRARY_KEY,
  readPlanLibrary,
  removePlan,
  renamePlan,
  writePlanLibrary
} from "../src/plan-library";
import {
  MAX_PLAN_FRAGMENT,
  planFragment,
  planFromMinimums,
  readPlanFragment,
  validatePlan
} from "../src/plan-transfer";
import { comparePlans, suggestPlanUpgrade } from "../src/plan-comparison";
import { supportTimeline } from "../src/support-timeline";
import { DEPENDENCY_CIRCUITS, evaluateCircuit } from "../src/dependency-circuits";
import { evaluateControl } from "../src/evaluate";
import { feature, snapshot } from "./helpers";

const profile: DeploymentProfile = {
  schemaVersion: 1,
  name: "Test plan",
  baselines: [{ browser: "chrome", minimumVersion: "120" }]
};
const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}

describe("named local browser plans", () => {
  it("writes only after an explicit save and retains independent copies", () => {
    const local = storage();
    const empty = readPlanLibrary(local);
    expect(empty.plans).toEqual([]);
    expect(local.values.size).toBe(0);
    let library = addPlan(empty, id, profile);
    library = addPlan(library, id2, profile);
    library = renamePlan(library, id2, "Second plan");
    expect(library.plans.map((entry) => entry.profile.name)).toEqual(["Test plan", "Second plan"]);
    writePlanLibrary(local, library);
    expect(readPlanLibrary(local)).toEqual(library);
    expect(removePlan(library, id).plans.map((entry) => entry.id)).toEqual([id2]);
    expect(() => renamePlan(library, "missing", "Name")).toThrow(/Choose/u);
    expect(() => removePlan(library, "missing")).toThrow(/Choose/u);
  });
  it("rejects duplicates, excessive plans, invalid profiles and raw evidence", () => {
    const local = storage();
    const library = addPlan(readPlanLibrary(local), id, profile);
    expect(() => addPlan(library, id, profile)).toThrow(/unique/u);
    expect(() => renamePlan(library, id, " ")).toThrow();
    expect(() => writePlanLibrary(local, { ...library, rawHeaders: "private" })).toThrow();
    expect(() =>
      writePlanLibrary(local, {
        ...library,
        plans: Array.from({ length: 13 }, (_, index) => ({
          id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
          profile
        }))
      })
    ).toThrow();
    const fullLibrary = {
      schemaVersion: 1 as const,
      plans: Array.from({ length: MAX_SAVED_PLANS }, (_, index) => ({
        id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
        profile
      }))
    };
    writePlanLibrary(local, fullLibrary);
    expect(readPlanLibrary(local).plans).toHaveLength(MAX_SAVED_PLANS);
    const saved = local.getItem(PLAN_LIBRARY_KEY);
    expect(() => addPlan(fullLibrary, id2, profile)).toThrow(/Delete one/u);
    expect(local.getItem(PLAN_LIBRARY_KEY)).toBe(saved);
    local.removeItem(PLAN_LIBRARY_KEY);
    expect(local.values.size).toBe(0);
  });
  it("leaves unreadable or future data untouched and reports storage failures", () => {
    const local = storage();
    for (const contents of [
      "{",
      '{"schemaVersion":2,"plans":[]}',
      "x".repeat(MAX_PLAN_LIBRARY_BYTES + 1)
    ]) {
      local.setItem(PLAN_LIBRARY_KEY, contents);
      expect(() => readPlanLibrary(local)).toThrow();
      expect(local.getItem(PLAN_LIBRARY_KEY)).toBe(contents);
    }
    expect(() =>
      readPlanLibrary({
        ...local,
        getItem() {
          throw new Error("blocked");
        }
      })
    ).toThrow(/blocked/u);
    expect(() =>
      writePlanLibrary(
        {
          ...local,
          setItem() {
            throw new Error("quota");
          }
        },
        { schemaVersion: 1, plans: [] }
      )
    ).toThrow(/quota/u);
  });
});

describe("bounded browser-plan hand-offs", () => {
  it("round-trips only browser choices and explicit controls, with exact source versions", () => {
    const fragment = planFragment(selectedSnapshot, { ...profile, name: "日本語 & <literal>" }, [
      "content-security-policy"
    ]);
    expect(fragment.startsWith("#plan=")).toBe(true);
    expect(readPlanFragment(selectedSnapshot, fragment)).toMatchObject({
      bcdVersion: selectedSnapshot.bcdVersion,
      catalogueVersion: selectedSnapshot.catalogueVersion,
      controlIds: ["content-security-policy"],
      profile: { name: "日本語 & <literal>" }
    });
    expect(readPlanFragment(selectedSnapshot, "#response-headers")).toBeUndefined();
    expect(
      readPlanFragment(selectedSnapshot, planFragment(selectedSnapshot, profile))?.controlIds
    ).toEqual([]);
  });
  it("refuses mismatched snapshots, future versions, duplicates and unknown controls", () => {
    const fragment = planFragment(selectedSnapshot, profile);
    expect(() => readPlanFragment({ ...selectedSnapshot, bcdVersion: "other" }, fragment)).toThrow(
      /different source/u
    );
    expect(() =>
      readPlanFragment({ ...selectedSnapshot, catalogueVersion: "other" }, fragment)
    ).toThrow(/different source/u);
    expect(() => readPlanFragment(selectedSnapshot, "#plan=%invalid")).toThrow();
    expect(() =>
      readPlanFragment(selectedSnapshot, `#plan=${"x".repeat(MAX_PLAN_FRAGMENT)}`)
    ).toThrow(/limit/u);
    expect(() => planFragment(selectedSnapshot, profile, ["unknown"])).toThrow(/recognised/u);
    expect(() =>
      planFragment(selectedSnapshot, profile, [
        "content-security-policy",
        "content-security-policy"
      ])
    ).toThrow(/recognised/u);
    expect(() =>
      validatePlan(selectedSnapshot, {
        ...profile,
        baselines: [{ browser: "chrome", minimumVersion: "9999" }]
      })
    ).toThrow(/selectable/u);
    expect(() => validatePlan(selectedSnapshot, { ...profile, baselines: [] })).toThrow(
      /at least one browser/u
    );
    expect(() => validatePlan(selectedSnapshot, { ...profile, name: "" })).toThrow(/plan name/u);
    const payload = JSON.parse(decodeURIComponent(fragment.slice(6))) as Record<string, unknown>;
    expect(() =>
      readPlanFragment(
        selectedSnapshot,
        `#plan=${encodeURIComponent(JSON.stringify({ ...payload, headers: "secret" }))}`
      )
    ).toThrow();
  });
  it("never drops a browser when the reverse planner cannot find every minimum", () => {
    expect(
      planFromMinimums(selectedSnapshot, [
        { browser: "chrome", status: "found", minimumVersion: "120", blockers: [] }
      ]).baselines
    ).toEqual(profile.baselines);
    expect(() => planFromMinimums(selectedSnapshot, [])).toThrow(/Every/u);
    expect(() =>
      planFromMinimums(selectedSnapshot, [
        { browser: "chrome", status: "found", minimumVersion: "120", blockers: [] },
        { browser: "safari", status: "unsupported_mapping", blockers: ["csp-nonces"] }
      ])
    ).toThrow(/Every/u);
  });
});

describe("plan comparison and suggested increases", () => {
  it("keeps unchanged plans, scope removal and support gains distinct", () => {
    expect(comparePlans(selectedSnapshot, profile, profile).events).toEqual([]);
    const expanded = {
      ...profile,
      baselines: [...profile.baselines, { browser: "firefox" as const, minimumVersion: "115" }]
    };
    const narrowed = comparePlans(selectedSnapshot, expanded, profile);
    expect(narrowed.summary.scopeRemoved).toBe(36);
    expect(narrowed.summary.gained).toBe(0);
    const change = comparePlans(
      selectedSnapshot,
      { ...profile, baselines: [{ browser: "chrome", minimumVersion: "40" }] },
      profile
    );
    expect(change.summary.gained).toBeGreaterThan(0);
    expect(change.summary.baselineChanged).toBeGreaterThan(0);
  });
  it("raises only necessary minimums and preserves every browser", () => {
    const older = {
      ...profile,
      baselines: [
        { browser: "chrome" as const, minimumVersion: "40" },
        { browser: "firefox" as const, minimumVersion: "115" }
      ]
    };
    const result = suggestPlanUpgrade(selectedSnapshot, older, ["referrer-policy"], false);
    expect(result.profile?.baselines).toEqual([
      { browser: "chrome", minimumVersion: "56" },
      { browser: "firefox", minimumVersion: "115" }
    ]);
    expect(
      suggestPlanUpgrade(selectedSnapshot, profile, ["csp-nonces"], false).profile
    ).toBeUndefined();
    expect(
      suggestPlanUpgrade(selectedSnapshot, profile, ["cross-origin-resource-policy"], true).profile
    ).toEqual(profile);
    expect(() => suggestPlanUpgrade(selectedSnapshot, profile, [], false)).toThrow();
  });
});

describe("release traces", () => {
  const path = "http.headers.Referrer-Policy";
  it("retains removal, reintroduction and qualifications without filling source gaps", () => {
    const source = snapshot({
      [path]: feature(path, {
        chrome: [
          { version_added: "100", version_removed: "110" },
          { version_added: "130", notes: "Known limitation" }
        ]
      })
    });
    source.browsers.chrome.releases = ["100", "105", "110", "130", "140"].map((version) => ({
      version,
      status: "retired",
      releaseDate: "2026-01-01"
    }));
    expect(supportTimeline(source, "referrer-policy", "chrome")[0]?.intervals).toEqual([
      {
        first: "100",
        last: "105",
        releases: 2,
        outcome: "available_unqualified",
        qualifications: []
      },
      {
        first: "110",
        last: "110",
        releases: 1,
        outcome: "removed",
        qualifications: ["Support was removed in 110"]
      },
      {
        first: "130",
        last: "140",
        releases: 2,
        outcome: "available_with_qualification",
        qualifications: ["Known limitation"]
      }
    ]);
  });
  it("keeps missing mappings, missing data and incomparable history explicit", () => {
    const source = snapshot({});
    expect(supportTimeline(source, "csp-nonces", "chrome")).toEqual([]);
    expect(supportTimeline(source, "referrer-policy", "chrome")[0]?.intervals[0]?.outcome).toBe(
      "source_inconsistent"
    );
    source.browsers.chrome.releases = [
      { version: "preview", status: "current", releaseDate: "2026-01-01" }
    ];
    expect(supportTimeline(source, "referrer-policy", "chrome")[0]?.intervals).toEqual([]);
    expect(() => supportTimeline(source, "unknown", "chrome")).toThrow(/Unknown/u);
    const unknown = snapshot({ [path]: feature(path, { chrome: [{ version_added: null }] }) });
    expect(supportTimeline(unknown, "referrer-policy", "chrome")[0]?.intervals[0]?.outcome).toBe(
      "unknown"
    );
  });
});

describe("specific directives and deployment circuits", () => {
  it("selects exact child statements without borrowing parent-header support", () => {
    expect(DIRECTIVE_CONTROLS).toHaveLength(6);
    for (const control of DIRECTIVE_CONTROLS) {
      const path = control.bcdPaths[0];
      expect(path).toBeDefined();
      if (!path) throw new Error("Missing directive source");
      expect(selectedSnapshot.features[path]).toBeDefined();
      const source = structuredClone(selectedSnapshot);
      const child = source.features[path];
      if (!child) throw new Error("Missing child");
      child.support.chrome = [{ version_added: false }];
      expect(
        evaluateControl(control, source, { browser: "chrome", minimumVersion: "120" }).outcome
      ).toBe("unavailable");
    }
  });
  it("evaluates alternatives separately and preserves source gaps", () => {
    const baseline = { browser: "chrome" as const, minimumVersion: "120" };
    for (const goal of DEPENDENCY_CIRCUITS)
      expect(evaluateCircuit(selectedSnapshot, goal.id, baseline).nodes.length).toBeGreaterThan(1);
    expect(
      evaluateCircuit(selectedSnapshot, "isolation", baseline, "alternative").nodes[1]?.control.id
    ).toBe("coep-credentialless");
    expect(
      evaluateCircuit(selectedSnapshot, "script-loading", baseline, "alternative").nodes[1]
        ?.evaluation.outcome
    ).toBe("unsupported_mapping");
    expect(() => evaluateCircuit(selectedSnapshot, "missing", baseline)).toThrow(/Unknown/u);
  });
});
