# Share trip feedback recovery — October 7, 2026

The live results header's Share button made no visible change when clicked. Its handler wrote a destination-only query URL to the clipboard without awaiting completion or handling errors. The app does not consume that query to reconstruct a generated itinerary.

The header now opens a native modal dialog showing the actual itinerary summary. Copy waits for clipboard completion, confirms success, and selects the summary with manual-copy instructions when browser clipboard access fails. Browsers supporting native sharing also offer Share via; cancellation does not report success or copy unexpectedly. The dialog supports Escape, focus restoration, keyboard navigation and narrow screens.

The summary contains the destination, calendar dates and available day-by-day activities/meals. It prefers the displayed scheduled itinerary, supports activity ID resolution and multi-city stop dates, and does not include raw trip input, imported profiles or authentication/query parameters. Its homepage URL invites recipients to plan their own trip; this change does not create a persistent shared-itinerary URL.

Validation: five unit regressions cover scheduled and unscheduled plans, route dates, partial results and timezone-safe calendar dates. Six browser regressions cover modal/focus behavior, copy success/failure, native-share success/cancellation/failure and mobile width. No dependencies, backend contracts, model settings or safety text changed.
