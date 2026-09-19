export default function OfflineBanner({ cachedAt, connectionFailed = false }: { cachedAt: string | null; connectionFailed?: boolean }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-warn" role="status">
      <strong className="font-semibold">{connectionFailed ? "Connection unavailable." : "You're offline."}</strong> {cachedAt ? "Showing your last saved journey" : "No cached journey is available"}
      {cachedAt && <> from {new Date(cachedAt).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" })}</>}.
      Conditions haven&apos;t been re-checked since then.
    </div>
  );
}
