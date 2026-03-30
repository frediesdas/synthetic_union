import {
  buildResults,
  getSupabase,
  hasValidAllocations,
  normalizeDeviceId,
  parseJsonBody,
  readContestants
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseJsonBody(req) ?? {};
    const contestants = await readContestants();
    const deviceId = normalizeDeviceId(body.deviceId);
    const allocations = body.allocations;

    if (!deviceId) {
      return res.status(400).json({ error: "Keine gueltige Geraete-ID gefunden." });
    }

    if (!hasValidAllocations(allocations, contestants)) {
      return res.status(400).json({
        error: "Die Punkte muessen genau einmal als 1, 2, 3, 4, 5, 6, 7, 8, 10 und 12 vergeben werden."
      });
    }

    const supabase = getSupabase();

    const { data: existing, error: existingError } = await supabase
      .from("votes")
      .select("device_id")
      .eq("device_id", deviceId)
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if (existing && existing.length > 0) {
      const { data: votes } = await supabase
        .from("votes")
        .select("device_id, allocations, created_at")
        .order("created_at", { ascending: true });

      return res.status(409).json({
        error: "Dieses Geraet hat bereits abgestimmt.",
        hasVoted: true,
        results: buildResults(contestants, votes ?? [])
      });
    }

    const sortedAllocations = allocations
      .slice()
      .sort((left, right) => right.points - left.points)
      .map((allocation) => ({
        entryId: allocation.entryId,
        points: allocation.points
      }));

    const { error: insertError } = await supabase.from("votes").insert({
      device_id: deviceId,
      allocations: sortedAllocations,
      created_at: new Date().toISOString()
    });

    if (insertError) {
      throw insertError;
    }

    const { data: votes } = await supabase
      .from("votes")
      .select("device_id, allocations, created_at")
      .order("created_at", { ascending: true });

    return res.status(201).json({
      hasVoted: true,
      results: buildResults(contestants, votes ?? [])
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Die Stimme konnte nicht gespeichert werden."
    });
  }
}
