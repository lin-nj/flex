// Fixed datasets only. Cache snapshots with their original observation time in
// memory; never persist authenticated request headers in the Next.js disk cache.
type Dataset = "TrainServiceAlerts" | "PCDForecast?TrainLine=NEL" | "PCDForecast?TrainLine=CCL";
interface Snapshot { data: unknown; fetchedAt: string }
const cache = new Map<Dataset, { until: number; pending: Promise<Snapshot> }>();

export async function fetchLta(dataset: Dataset): Promise<Snapshot> {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) throw new Error("LTA_ACCOUNT_KEY is not configured; live conditions are unknown.");
  const hit = cache.get(dataset);
  if (hit && hit.until > Date.now()) return hit.pending;
  const ttl = dataset === "TrainServiceAlerts" ? 60_000 : 3_600_000;
  const pending = (async () => {
    let res: Response;
    try {
      res = await fetch(`https://datamall2.mytransport.sg/ltaodataservice/${dataset}`, {
        headers: { AccountKey: key, Accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new Error("LTA request timed out or could not connect; live conditions are unknown.");
    }
    if (!res.ok) {
      const detail = res.status === 401 || res.status === 403 ? "authentication rejected" : "feed unavailable or rate limited";
      throw new Error(`LTA HTTP ${res.status}: ${detail}; live conditions are unknown.`);
    }
    try { return { data: await res.json(), fetchedAt: new Date().toISOString() }; }
    catch { throw new Error("LTA returned invalid JSON; live conditions are unknown."); }
  })();
  cache.set(dataset, { until: Date.now() + ttl, pending });
  try { return await pending; }
  catch (error) {
    cache.set(dataset, { until: Date.now() + 60_000, pending });
    throw error;
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected LTA response schema.");
  return value as Record<string, unknown>;
}

export function textField(value: unknown): string {
  if (typeof value !== "string") throw new Error("Unexpected LTA text field.");
  return value;
}
