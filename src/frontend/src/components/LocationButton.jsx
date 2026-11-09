import { Icon } from "./Icon.jsx";

// "Use my location": the visitor's explicit choice to share where they are. Shows what the browser did.
export default function LocationButton({ status, onRequest, onClear }) {
  if (status === "unavailable") return null;

  if (status === "granted") {
    return (
      <span className="inline-flex items-center gap-1.5 bg-meadow-50 border border-meadow-200 text-meadow-800 rounded-full pl-2.5 pr-1.5 py-1 text-[12px] font-semibold">
        <Icon name="pin" size={12} />
        <span>Using your location</span>
        <button
          type="button"
          onClick={onClear}
          className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-meadow-100 text-meadow-700"
          aria-label="Stop using my location"
        >
          <Icon name="x" size={10} />
        </button>
      </span>
    );
  }

  const requesting = status === "requesting";
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onRequest}
        disabled={requesting}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-meadow-700 hover:text-meadow-800 disabled:opacity-60 disabled:cursor-wait"
      >
        <Icon name="pin" size={12} />
        {requesting ? "Finding your location…" : "Use my location"}
      </button>
      {status === "denied" && (
        <span role="status" className="text-[12px] text-amber-700">
          Location is blocked for this site. Allow it in your browser settings, then try again.
        </span>
      )}
      {status === "error" && (
        <span role="status" className="text-[12px] text-amber-700">
          Couldn&apos;t get your location. Try again.
        </span>
      )}
    </span>
  );
}
