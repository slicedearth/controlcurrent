import selectedInput from "../data/selected-bcd.json";
import changesInput from "../data/change-events.json";
import { z } from "zod";
import { BROWSER_IDS } from "./browsers";
import {
  changeEventSchema,
  selectedSnapshotSchema,
  type BrowserId,
  type DeploymentProfile
} from "./contracts";
import { evaluateProfile } from "./evaluate";

export const selectedSnapshot = selectedSnapshotSchema.parse(selectedInput);
export const changeEvents = z.array(changeEventSchema).parse(changesInput);

export function currentBrowserProfile(): DeploymentProfile {
  const ids: readonly BrowserId[] = BROWSER_IDS;
  return {
    schemaVersion: 1,
    name: "Current BCD release channels",
    baselines: ids.map((browser) => {
      const releases = selectedSnapshot.browsers[browser].releases.filter(
        (release) => release.status === "current"
      );
      const current = releases.at(-1);
      if (!current) {
        throw new Error(`BCD has no current release for ${browser}.`);
      }
      return { browser, minimumVersion: current.version };
    })
  };
}

export const currentProfile = currentBrowserProfile();
export const currentEvaluation = evaluateProfile(selectedSnapshot, currentProfile);
