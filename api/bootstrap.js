import { buildResults, getSupabase, normalizeDeviceId, readContestants } from "./_shared.js";

export default async function handler(req, res) {
  try {
    const deviceId = normalizeDeviceId(req.query?.deviceId ?? "");
    const contestants = await readContestants();
    const supabase = getSupabase();

    const { data: votes, error } = await supabase
      .from("votes")
      .select("device_id, allocations, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    res.status(200).json({
      festival: {
        title: "Synthetic Union - A Eurovision-inspired Music Festival",
        subtitle:
          "31 Fantasielaender, 31 Songs, ein gemeinsames ESC-inspiriertes Voting. Die Streaming-Links koennen spaeter noch ergaenzt werden.",
        rulesHint: "1, 2, 3, 4, 5, 6, 7, 8, 10, 12"
      },
      contestants,
      results: buildResults(contestants, votes ?? []),
      hasVoted: deviceId ? (votes ?? []).some((vote) => vote.device_id === deviceId) : false
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Die Voting-Daten konnten nicht geladen werden."
    });
  }
}
