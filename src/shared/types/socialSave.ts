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
