export interface SocialImport {
  source: string;
  text?: string;
}

export interface SocialCandidate {
  name: string;
  destination: string;
  category: "eat" | "cafe" | "drink" | "attraction" | "stay" | "shop" | "activity" | "viewpoint" | "other";
  channel?: string;
  evidence: string;
  tip: string;
  family: string;
}

export interface SocialExtraction {
  status: "review" | "needs_evidence";
  origin: "supplied" | "title";
  candidates: SocialCandidate[];
}

export interface SavedSocialPlace extends SocialCandidate {
  placeId: string;
  source: string;
  locked: boolean;
}

export interface AccountRemovalProof {
  appleClientId?: string;
  appleAuthorizationCode?: string;
  manualAppleRevocation?: boolean;
}
export interface AccountMergeRequest extends AccountRemovalProof {
  sourceAccessToken: string;
  confirm: true;
}
export interface AccountLifecycleResponse {
  ok: true;
  manualAppleRevocation?: true;
}

export interface PrivateConnectorMetadata {
  resource: string;
  resource_name: string;
  authorization_servers: string[];
  scopes_supported: ["openid"];
  bearer_methods_supported: ["header"];
}

export interface SavedTripSummaryPage {
  trips: { id: string; destination: string; updated_at: string }[];
  next: string | null;
}

export interface MeteredSocialImport extends SocialImport {
  requestId: string;
}

export interface SocialBillingStatus {
  plan: "free" | "premium";
  limit: number;
  freeLimit: number;
  premiumLimit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}
