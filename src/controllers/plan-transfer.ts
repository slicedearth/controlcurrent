import { selectedSnapshot } from "../data";
import { readPlanFragment } from "../plan-transfer";

export function consumePlanTransfer() {
  const fragment = window.location.hash;
  try {
    return readPlanFragment(selectedSnapshot, fragment);
  } finally {
    if (fragment.startsWith("#plan=")) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }
}
