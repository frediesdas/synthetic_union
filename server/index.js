import cors from "cors";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3001;
const POINT_VALUES = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contestantsFile = path.resolve(__dirname, "../data/contestants.json");
const votesFile = path.resolve(__dirname, "./data/votes.json");

let writeQueue = Promise.resolve();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function createBreakdown() {
  return Object.fromEntries(POINT_VALUES.map((points) => [String(points), 0]));
}

function normalizeDeviceId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 120);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function readContestants() {
  return readJson(contestantsFile, []);
}

async function readVotes() {
  return readJson(votesFile, []);
}

async function writeVotes(votes) {
  const payload = JSON.stringify(votes, null, 2);
  writeQueue = writeQueue.catch(() => undefined).then(() => fs.writeFile(votesFile, payload, "utf8"));
  return writeQueue;
}

function hasValidAllocations(allocations, contestants) {
  if (!Array.isArray(allocations) || allocations.length !== POINT_VALUES.length) {
    return false;
  }

  const validIds = new Set(contestants.map((contestant) => contestant.id));
  const seenIds = new Set();
  const seenPoints = new Set();

  for (const allocation of allocations) {
    if (!allocation || typeof allocation !== "object") {
      return false;
    }

    const { entryId, points } = allocation;
    if (!validIds.has(entryId) || seenIds.has(entryId)) {
      return false;
    }

    if (!POINT_VALUES.includes(points) || seenPoints.has(points)) {
      return false;
    }

    seenIds.add(entryId);
    seenPoints.add(points);
  }

  return POINT_VALUES.every((points) => seenPoints.has(points));
}

function sortLeaderboard(left, right) {
  if (right.totalPoints !== left.totalPoints) {
    return right.totalPoints - left.totalPoints;
  }

  for (const points of POINT_VALUES) {
    const diff = (right.breakdown[String(points)] || 0) - (left.breakdown[String(points)] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return left.startNumber - right.startNumber;
}

function buildResults(contestants, votes) {
  const scoreboard = contestants.map((contestant) => ({
    ...contestant,
    rank: 0,
    totalPoints: 0,
    votesReceived: 0,
    breakdown: createBreakdown()
  }));

  const byId = new Map(scoreboard.map((entry) => [entry.id, entry]));

  for (const vote of votes) {
    for (const allocation of vote.allocations || []) {
      const current = byId.get(allocation.entryId);
      if (!current) {
        continue;
      }

      current.totalPoints += allocation.points;
      current.votesReceived += 1;
      current.breakdown[String(allocation.points)] += 1;
    }
  }

  const leaderboard = scoreboard.sort(sortLeaderboard).map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));

  return {
    totalVotes: votes.length,
    totalPointsAwarded: votes.length * 58,
    updatedAt: votes.length ? votes[votes.length - 1].createdAt : null,
    leaderboard
  };
}

app.get("/api/bootstrap", async (req, res) => {
  try {
    const contestants = await readContestants();
    const votes = await readVotes();
    const deviceId = normalizeDeviceId(req.query.deviceId);

    res.json({
      festival: {
        title: "Synthetic Union - A Eurovision-inspired Music Festival",
        subtitle:
          "31 Fantasielaender, 31 Songs, ein gemeinsames ESC-inspiriertes Voting. Die Streaming-Links koennen spaeter noch ergaenzt werden.",
        rulesHint: "1, 2, 3, 4, 5, 6, 7, 8, 10, 12"
      },
      contestants,
      results: buildResults(contestants, votes),
      hasVoted: deviceId ? votes.some((vote) => vote.deviceId === deviceId) : false
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Die Voting-Daten konnten nicht geladen werden."
    });
  }
});

app.post("/api/votes", async (req, res) => {
  try {
    const contestants = await readContestants();
    const votes = await readVotes();

    const deviceId = normalizeDeviceId(req.body?.deviceId);
    const allocations = req.body?.allocations;

    if (!deviceId) {
      return res.status(400).json({ error: "Keine gueltige Geraete-ID gefunden." });
    }

    if (!hasValidAllocations(allocations, contestants)) {
      return res.status(400).json({
        error: "Die Punkte muessen genau einmal als 1, 2, 3, 4, 5, 6, 7, 8, 10 und 12 vergeben werden."
      });
    }

    if (votes.some((vote) => vote.deviceId === deviceId)) {
      return res.status(409).json({
        error: "Dieses Geraet hat bereits abgestimmt.",
        hasVoted: true,
        results: buildResults(contestants, votes)
      });
    }

    const nextVote = {
      deviceId,
      allocations: allocations
        .slice()
        .sort((left, right) => right.points - left.points)
        .map((allocation) => ({
          entryId: allocation.entryId,
          points: allocation.points
        })),
      createdAt: new Date().toISOString()
    };

    votes.push(nextVote);
    await writeVotes(votes);

    return res.status(201).json({
      hasVoted: true,
      results: buildResults(contestants, votes)
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Die Stimme konnte nicht gespeichert werden."
    });
  }
});

app.listen(port, () => {
  console.log(`Voting server listening on http://localhost:${port}`);
});
