// JSON Schema is the discovery and validation contract for both MCP transports.
const text = (maxLength, description) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S', description });
const object = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items, maxItems, description) => ({ type: 'array', items, maxItems, description });
const date = { type: 'string', format: 'date', description: 'Calendar date in YYYY-MM-DD format.' };

export const planTripTool = {
  name: 'plan_trip',
  description: 'Plan a family itinerary with age-aware stops and activity preferences. In a browser, the traveler reviews the draft and selects Plan it to start generation.',
  inputSchema: object({
    destination: text(200, 'Destination city or region, including its country when ambiguous.'),
    startDate: date,
    endDate: date,
    children: list(object({ age: { type: 'number', minimum: 0, maximum: 17.99, description: 'Age in years.' } }, ['age']), 12, 'Children traveling, with their ages.'),
    pets: list(object({
      type: { type: 'string', enum: ['dog', 'cat', 'small_animal'] },
      breed: text(80, 'Breed of the traveling pet.'),
      weightLbs: { type: 'number', minimum: 0, maximum: 1000, description: 'Weight in pounds.' },
      name: text(80, 'Optional pet name.'),
    }, ['type', 'breed', 'weightLbs']), 8, 'Pets traveling.'),
    activities: list(text(100, 'An activity preference, such as hiking.'), 20, 'Activity preferences.'),
  }, ['destination', 'startDate', 'endDate']),
};

export const searchPlacesTool = {
  name: 'search_places',
  description: 'Find verified places in a trip by name or category. Supply the completed job ID on the remote connector. Omit it in the browser to search the open itinerary.',
  inputSchema: object({
    job_id: text(128, 'Completed plan job ID. Only used on the remote connector.'),
    query: text(120, 'Part of a place name or category.'),
  }, ['query']),
};
