import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

export const POINT_VALUES = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contestantsFile = path.resolve(__dirname, "../data/contestants.json");

function createBreakdown() {
  return Object.fromEntries(POINT_VALUES.map((points) => [String(points), 0]));
}

export function normalizeDeviceId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 120);
}

export async function readContestants() {
  const raw = await fs.readFile(contestantsFile, "utf8");
  return JSON.parse(raw);
}

export function hasValidAllocations(allocations, contestants) {
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

export function buildResults(contestants, votes) {
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

  const leaderboard = scoreboard
    .sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) {
        return right.totalPoints - left.totalPoints;
      }

      for (const points of POINT_VALUES) {
        const diff =
          (right.breakdown[String(points)] || 0) - (left.breakdown[String(points)] || 0);
        if (diff !== 0) {
          return diff;
        }
      }

      return left.startNumber - right.startNumber;
    })
    .map((entry, index) => ({
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

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export function parseJsonBody(req) {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  return req.body;
}
