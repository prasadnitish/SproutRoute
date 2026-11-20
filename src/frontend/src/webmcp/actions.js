import { fromJSONSchema } from 'zod';
import { planTripTool, searchPlacesTool } from '../../../shared/agentTools.js';

const planInput = fromJSONSchema(planTripTool.inputSchema);
const searchInput = fromJSONSchema(searchPlacesTool.inputSchema);

export function makeTripDraft(input) {
  const parsed = planInput.safeParse(input);
  if (!parsed.success) throw new Error('Provide a destination, valid travel dates and supported traveler details.');
  const { destination, startDate, endDate, children = [], pets = [], activities = [] } = parsed.data;
  if (endDate < startDate) throw new Error('The end date must be on or after the start date.');
  const parts = [`Trip to ${destination.trim()} from ${startDate} to ${endDate}.`];
  if (children.length) parts.push(`Children’s ages in years: ${children.map(child => child.age).join(', ')}.`);
  for (const pet of pets) {
    parts.push(`Traveling with a ${pet.breed} ${pet.type.replace('_', ' ')}${pet.name ? ' named ' + pet.name : ''} (${pet.weightLbs} lb).`);
  }
  if (activities.length) parts.push(`Activities: ${activities.join(', ')}.`);
  return parts.join(' ');
}

export function searchTripPlaces(input, activities) {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success || parsed.data.job_id) throw new Error('Supply a search query and omit the job ID to search this page.');
  const query = parsed.data.query.trim().toLowerCase();
  const matches = new Map();
  for (const place of activities) {
    if (place?.grounded !== true || !place.placeId || !place.name) continue;
    const category = typeof place.category === 'string' ? place.category : '';
    if (`${place.name} ${category}`.toLowerCase().includes(query)) {
      matches.set(place.placeId, { place_id: place.placeId, name: place.name, category });
      if (matches.size >= 20) break;
    }
  }
  return [...matches.values()];
}
