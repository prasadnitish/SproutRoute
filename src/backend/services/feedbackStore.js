export async function saveTripFeedback(admin, {
  userId,
  tripRequestId,
  signalType,
  payload,
}) {
  const { data: trip, error: tripError } = await admin
    .from("trip_requests")
    .select("id")
    .eq("id", tripRequestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (tripError) throw tripError;
  if (!trip) {
    return {
      ok: false,
      unauthorized: true,
      errors: ["Trip request is not available for feedback."],
    };
  }

  const { error } = await admin.from("trip_feedback").insert({
    user_id: userId,
    trip_request_id: trip.id,
    signal_type: signalType,
    payload_json: payload || {},
  });
  if (error) throw error;
  return { ok: true };
}
