function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function buildShareSummary(tripData, origin) {
  const trip = tripData?.trip || tripData?.parsed || {};
  const parsed = tripData?.parsed || {};
  const stops = tripData?.routePlan?.stops || [];
  const destination = tripData?.routePlan?.title || trip.destination || parsed.destination || 'Your trip';
  const start = formatDate(trip.startDate || parsed.startDate || stops[0]?.arrivalDate);
  const end = formatDate(trip.endDate || parsed.endDate || stops.at(-1)?.departureDate);
  const lines = [`SproutRoute trip to ${destination}`, [start, end].filter(Boolean).join(' to ')].filter(Boolean);
  const plan = tripData?.tripPlan || tripData?.itinerary || {};
  const activities = plan.suggestedActivities || [];
  const byId = new Map(activities.map(activity => [activity.id, activity]));
  const byName = new Map(activities.map(activity => [activity.name?.toLowerCase(), activity]));
  const scheduled = tripData?.scheduledItinerary;
  const days = scheduled?.length ? scheduled : plan.dailyItinerary || (Array.isArray(plan) ? plan : []);

  days.forEach((day, index) => {
    const label = formatDate(day.routeDate || day.date) || day.day || `Day ${index + 1}`;
    lines.push('', `${label}${day.stopName ? ` — ${day.stopName}` : ''}`);
    for (const item of day.scheduled || day.activities || day.items || []) {
      const activity = typeof item === 'string' ? byId.get(item) || byName.get(item.toLowerCase()) || { name: item } : item;
      const name = activity?.name || activity?.title;
      if (name) lines.push(`- ${activity.scheduledStart ? `${activity.scheduledStart}: ` : ''}${name}${activity.status === 'closed' ? ' (closed)' : ''}`);
    }
    if (!day.scheduled) {
      for (const [meal, item] of Object.entries(day.meals || {})) {
        const name = typeof item === 'string' ? item : item?.name;
        if (name) lines.push(`- ${meal[0].toUpperCase()}${meal.slice(1)}: ${name}`);
      }
    }
  });
  lines.push('', `Plan your own: ${origin}`);
  return lines.join('\n');
}
