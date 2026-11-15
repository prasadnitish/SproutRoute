// "Report a problem with this plan". The report opens in the visitor's own mail
// app, so nothing is sent without them.

export const REPORT_EMAIL = "feedback@sproutroute.com";

const REPORT_BODY =
  "Tell us what's wrong with this plan, for example a place that is closed, unsafe or inappropriate for kids.\n\n";

export function buildReportMailto({ destination, startDate, endDate } = {}) {
  const dates = startDate && endDate ? ` (${startDate} to ${endDate})` : "";
  const subject = `Problem with a SproutRoute plan${destination ? `: ${destination}${dates}` : ""}`;
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(REPORT_BODY)}`;
}
