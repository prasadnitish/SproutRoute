import { motion } from "framer-motion";

const PET_TYPES = [
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "small_animal", label: "Small Animal" },
];

const EMPTY_PET = {
  type: "dog",
  name: "",
  breed: "",
  weightLbs: "",
  specialNeeds: "",
};

export default function FamilyStep({
  numChildren,
  onNumChildrenChange,
  childAges,
  onChildAgesChange,
  childWeights,
  onChildWeightsChange,
  childHeights,
  onChildHeightsChange,
  pets,
  onPetsChange,
  onNext,
  onBack,
}) {
  // ── Children helpers (unchanged from KidsStep) ─────────────────────────
  const updateChildCount = (value) => {
    const n = Math.max(0, Math.min(10, parseInt(value) || 0));
    onNumChildrenChange(n);
    if (n > 0) {
      onChildAgesChange(Array(n).fill(0).map((_, i) => childAges[i] ?? 2));
      onChildWeightsChange(Array(n).fill("").map((_, i) => childWeights[i] ?? ""));
      onChildHeightsChange(Array(n).fill("").map((_, i) => childHeights[i] ?? ""));
    } else {
      onChildAgesChange([]);
      onChildWeightsChange([]);
      onChildHeightsChange([]);
    }
  };

  const updateAge = (index, value) => {
    const v = Math.max(0, Math.min(18, parseInt(value) || 0));
    const next = [...childAges];
    next[index] = v;
    onChildAgesChange(next);
  };

  const updateWeight = (index, value) => {
    const next = [...childWeights];
    next[index] = value;
    onChildWeightsChange(next);
  };

  const updateHeight = (index, value) => {
    const next = [...childHeights];
    next[index] = value;
    onChildHeightsChange(next);
  };

  // ── Pet helpers ────────────────────────────────────────────────────────
  const addPet = () => {
    if (pets.length >= 5) return;
    onPetsChange([...pets, { ...EMPTY_PET }]);
  };

  const removePet = (index) => {
    onPetsChange(pets.filter((_, i) => i !== index));
  };

  const updatePet = (index, field, value) => {
    const next = pets.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    onPetsChange(next);
  };

  return (
    <>
      {/* ── Children Section ──────────────────────────────────────────── */}
      <div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
          {numChildren > 0 ? "Who's coming along?" : "Traveling with kids?"}
        </h2>
        <p className="text-muted dark:text-dark-muted mt-2">
          {numChildren > 0
            ? "Add your little explorers so we can tailor the itinerary."
            : "No kids? No problem — we'll plan an adults-only trip."}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => updateChildCount(numChildren - 1)}
          disabled={numChildren <= 0}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-lg font-bold text-slate-text dark:text-dark-text disabled:opacity-30 transition-colors hover:border-sprout-base"
        >
          -
        </motion.button>
        <div className="text-center">
          <span className="text-3xl font-bold text-sprout-dark dark:text-dark-sprout">{numChildren}</span>
          <p className="text-xs text-muted dark:text-dark-muted">
            {numChildren === 1 ? "child" : "children"}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => updateChildCount(numChildren + 1)}
          disabled={numChildren >= 10}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-lg font-bold text-slate-text dark:text-dark-text disabled:opacity-30 transition-colors hover:border-sprout-base"
        >
          +
        </motion.button>
      </div>

      {/* Per-child cards */}
      {numChildren > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {Array(numChildren)
            .fill(0)
            .map((_, index) => (
              <motion.div
                key={`child-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="rounded-2xl border border-sprout-light dark:border-dark-border bg-sprout-light/30 dark:bg-dark-bg p-4 space-y-3"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-sprout-dark dark:text-dark-sprout">
                  Child {index + 1}
                </p>
                <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                  Age (years)
                  <input
                    type="number"
                    min="0"
                    max="18"
                    value={childAges[index] || 0}
                    onChange={(e) => updateAge(index, e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-slate-text dark:text-dark-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                  />
                </label>
                <div className="grid gap-3 grid-cols-2">
                  <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                    Weight (lb)
                    <span className="block text-[10px] text-muted font-normal">
                      For car seat safety
                    </span>
                    <input
                      type="number"
                      min="2"
                      max="300"
                      step="0.1"
                      value={childWeights[index] || ""}
                      onChange={(e) => updateWeight(index, e.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                    Height (in)
                    <span className="block text-[10px] text-muted font-normal">
                      For car seat safety
                    </span>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      step="0.1"
                      value={childHeights[index] || ""}
                      onChange={(e) => updateHeight(index, e.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                    />
                  </label>
                </div>
              </motion.div>
            ))}
        </div>
      )}

      {/* ── Pets Section ──────────────────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-dark-border">
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
          {pets.length > 0 ? "Furry friends joining?" : "Traveling with any pets?"}
        </h2>
        <p className="text-muted dark:text-dark-muted mt-2">
          {pets.length > 0
            ? "Tell us about your pets so we find pet-friendly spots."
            : "Add pets to get airline policies, packing lists, and pet-friendly venues."}
        </p>
      </div>

      {/* Pet cards */}
      {pets.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {pets.map((pet, index) => (
            <motion.div
              key={`pet-${index}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-2xl border border-amber-200 dark:border-dark-border bg-amber-50/30 dark:bg-dark-bg p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Pet {index + 1}
                </p>
                <button
                  onClick={() => removePet(index)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  aria-label={`Remove pet ${index + 1}`}
                >
                  Remove
                </button>
              </div>

              {/* Type dropdown */}
              <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                Type
                <select
                  value={pet.type}
                  onChange={(e) => updatePet(index, "type", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-slate-text dark:text-dark-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                >
                  {PET_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Name (optional) */}
              <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                Name
                <input
                  type="text"
                  value={pet.name}
                  onChange={(e) => updatePet(index, "name", e.target.value)}
                  placeholder="Optional"
                  maxLength={50}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                />
              </label>

              {/* Breed */}
              <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                Breed
                <input
                  type="text"
                  value={pet.breed}
                  onChange={(e) => updatePet(index, "breed", e.target.value)}
                  placeholder="e.g. Golden Retriever"
                  maxLength={80}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                />
              </label>

              <div className="grid gap-3 grid-cols-2">
                {/* Weight */}
                <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                  Weight (lbs)
                  <span className="block text-[10px] text-muted font-normal">
                    For airline cabin eligibility
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    step="0.1"
                    value={pet.weightLbs}
                    onChange={(e) => updatePet(index, "weightLbs", e.target.value)}
                    placeholder="e.g. 20"
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                  />
                </label>

                {/* Special needs (optional) */}
                <label className="block text-sm font-medium text-slate-text dark:text-dark-text col-span-2">
                  Special needs
                  <span className="block text-[10px] text-muted font-normal">
                    Medications, anxiety, dietary (optional)
                  </span>
                  <textarea
                    value={pet.specialNeeds}
                    onChange={(e) => updatePet(index, "specialNeeds", e.target.value)}
                    placeholder="e.g. anxiety medication"
                    maxLength={300}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition resize-none"
                  />
                </label>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Pet button */}
      {pets.length < 5 && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={addPet}
          className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 py-3 px-6 font-semibold text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          + Add Pet
        </motion.button>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors shadow-soft"
        >
          Continue
        </motion.button>
        <button
          onClick={onBack}
          className="text-sm text-muted hover:text-slate-text dark:hover:text-dark-text transition-colors"
        >
          Back
        </button>
      </div>
    </>
  );
}
