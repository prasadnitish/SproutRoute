import { useWebMCP } from 'use-webmcp-tool';
import { flushSync } from 'react-dom';
import { planTripTool, searchPlacesTool } from '../../../shared/agentTools.js';
import { analytics } from '../utils/analytics.js';
import { makeTripDraft, searchTripPlaces } from './actions.js';

export default function Tools({ onDraft, activities }) {
  useWebMCP({
    ...planTripTool,
    enabled: Boolean(onDraft),
    annotations: { readOnlyHint: false },
    execute(input, { signal } = {}) {
      signal?.throwIfAborted();
      const draft = makeTripDraft(input);
      flushSync(() => onDraft(draft));
      analytics.featureUsed('webmcp_plan_trip');
      return { status: 'awaiting_confirmation', message: 'The draft is ready. The traveler can edit it and select Plan it to generate their itinerary.' };
    },
  });
  useWebMCP({
    ...searchPlacesTool,
    enabled: Array.isArray(activities),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input, { signal } = {}) {
      signal?.throwIfAborted();
      const places = searchTripPlaces(input, activities);
      analytics.featureUsed('webmcp_search_places');
      return { places };
    },
  });
  return null;
}
