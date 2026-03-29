/**
 * profileImport.ts — External LLM profile import contracts
 *
 * Kept separate from internal profile schema so import validation
 * and normalization can evolve independently.
 *
 * Phase 2 deliverable per PRD §7.
 */

// ── Import validation ───────────────────────────────────────────────────────

export interface ProfileImportValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedFormat: "external_profile_v1" | "unknown";
}

// ── Import request/response ─────────────────────────────────────────────────

export interface ProfileImportRequest {
  providerHint: "chatgpt" | "claude" | "gemini" | "other" | string;
  rawText: string;
}

export interface ProfileImportRecord {
  id: string;
  userId: string;
  providerHint: string;
  rawImportText: string;
  normalizedProfileJson: Record<string, unknown> | null;
  validationResultJson: ProfileImportValidation;
  createdAt: string;
}
