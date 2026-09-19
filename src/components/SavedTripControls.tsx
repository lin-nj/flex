"use client";

export default function SavedTripControls({
  isSaved,
  onSave,
  onClear,
  lastReevaluatedAt,
  changedNotice,
}: {
  isSaved: boolean;
  onSave: () => void;
  onClear: () => void;
  lastReevaluatedAt: string | null;
  changedNotice: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {changedNotice && (
        <div className="rounded-[14px] bg-warn-soft p-4 text-[15px] font-medium text-warn" role="status">
          {changedNotice}
        </div>
      )}

      {isSaved ? (
        <>
          <button onClick={onClear} className="w-full rounded-[14px] bg-surface px-4 py-4 text-[17px] font-semibold">
            Saved — tap to remove
          </button>
          <p className="text-center text-[13px] text-text-muted">
            Re-checked while this tab is open
            {lastReevaluatedAt && (
              <>
                {" · last checked "}
                {new Date(lastReevaluatedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
              </>
            )}
          </p>
        </>
      ) : (
        <button
          onClick={onSave}
          className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-accent-contrast"
        >
          Save this trip
        </button>
      )}
    </div>
  );
}
