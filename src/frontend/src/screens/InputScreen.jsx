import { useState, useRef, useEffect } from "react";

const VIBES = [
  { emoji: "\u{1F3D6}", label: "Beach trip" },
  { emoji: "\u{1F3D4}", label: "Adventure" },
  { emoji: "\u{1F3F0}", label: "Theme parks" },
  { emoji: "\u{1F30E}", label: "International" },
  { emoji: "\u{1F6A2}", label: "Cruise" },
  { emoji: "\u{1F3D5}", label: "Camping" },
  { emoji: "\u{1F3D9}", label: "City break" },
];

const TRAVELER_TAGS = [
  { key: "kids", emoji: "\u{1F476}", label: "With kids", hint: "traveling with kids" },
  { key: "pet", emoji: "\u{1F43E}", label: "With a pet", hint: "traveling with our dog" },
];

const SESSION_KEY = "sprout:lastInput";

export default function InputScreen({ onSubmit }) {
  const [text, setText] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
  });
  const [tags, setTags] = useState({});
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const toggleTag = (key) => {
    setTags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Persist raw input for back-button restoration (sessionStorage dies on tab close)
    try { sessionStorage.setItem(SESSION_KEY, trimmed); } catch { /* quota */ }
    // Append context hints from toggles if user didn't already mention them
    const lower = trimmed.toLowerCase();
    const extras = TRAVELER_TAGS
      .filter(t => tags[t.key] && !lower.includes(t.key === "kids" ? "kid" : "dog") && !lower.includes(t.key === "kids" ? "child" : "pet"))
      .map(t => t.hint);
    const finalText = extras.length > 0 ? `${trimmed} — ${extras.join(", ")}` : trimmed;
    onSubmit(finalText);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center gap-6">
      {/* Hero */}
      <h1 className="font-display font-extrabold text-4xl md:text-5xl text-center leading-tight">
        Where is your family
        <br />
        <span className="text-meadow-600">headed next?</span>
      </h1>
      <p className="text-gray-500 text-center text-lg">
        Describe your dream trip and we&rsquo;ll handle the rest.
      </p>

      {/* Input box */}
      <div className="w-full bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm focus-within:border-meadow-500 transition">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[80px] resize-none w-full outline-none text-lg font-body"
          placeholder={"e.g. Beach week in Florida with a toddler\nor: 5-day road trip from Chicago, kids are 3 & 7\nor: Camping near national parks in June"}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">
            Be as vague or specific as you like
          </span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="bg-meadow-600 hover:bg-meadow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition cursor-pointer"
          >
            Plan it &#x2728;
          </button>
        </div>
      </div>

      {/* Traveler toggles */}
      <div className="flex gap-2 w-full justify-center">
        {TRAVELER_TAGS.map(({ key, emoji, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleTag(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition cursor-pointer border ${
              tags[key]
                ? "bg-meadow-100 border-meadow-500 text-meadow-700"
                : "bg-white border-gray-200 text-gray-500 hover:border-meadow-400"
            }`}
            aria-pressed={!!tags[key]}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 whitespace-nowrap">
          &mdash; or start with a vibe &mdash;
        </span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-2 justify-center">
        {VIBES.map(({ emoji, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => setText(`${emoji} ${label}`)}
            className="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-medium text-gray-600 cursor-pointer hover:border-meadow-400 hover:text-meadow-700 hover:bg-meadow-50 transition"
          >
            {emoji} {label}
          </button>
        ))}
      </div>
    </div>
  );
}
