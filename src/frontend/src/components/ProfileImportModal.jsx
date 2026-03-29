import { useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "") || "";

const PROVIDER_PROMPT = `Please create a travel profile for me in JSON format. Include these sections:
- food_preferences: cuisines_liked, cuisines_disliked, dietary_restrictions, kid_foods, food_adventurousness (low/medium/high), notes, confidence (high/medium/low)
- travel_style: pace (slow/moderate/fast), planning_style (structured/flexible/spontaneous), accommodation_preference, transport_preference, notes, confidence
- activity_preferences: preferred_activities, disliked_activities, activity_intensity (relaxed/moderate/active), notes, confidence
- personality_profile: traveler_type, novelty_vs_comfort (1-5), crowd_tolerance (low/medium/high), notes, confidence
- family_context: traveling_with, kids_details, kid_preferences, notes, confidence
- constraints: budget_range, time_constraints, accessibility_needs, notes, confidence
- trip_priorities: must_haves, avoidances, notes, confidence
- profile_summary: one sentence describing me as a traveler
- unknowns: things you couldn't determine

Base this on what you know about me from our conversations.`;

export default function ProfileImportModal({ isOpen, onClose, onSaved }) {
  const [step, setStep] = useState("prompt"); // prompt | paste | review | saving
  const [rawText, setRawText] = useState("");
  const [validation, setValidation] = useState(null);
  const [normalized, setNormalized] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROVIDER_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleValidate = async () => {
    setError(null);
    setValidation(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/profile/import/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const data = await res.json();
      setValidation(data);
      if (data.valid) {
        // Auto-normalize
        const normRes = await fetch(`${API_BASE}/api/v1/profile/import/normalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText, providerHint: "other" }),
        });
        const normData = await normRes.json();
        setNormalized(normData.normalizedProfile);
        setStep("review");
      }
    } catch (err) {
      setError(err.message || "Validation failed");
    }
  };

  const handleSave = () => {
    // Save to localStorage for now (will persist to Supabase when auth is ready)
    try {
      localStorage.setItem("sprout:profile", JSON.stringify(normalized));
      onSaved?.(normalized);
      onClose();
    } catch (err) {
      setError("Failed to save profile");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold text-gray-900">
            {step === "prompt" && "Import from AI"}
            {step === "paste" && "Paste your profile"}
            {step === "review" && "Review your profile"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">&times;</button>
        </div>

        {/* Step 1: Show the prompt to copy */}
        {step === "prompt" && (
          <div className="space-y-4">
            <p className="text-gray-600 text-sm">
              Copy this prompt and paste it into ChatGPT, Claude, or Gemini. Then paste the JSON response below.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {PROVIDER_PROMPT}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyPrompt}
                className="flex-1 bg-meadow-600 hover:bg-meadow-700 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
              >
                {copied ? "Copied!" : "Copy prompt"}
              </button>
              <button
                onClick={() => setStep("paste")}
                className="flex-1 border border-gray-200 hover:border-meadow-400 text-gray-700 font-bold py-2.5 rounded-xl transition cursor-pointer"
              >
                I have JSON ready
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Paste JSON */}
        {step === "paste" && (
          <div className="space-y-4">
            <p className="text-gray-600 text-sm">
              Paste the JSON your AI assistant generated:
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full h-48 p-3 border-2 border-gray-200 rounded-xl font-mono text-sm resize-none focus:border-meadow-500 outline-none"
              placeholder='{"food_preferences": {...}, "travel_style": {...}}'
            />
            {validation && !validation.valid && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                {validation.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep("prompt")} className="text-gray-500 hover:text-gray-700 px-4 py-2 cursor-pointer">Back</button>
              <button
                onClick={handleValidate}
                disabled={!rawText.trim()}
                className="flex-1 bg-meadow-600 hover:bg-meadow-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
              >
                Validate & import
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === "review" && normalized && (
          <div className="space-y-4">
            {validation?.warnings?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                {validation.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}

            <div className="space-y-3">
              {normalized.food?.cuisinesLiked?.length > 0 && (
                <ProfileSection title="Food" items={[
                  `Likes: ${normalized.food.cuisinesLiked.join(", ")}`,
                  normalized.food.dietaryRestrictions?.length > 0 && `Restrictions: ${normalized.food.dietaryRestrictions.join(", ")}`,
                ].filter(Boolean)} />
              )}
              {normalized.travelStyle?.pace && (
                <ProfileSection title="Travel Style" items={[
                  `Pace: ${normalized.travelStyle.pace}`,
                  normalized.travelStyle.planningStyle && `Style: ${normalized.travelStyle.planningStyle}`,
                ].filter(Boolean)} />
              )}
              {normalized.activities?.preferredActivities?.length > 0 && (
                <ProfileSection title="Activities" items={[
                  `Likes: ${normalized.activities.preferredActivities.join(", ")}`,
                ]} />
              )}
              {normalized.profileSummary && (
                <div className="bg-meadow-50 border border-meadow-200 rounded-xl p-3">
                  <p className="text-sm font-semibold text-meadow-700 mb-1">Summary</p>
                  <p className="text-sm text-gray-700">{normalized.profileSummary}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep("paste")} className="text-gray-500 hover:text-gray-700 px-4 py-2 cursor-pointer">Edit</button>
              <button
                onClick={handleSave}
                className="flex-1 bg-meadow-600 hover:bg-meadow-700 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
              >
                Save profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileSection({ title, items }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      {items.map((item, i) => (
        <p key={i} className="text-sm text-gray-600">{item}</p>
      ))}
    </div>
  );
}
