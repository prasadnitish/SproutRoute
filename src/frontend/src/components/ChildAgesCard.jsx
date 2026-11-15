import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { AGE_OPTIONS, MAX_CHILDREN, initialAgeRows, agesComplete, ageLabel } from "../utils/childAges.js";

// Asks for the children's ages before planning, when the trip description did not
// give them. "Skip" plans anyway, without car seat guidance.
export default function ChildAgesCard({ parsedInput, onContinue, onSkip, onBack }) {
  const [rows, setRows] = useState(() => initialAgeRows(parsedInput));
  const setAge = (index, value) =>
    setRows((prev) => prev.map((age, i) => (i === index ? (value === "" ? null : Number(value)) : age)));

  return (
    <section
      aria-labelledby="child-ages-title"
      className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4"
    >
      <div>
        <h2 id="child-ages-title" className="font-display font-bold text-[22px] leading-tight tracking-tight text-gray-900">
          How old are your children?
        </h2>
        <p className="text-gray-600 text-[14px] mt-1.5 leading-snug">
          You didn&rsquo;t say, and we don&rsquo;t want to guess. Ages shape the activities and the car seat guidance.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((age, index) => (
          <li key={index} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 min-h-[48px]">
            <label htmlFor={`child-age-${index}`} className="flex-1 text-[14px] font-semibold text-gray-900">
              Child {index + 1}
            </label>
            <select
              id={`child-age-${index}`}
              value={age ?? ""}
              onChange={(e) => setAge(index, e.target.value)}
              className="text-[14px] text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5"
            >
              <option value="">Choose</option>
              {AGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{ageLabel(option)}</option>
              ))}
            </select>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                className="w-9 h-9 inline-flex items-center justify-center text-gray-400 hover:text-red-600 transition"
                aria-label={`Remove child ${index + 1}`}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {rows.length < MAX_CHILDREN && (
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, null])}
          className="self-start inline-flex items-center gap-1.5 text-[13px] font-semibold text-meadow-700 hover:text-meadow-800"
        >
          <Icon name="plus" size={13} /> Add a child
        </button>
      )}

      <button
        type="button"
        disabled={!agesComplete(rows)}
        onClick={() => onContinue(rows)}
        className="w-full rounded-xl bg-meadow-600 text-white font-semibold text-[15px] px-4 py-3 hover:bg-meadow-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800"
        >
          <Icon name="arrowLeft" size={12} /> Back
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] font-semibold text-meadow-700 hover:text-meadow-800 text-right"
        >
          Skip. Plan without car seat guidance
        </button>
      </div>
    </section>
  );
}
