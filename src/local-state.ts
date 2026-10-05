import type { BoundedStorage } from "./profile-storage";

export class LocalStorageError extends Error {
  constructor(
    readonly state: "unavailable" | "quota" | "deletion_failed",
    action: string
  ) {
    super(
      `Local storage ${state === "quota" ? "is full" : state === "deletion_failed" ? "could not delete saved data" : "is unavailable"}; ${action}. You can continue in this session and export files.`
    );
  }
}

/** Delay access to the property itself: browser policy can make its getter throw. */
export function guardedStorage(access: () => BoundedStorage): BoundedStorage {
  return {
    getItem(key) {
      try {
        return access().getItem(key);
      } catch {
        throw new LocalStorageError("unavailable", "saved data was not read");
      }
    },
    setItem(key, value) {
      try {
        access().setItem(key, value);
      } catch (error) {
        throw new LocalStorageError(
          error instanceof Error && error.name === "QuotaExceededError" ? "quota" : "unavailable",
          "data was not saved"
        );
      }
    },
    removeItem(key) {
      try {
        access().removeItem(key);
      } catch {
        throw new LocalStorageError("deletion_failed", "saved data may remain on this device");
      }
    }
  };
}

/** One current generation makes cancelled asynchronous successes and errors inert. */
export class OperationGeneration {
  private generation = 0;
  begin(): number {
    return ++this.generation;
  }
  cancel(): void {
    this.generation += 1;
  }
  current(token: number): boolean {
    return token === this.generation;
  }
}
