export async function ensureUserRecord(admin, user) {
  if (!admin || !user?.id) return;

  const { error } = await admin.from("users").upsert({
    id: user.id,
    email: user.email || `${user.id}@placeholder.local`,
  }, {
    onConflict: "id",
  });

  if (error) throw error;
}
