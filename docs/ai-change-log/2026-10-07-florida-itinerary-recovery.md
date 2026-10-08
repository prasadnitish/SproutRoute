# Florida itinerary recovery — October 7, 2026

The production frontend and health endpoint responded, while the Florida request logged at 22:49 UTC returned weather, packing, and safety without an itinerary. The logged request covered December 20–27, 2026, with one child; the exact user prompt and child age were not available. Gemini and fallback itinerary providers exhausted their deadlines. The browser then made repeated bundle requests after the stream connection failed.

The deployed baseline was `426b0ad9bd578654ec1bb0fe93b423dc2762b894`. A live three-day Florida trip for two adults succeeded, with the itinerary provider completing in 19.7 seconds. This distinguished long-request failures from complete provider or hosting unavailability.

The inclusive date splitter advanced both the end and next start by seven days. December 20–27 consequently became one eight-day request. Larger requests also overlapped dates. Batches now cover at most three inclusive dates, advance to the following date, and stream before subsequent generation starts. Activities are namespaced by batch and day labels advance across batches. Previously generated attraction names now reach the next model prompt. Route-stop batches use their actual start dates when scheduling.

The stream sends a keepalive comment every 15 seconds, cancels providers on response disconnect, and treats request-body completion separately from disconnect. The browser requires the final `done` event and does not silently request a new bundle after destination data has already arrived. Partial results remain available with the existing retry/edit controls.

Regression coverage includes 1–21-day date ranges, eight-day Florida progression, colliding model IDs, next-batch prompt context, route-stop dates and cancellation, stream interruption, and timer cleanup. No request or response schema changed. Provider credentials, safety guidance, and production timeout settings were not changed.

Validation before release: 576 unit/integration tests and the frontend Vite build passed. With current production model settings and empty attraction cache, an eight-day Florida test with two adults and a six-year-old emitted 14 attractions for the first three days at 26.9 seconds, the second batch at 52.3 seconds, and all eight days at 70.7 seconds. These are observed run timings, not guarantees. That run exposed model-provided global day numbers; normalization now uses chronological batch position and has a regression covering both local and global model labels.
