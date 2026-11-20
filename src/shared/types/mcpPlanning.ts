import type { PackingList } from "./trip.js";

export interface McpPlace {
  place_id: string;
  name: string;
  category: string;
  rating: number | null;
  hours: string[] | null;
  business_status: string | null;
  photo_reference: string | null;
}

export interface McpTripPlan {
  schema_version: 1;
  job_id: string;
  destination: string;
  status: "pending" | "ready" | "failed";
  days: {
    day: number;
    date: string;
    stops: (McpPlace & { start_time: string; duration_minutes: number; locked: boolean })[];
  }[];
  message?: string;
  open_url?: string;
  runId?: string;
  packingList?: PackingList | null;
  safety?: unknown;
}
