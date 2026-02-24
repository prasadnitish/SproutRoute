import { useState } from "react";
import { submitFeedback } from "../services/api";

const CATEGORIES = [
  { value: "general", label: "General Feedback" },
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
];

export default function FeedbackModal({ isOpen, onClose }) {
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (message.trim().length < 5) {
      setErrorMsg("Please write at least 5 characters.");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    try {
      await submitFeedback({
        category,
        message: message.trim(),
        email: email.trim(),
      });
      setStatus("success");
      setMessage("");
      setEmail("");
      setCategory("general");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong.");
    }
  };

  const handleClose = () => {
    setStatus("idle");
    setErrorMsg("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d0d] p-8 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-5 top-5 text-muted hover:text-paper"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/20 text-primary-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-paper">Thank you!</h3>
            <p className="text-sm text-muted">
              Your feedback helps us make SproutRoute better for families
              everywhere.
            </p>
            <button
              onClick={handleClose}
              className="mt-2 rounded-full bg-primary-500 px-6 py-2 text-sm font-semibold text-ink transition hover:bg-primary-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">
                Feedback
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-paper">
                We'd love to hear from you
              </h3>
            </div>

            {errorMsg && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMsg}
              </div>
            )}

            {/* Category */}
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.15em] transition ${
                    category === cat.value
                      ? "border-primary-500 bg-primary-500/20 text-primary-500"
                      : "border-white/10 text-muted hover:border-white/30"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              rows={4}
              maxLength={2000}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-paper placeholder:text-muted focus:border-primary-500 focus:outline-none"
            />

            {/* Email (optional) */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email (optional, for follow-up)"
              className="w-full border-b border-white/20 bg-transparent py-3 text-sm text-paper placeholder:text-muted focus:border-primary-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-full bg-primary-500 py-3 text-sm font-semibold text-ink transition hover:bg-primary-600 disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Send Feedback"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
