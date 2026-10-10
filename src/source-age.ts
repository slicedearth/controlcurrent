/** The package timestamp is source metadata, not a claim of review freshness. */
export function sourceAge(timestamp: string, now = Date.now()): string {
  const published = Date.parse(timestamp);
  if (!Number.isFinite(published) || !Number.isFinite(now)) return "Package age unavailable.";
  if (published > now) return "Package timestamp is ahead of this device's clock; age unavailable.";
  const days = Math.floor((now - published) / 86_400_000);
  return `Package age on this device: ${String(days)} ${days === 1 ? "day" : "days"}.`;
}
