/** Payload-free operations evidence. No prompts or learner identifiers. */
export interface JourneyMilestoneRequest {
  journey_id: string;
  events: {
    name:
      | "submitted"
      | "parsed"
      | "stream_destination"
      | "stream_weather"
      | "stream_itinerary-chunk"
      | "stream_done"
      | "stream_error";
    ms: number;
  }[];
}
export interface RuntimeSpan {
  span_id: string;
  parent_span_id: string | null;
  label: string;
  start_ms: number;
  end_ms: number | null;
  status: "running" | "ok" | "error";
  cost_usd: number | null;
  detail: Record<string, string | number | boolean>;
}
export interface RuntimeTrace {
  meta: {
    schema_version: 1;
    run_id: string;
    journey_id: string | null;
    service: string;
    environment: string;
    build: string;
    source: string;
    complete: boolean;
    dropped_spans: number;
    pending_spans: number;
    started_at: string;
    duration_ms: number;
    retention: string;
  };
  spans: RuntimeSpan[];
}
