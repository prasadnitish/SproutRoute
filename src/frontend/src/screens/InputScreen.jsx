import { useState, useRef, useEffect } from "react";
import { analytics } from "../utils/analytics.js";
import { loadRecentTrips } from "../utils/recentTrips.js";
import { Icon } from "../components/Icon.jsx";

const VIBES = [
  { key: "beach", label: "Beach trip", icon: "beach" },
  { key: "adventure", label: "Adventure", icon: "mountain" },
  { key: "theme", label: "Theme parks", icon: "castle" },
  { key: "international", label: "International", icon: "globe" },
  { key: "cruise", label: "Cruise", icon: "cruise" },
  { key: "camping", label: "Camping", icon: "camping" },
  { key: "city", label: "City break", icon: "city" },
];

const EXAMPLES = [
  {
    key: "maui",
    title: "Maui with 2 kids",
    sub: "Apr 12–19 · beach week",
    prompt: "Beach week in Maui, Hawaii from April 12 to April 19 with 2 kids age 5 and 8",
    icon: "beach",
  },
  {
    key: "yellowstone",
    title: "Yellowstone road trip",
    sub: "5 days · Jun · family of 4",
    prompt: "5-day road trip from Denver to Yellowstone in June, two kids ages 6 and 9",
    icon: "mountain",
  },
  {
    key: "tokyo",
    title: "Tokyo, one week",
    sub: "International · no kids",
    prompt: "One-week city break in Tokyo, Japan in October, just two adults",
    icon: "city",
  },
];

const TRAVELER_TAGS = [
  { key: "kids", label: "With kids", icon: "kids", hint: "traveling with kids" },
  { key: "pet", label: "With a pet", icon: "paw", hint: "traveling with our dog" },
];

const SESSION_KEY = "sprout:lastInput";

function formatDates(startDate, endDate) {
  if (!startDate) return "";
  const fmt = (s) => {
    try {
      const d = new Date(s + "T00:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return s; }
  };
  return endDate ? `${fmt(startDate)} – ${fmt(endDate)}` : fmt(startDate);
}

export default function InputScreen({ onSubmit, savedProfile }) {
  const [text, setText] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
  });
  const [activeVibe, setActiveVibe] = useState(null);
  const [tags, setTags] = useState({});
  const [recentTrips, setRecentTrips] = useState([]);
  const textareaRef = useRef(null);

  useEffect(() => {
    setRecentTrips(loadRecentTrips());
  }, []);

  const toggleTag = (key) => {
    setTags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const pickVibe = (vibe) => {
    setActiveVibe((prev) => (prev === vibe.key ? null : vibe.key));
    // Also hint the textarea so an empty prompt isn't a dead end
    setText((prev) => {
      const label = vibe.label.toLowerCase();
      if (prev.toLowerCase().includes(label)) return prev;
      return prev.trim() ? `${prev.trim()} — ${label}` : label;
    });
    analytics.vibeChipClicked(vibe.label);
  };

  const submit = (rawText) => {
    const base = (rawText ?? text).trim();
    if (!base) return;
    try { sessionStorage.setItem(SESSION_KEY, base); } catch { /* quota */ }

    const extras = [];
    const activeVibeObj = VIBES.find((v) => v.key === activeVibe);
    if (activeVibeObj && !base.toLowerCase().includes(activeVibeObj.label.toLowerCase())) {
      extras.push(activeVibeObj.label.toLowerCase());
    }
    const lower = base.toLowerCase();
    TRAVELER_TAGS.forEach((t) => {
      if (!tags[t.key]) return;
      const already = t.key === "kids"
        ? lower.includes("kid") || lower.includes("child")
        : lower.includes("pet") || lower.includes("dog");
      if (!already) extras.push(t.hint);
    });
    const finalText = extras.length ? `${base} — ${extras.join(", ")}` : base;
    onSubmit({ text: finalText, savedProfile });
  };

  const runExample = (example) => {
    setText(example.prompt);
    analytics.vibeChipClicked(example.title);
    submit(example.prompt);
  };

  const rerunRecent = (entry) => {
    const prompt = entry.destination
      ? `Trip to ${entry.destination}${entry.startDate ? ` starting ${entry.startDate}` : ""}`
      : "";
    if (!prompt) return;
    setText(prompt);
    submit(prompt);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  // Build a context summary for the chip row above the textarea
  const contextChips = [];
  const activeVibeObj = VIBES.find((v) => v.key === activeVibe);
  if (activeVibeObj) contextChips.push({ key: `vibe:${activeVibe}`, label: activeVibeObj.label, icon: activeVibeObj.icon, onRemove: () => setActiveVibe(null) });
  TRAVELER_TAGS.forEach((t) => {
    if (tags[t.key]) contextChips.push({ key: `tag:${t.key}`, label: t.label, icon: t.icon, onRemove: () => toggleTag(t.key) });
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 md:py-14 flex flex-col items-stretch gap-8">
      {/* Hero — calmer, shorter */}
      <header className="text-center">
        <h1 className="font-display font-extrabold text-3xl md:text-[40px] leading-[1.08] tracking-tight text-gray-900">
          Plan a family trip in
          <br />
          <span className="text-meadow-700">one prompt.</span>
        </h1>
        <p className="text-gray-500 mt-3 text-[15px] md:text-base">
          Start with an example, or describe it yourself.
        </p>
      </header>

      {/* Example trip cards — the primary CTA per F1 */}
      <section aria-labelledby="examples-heading">
        <p id="examples-heading" className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-gray-400 mb-2 px-1">
          Try an example
        </p>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.key}
              onClick={() => runExample(ex)}
              className="text-left bg-white border border-gray-200 hover:border-meadow-500 hover:shadow-sm rounded-2xl p-4 transition group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2 text-meadow-700">
                <span className="w-8 h-8 rounded-lg bg-meadow-50 border border-meadow-100 inline-flex items-center justify-center group-hover:bg-meadow-100 transition">
                  <Icon name={ex.icon} size={16} />
                </span>
              </div>
              <p className="font-semibold text-[14px] text-gray-900 leading-snug">{ex.title}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{ex.sub}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Recent trips — only when they exist (F10) */}
      {recentTrips.length > 0 && (
        <section aria-labelledby="recent-heading">
          <p id="recent-heading" className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-gray-400 mb-2 px-1 flex items-center gap-1.5">
            <Icon name="history" size={12} /> Recent trips
          </p>
          <div className="flex flex-wrap gap-2">
            {recentTrips.map((trip) => (
              <button
                key={`${trip.destination}-${trip.savedAt}`}
                onClick={() => rerunRecent(trip)}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-meadow-400 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-gray-700 hover:text-meadow-700 transition cursor-pointer"
              >
                <Icon name="pin" size={12} />
                <span>{trip.destination}</span>
                {trip.startDate && (
                  <span className="text-gray-400 text-[12px]">· {formatDates(trip.startDate, trip.endDate)}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Free text input — demoted to "or describe it yourself" */}
      <section aria-labelledby="custom-heading">
        <p id="custom-heading" className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-gray-400 mb-2 px-1">
          Or describe it yourself
        </p>

        {/* Context row (F2) — visible chip representation of selected vibe + tags */}
        {contextChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {contextChips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1.5 bg-meadow-50 border border-meadow-200 text-meadow-800 rounded-full pl-2.5 pr-1.5 py-1 text-[12px] font-semibold"
              >
                <Icon name={c.icon} size={12} />
                <span>{c.label}</span>
                <button
                  onClick={c.onRemove}
                  className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-meadow-100 text-meadow-700"
                  aria-label={`Remove ${c.label}`}
                >
                  <Icon name="x" size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="w-full bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm focus-within:border-meadow-500 transition">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[72px] resize-none w-full outline-none text-[15px] font-body text-gray-900 placeholder:text-gray-400"
            placeholder="e.g. Beach week in Florida with a toddler"
          />
          <div className="flex items-center justify-between mt-2 gap-3">
            <span className="text-[12px] text-gray-400">
              {"\u2318"}+Enter to send
            </span>
            <button
              onClick={() => submit()}
              disabled={!text.trim()}
              className="inline-flex items-center gap-1.5 bg-meadow-600 hover:bg-meadow-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-xl shadow-sm transition cursor-pointer text-[13px]"
            >
              Plan it <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </div>

        {/* Vibe row — single-select, visible selection state (F2) */}
        <div className="mt-3">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-gray-400 mb-2 px-1">
            Add a vibe
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VIBES.map((vibe) => {
              const selected = activeVibe === vibe.key;
              return (
                <button
                  key={vibe.key}
                  type="button"
                  onClick={() => pickVibe(vibe)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition cursor-pointer border ${
                    selected
                      ? "bg-gray-900 border-gray-900 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-meadow-400 hover:text-meadow-700"
                  }`}
                >
                  <Icon name={vibe.icon} size={13} />
                  {vibe.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Traveler toggles — line-icon variants (F2) */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TRAVELER_TAGS.map((t) => {
            const selected = !!tags[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleTag(t.key)}
                aria-pressed={selected}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition cursor-pointer border ${
                  selected
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-meadow-400 hover:text-meadow-700"
                }`}
              >
                <Icon name={t.icon} size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
