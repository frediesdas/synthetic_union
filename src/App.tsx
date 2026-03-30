import { useEffect, useMemo, useRef, useState } from "react";

const POINT_VALUES = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const POINT_SELECTION_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12] as const;
const DEVICE_STORAGE_KEY = "melodai-festivalen-device-id";
const LAST_VOTE_STORAGE_KEY = "melodai-festivalen-last-vote";
const ALBUM_URL = "https://distrokid.com/hyperfollow/frediesdas/synthetic-union";
const ALBUM_COVER_PATH = "/synthetic-union-cover.jpg";
const RELEASE_DATE = "01.04.2026";

type VotePoints = (typeof POINT_VALUES)[number];
type SectionTab = "overview" | "voting" | "results" | "participants" | "listen";

type Contestant = {
  id: string;
  startNumber: number;
  songTitle: string;
  artist: string;
  countryCode: string;
  countryName: string;
  flagPath: string;
  lyrics?: string;
  countryTeaser?: string;
  artistBio?: string;
  artistImagePath?: string | null;
  artistProfileImagePath?: string | null;
  artistImagePosition?: string;
};

type Allocation = {
  entryId: string;
  points: VotePoints;
};

type ResultEntry = Contestant & {
  rank: number;
  totalPoints: number;
  votesReceived: number;
  breakdown: Record<string, number>;
};

type Results = {
  totalVotes: number;
  totalPointsAwarded: number;
  updatedAt: string | null;
  leaderboard: ResultEntry[];
};

type FestivalInfo = {
  title: string;
  subtitle: string;
  rulesHint: string;
};

type BootstrapResponse = {
  festival: FestivalInfo;
  contestants: Contestant[];
  results: Results;
  hasVoted: boolean;
};

const SECTION_ITEMS: Array<{ id: SectionTab; label: string }> = [
  { id: "overview", label: "Zur Übersicht" },
  { id: "voting", label: "Jetzt abstimmen" },
  { id: "results", label: "Voting-Ergebnisse" },
  { id: "participants", label: "Alle Acts" },
  { id: "listen", label: "Album hören" }
];

function getOrCreateDeviceId() {
  if (typeof window === "undefined") {
    return "preview-device";
  }

  const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const fallback = `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const nextId =
    typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : fallback;

  window.localStorage.setItem(DEVICE_STORAGE_KEY, nextId);
  return nextId;
}

function loadStoredVote() {
  if (typeof window === "undefined") {
    return [] as Allocation[];
  }

  const raw = window.localStorage.getItem(LAST_VOTE_STORAGE_KEY);
  if (!raw) {
    return [] as Allocation[];
  }

  try {
    const parsed = JSON.parse(raw) as Allocation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistStoredVote(vote: Allocation[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LAST_VOTE_STORAGE_KEY, JSON.stringify(vote));
}

function formatPoints(points: number) {
  return `${points} ${points === 1 ? "Punkt" : "Punkte"}`;
}

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) {
    return "Noch keine Stimmen abgegeben";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(updatedAt));
}

function formatStartNumber(startNumber: number) {
  return String(startNumber).padStart(2, "0");
}

function getPortraitImagePath(startNumber: number) {
  return `/artists-portrait/entry-${formatStartNumber(startNumber)}.jpg`;
}

function getArtistInitials(artist: string) {
  const parts = artist
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");

  return parts.join("") || artist.slice(0, 2).toUpperCase();
}

function ArtistArtwork({
  contestant,
  variant = "card"
}: {
  contestant: Contestant;
  variant?: "card" | "detail";
}) {
  const imagePath =
    variant === "detail"
      ? contestant.artistProfileImagePath ?? contestant.artistImagePath
      : contestant.artistImagePath;

  if (imagePath) {
    return (
      <img
        alt={`Artistbild von ${contestant.artist}`}
        className={variant === "detail" ? "detail-art-image" : "participant-image"}
        src={imagePath}
        style={{
          objectPosition:
            contestant.artistImagePosition ??
            (variant === "detail" ? "center 18%" : "center bottom")
        }}
      />
    );
  }

  return (
    <div
      aria-label={`Platzhalter fuer ${contestant.artist}`}
      className={variant === "detail" ? "detail-art-placeholder" : "participant-placeholder"}
      role="img"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(9, 6, 24, 0.18), rgba(9, 6, 24, 0.72)), url(${contestant.flagPath})`
      }}
    >
      <span>{getArtistInitials(contestant.artist)}</span>
    </div>
  );
}

export default function App() {
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [festival, setFestival] = useState<FestivalInfo | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionTab>("overview");
  const [allocations, setAllocations] = useState<Record<string, VotePoints | undefined>>({});
  const [storedVote, setStoredVote] = useState<Allocation[]>(() => loadStoredVote());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedContestantId, setSelectedContestantId] = useState<string | null>(null);
  const [openDetailSection, setOpenDetailSection] = useState<
    "bio" | "country" | "lyrics" | null
  >(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBootstrap() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/bootstrap?deviceId=${encodeURIComponent(deviceId)}`, {
          signal: controller.signal
        });
        const data = (await response.json()) as BootstrapResponse | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in data && data.error ? data.error : "Daten konnten nicht geladen werden."
          );
        }

        const payload = data as BootstrapResponse;

        setFestival(payload.festival);
        setContestants(payload.contestants);
        setResults(payload.results);
        setHasVoted(payload.hasVoted);
        setActiveSection("overview");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setError(err instanceof Error ? err.message : "Die App konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    void loadBootstrap();

    return () => controller.abort();
  }, [deviceId]);

  useEffect(() => {
    if (!selectedContestantId) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedContestantId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedContestantId]);

  useEffect(() => {
    const isModalOpen = Boolean(selectedContestantId || selectedResultId);
    document.body.classList.toggle("modal-open", isModalOpen);
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [selectedContestantId, selectedResultId]);

  const contestantMap = useMemo(
    () => new Map(contestants.map((contestant) => [contestant.id, contestant])),
    [contestants]
  );

  const resultsById = useMemo(
    () => new Map((results?.leaderboard ?? []).map((entry) => [entry.id, entry])),
    [results?.leaderboard]
  );

  const assignedEntries = useMemo(() => {
    return Object.entries(allocations)
      .filter(([, points]) => typeof points === "number")
      .map(([entryId, points]) => ({
        entryId,
        points: points as VotePoints,
        contestant: contestantMap.get(entryId)
      }))
      .filter((item) => item.contestant)
      .sort((left, right) => right.points - left.points);
  }, [allocations, contestantMap]);

  const pointAssignments = useMemo(() => {
    return new Map(assignedEntries.map((entry) => [entry.points, entry.entryId]));
  }, [assignedEntries]);

  const remainingPoints = useMemo(() => {
    return POINT_SELECTION_ORDER.filter((points) => !pointAssignments.has(points));
  }, [pointAssignments]);

  const submittedVoteDetails = useMemo(() => {
    return storedVote
      .map((allocation) => ({
        ...allocation,
        contestant: contestantMap.get(allocation.entryId)
      }))
      .filter((item) => item.contestant)
      .sort((left, right) => right.points - left.points);
  }, [contestantMap, storedVote]);

  const selectedIds = useMemo(() => {
    return new Set(assignedEntries.map((entry) => entry.entryId));
  }, [assignedEntries]);

  const submittedIds = useMemo(() => {
    return new Set(storedVote.map((entry) => entry.entryId));
  }, [storedVote]);

  const canSubmit = remainingPoints.length === 0 && assignedEntries.length === POINT_VALUES.length;
  const leaderboard = results?.leaderboard ?? [];
  const podium = leaderboard.slice(0, 3);
  const selectedContestant = selectedContestantId ? contestantMap.get(selectedContestantId) : null;
  const selectedContestantResult = selectedContestant
    ? resultsById.get(selectedContestant.id)
    : null;
  const selectedResult = selectedResultId ? resultsById.get(selectedResultId) : null;
  const highlightedParticipants = useMemo(() => contestants.slice(0, 8), [contestants]);
  const isOverview = activeSection === "overview";
  const isVoting = activeSection === "voting";
  const activeSectionLabel =
    SECTION_ITEMS.find((section) => section.id === activeSection)?.label ?? "Synthetic Union";

  function handleSectionSelect(section: SectionTab) {
    if (section === "listen") {
      window.open(ALBUM_URL, "_blank", "noreferrer");
      return;
    }
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePointSelect(entryId: string, points: VotePoints) {
    if (hasVoted) {
      return;
    }

    const next = { ...allocations };
    const currentPoints = next[entryId];

    if (currentPoints === points) {
      delete next[entryId];
      setAllocations(next);
      return;
    }

    Object.entries(next).forEach(([currentEntryId, currentValue]) => {
      if (currentValue === points && currentEntryId !== entryId) {
        delete next[currentEntryId];
      }
    });

    next[entryId] = points;
    setAllocations(next);
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) {
      return;
    }

    const vote = assignedEntries.map((entry) => ({
      entryId: entry.entryId,
      points: entry.points
    }));

    try {
      setSubmitting(true);
      setError("");

      const response = await fetch("/api/votes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          deviceId,
          allocations: vote
        })
      });

      const data = (await response.json()) as
        | {
            error?: string;
            results?: Results;
            hasVoted?: boolean;
          }
        | {
            results: Results;
            hasVoted: boolean;
          };

      if (!response.ok) {
        if ("results" in data && data.results) {
          setResults(data.results);
        }
        if ("hasVoted" in data && data.hasVoted) {
          setHasVoted(true);
          setActiveSection("overview");
        }
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Die Stimme konnte nicht gespeichert werden."
        );
      }

      const payload = data as { results: Results; hasVoted: boolean };

      setResults(payload.results);
      setHasVoted(payload.hasVoted);
      setStoredVote(vote);
      persistStoredVote(vote);
      setActiveSection("overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Stimme konnte nicht gespeichert werden.");
    } finally {
      setSubmitting(false);
    }
  }

  function openContestantDetails(entryId: string) {
    setSelectedContestantId(entryId);
  }

  function closeContestantDetails() {
    setSelectedContestantId(null);
    setOpenDetailSection(null);
  }

  function toggleDetailSection(section: "bio" | "country" | "lyrics") {
    setOpenDetailSection((current) => (current === section ? null : section));
  }

  function closeResultDetails() {
    setSelectedResultId(null);
  }

  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left" />
      <div className="background-glow background-glow-right" />

      {isOverview && (
        <header className="hero">
          <div className="hero-backdrop" />
          <div className="hero-content">
            <div className="hero-copy">
              <h1>Synthetic Union</h1>
              <p className="hero-subtitle">A Eurovision-inspired Music Festival</p>
              <p className="hero-text">
                Hör alle Songs, lerne die Artists kennen
                <br />
                und stimm für deine Favoriten ab.
              </p>

              <div className="hero-primary-actions">
                <button
                  className="primary-button hero-cta-button"
                  onClick={() => handleSectionSelect("voting")}
                  type="button"
                >
                  Jetzt abstimmen
                </button>
                <button
                  className="secondary-button"
                  onClick={() => handleSectionSelect("participants")}
                  type="button"
                >
                  Alle Acts ansehen
                </button>
                <button
                  className="secondary-button"
                  onClick={() => handleSectionSelect("results")}
                  type="button"
                >
                  Voting-Ergebnisse
                </button>
              </div>

            </div>

            <div className="hero-stats">
              <a className="stat-card album-card album-card-large" href={ALBUM_URL} target="_blank" rel="noreferrer">
                <div className="album-card-copy">
                  <strong className="album-title">Synthetic Union</strong>
                  <p className="album-description">
                    Höre das Album auf der Streaming-Plattform deiner Wahl an.
                    <br />
                    Über diesen Link findest du alle verfügbaren Plattformen.
                  </p>
                </div>
                <img
                  className="album-cover"
                  src={ALBUM_COVER_PATH}
                  alt="Synthetic Union Albumcover"
                />
                <span className="album-link album-link-below">Zum Album</span>
              </a>
            </div>
          </div>
        </header>
      )}

      <main className={`content ${isOverview ? "" : "content-compact"} ${isVoting ? "content-voting" : ""}`}>
        {error && <div className="notice notice-error">{error}</div>}

        {hasVoted && (
          <div className="notice notice-success">
            Dieses Gerät hat bereits abgestimmt. Du kannst dir jederzeit die Acts und die
            Gesamtwertung ansehen.
          </div>
        )}

        {!isOverview && (
          <section className="compact-nav-shell panel">
            <div className="compact-nav-copy">
              <p className="panel-kicker compact-nav-kicker">Synthetic Union</p>
              <h2>{activeSectionLabel}</h2>
            </div>

            <nav aria-label="Bereiche" className="compact-section-nav">
              {SECTION_ITEMS.map((section) => (
                <button
                  className={`tab-button ${activeSection === section.id ? "is-active" : ""}`}
                  key={`compact-${section.id}`}
                  onClick={() => handleSectionSelect(section.id)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </section>
        )}


        {activeSection === "voting" && (
        <section className="section-block">
            <div className="section-heading voting-heading">
              <div>
                <h2>Verteile deine ESC-Punkte</h2>
              </div>
            </div>

          <section className="vote-layout">
            <aside className="panel summary-panel">
              <div className="summary-header">
                <div>
                  <p className="panel-kicker">Deine Wertung</p>
                  <h2>Punkteübersicht</h2>
                </div>
                <span className="summary-count">
                  {assignedEntries.length}/{POINT_VALUES.length}
                </span>
              </div>

              <div className="selected-list">
                {assignedEntries.length === 0 && <p className="muted">Noch keine Punkte vergeben.</p>}

                {assignedEntries.map((entry) => (
                  <div className="selected-item" key={entry.entryId}>
                    <span className="selected-points">{formatPoints(entry.points)}</span>
                    <div>
                      <strong>{entry.contestant?.countryName}</strong>
                      <p>
                        {entry.contestant?.songTitle}
                        {" · "}
                        {entry.contestant?.artist}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="primary-button"
                disabled={!canSubmit || hasVoted || submitting || loading}
                onClick={handleSubmit}
                type="button"
              >
                {submitting ? "Stimme wird gespeichert..." : "Stimme verbindlich abgeben"}
              </button>

              <p className="panel-footnote">
                {hasVoted
                  ? "Dieses Gerät hat schon abgestimmt."
                  : remainingPoints.length === 0
                    ? "Perfekt: Alle zehn Punktwerte sind vergeben."
                    : `Noch offen: ${remainingPoints.join(", ")}`}
              </p>
            </aside>

            <section className="contestants-panel">
              {loading ? (
                <div className="empty-state">
                  <h3>Daten werden geladen</h3>
                  <p>Die Songliste wird vorbereitet.</p>
                </div>
              ) : (
                <div className="contestant-grid">
                  {contestants.map((contestant) => {
                    const currentValue = allocations[contestant.id];
                    const isSelected = selectedIds.has(contestant.id);

                    return (
                      <article
                        className={`contestant-card ${isSelected ? "is-selected" : ""}`}
                        key={contestant.id}
                      >
                        <div className="flag-stage">
                          <img
                            alt={`Artistbild ${contestant.artist}`}
                            className="flag-banner"
                            src={contestant.artistImagePath ?? contestant.flagPath}
                            style={{
                              objectPosition: contestant.artistImagePosition ?? "center 20%"
                            }}
                          />
                          <div className="flag-overlay">
                            <div className="card-header flag-topline">
                              <span className="start-number">
                                {formatStartNumber(contestant.startNumber)}
                              </span>
                            </div>

                            <div className="overlay-copy">
                              <h3 className="artist-headline">{contestant.artist}</h3>
                            </div>
                          </div>
                        </div>

                        <div className="card-body">
                          <div className="card-info-row">
                            <div className="info-chip music-chip">
                              <span aria-hidden="true" className="chip-icon">
                                ♪
                              </span>
                              <span>{contestant.songTitle}</span>
                            </div>
                            <div className="info-chip country-chip">
                              <img
                                alt={`Flagge ${contestant.countryName}`}
                                className="chip-flag"
                                src={contestant.flagPath}
                              />
                              <span>{contestant.countryName}</span>
                            </div>
                          </div>
                          <div className="points-field">
                            <span>Punkte vergeben</span>
                            <div
                              aria-label={`Punkte fuer ${contestant.countryName}`}
                              className="point-buttons"
                              role="group"
                            >
                              {POINT_SELECTION_ORDER.map((points) => {
                                const takenBy = pointAssignments.get(points);
                                const takenByName =
                                  takenBy && takenBy !== contestant.id
                                    ? contestantMap.get(takenBy)?.countryName
                                    : "";
                                const isTakenByOther = Boolean(takenBy && takenBy !== contestant.id);
                                const isActive = currentValue === points;

                                return (
                                  <button
                                    aria-label={
                                      isTakenByOther && takenByName
                                        ? `${points} Punkte, bereits vergeben an ${takenByName}`
                                        : `${points} Punkte vergeben`
                                    }
                                    className={`point-button ${isActive ? "is-active" : ""} ${isTakenByOther ? "is-taken" : ""}`}
                                    disabled={hasVoted}
                                    key={points}
                                    onClick={() => handlePointSelect(contestant.id, points)}
                                    title={
                                      isTakenByOther && takenByName
                                        ? `${points} Punkte, bereits vergeben an ${takenByName}`
                                        : `${points} Punkte`
                                    }
                                    type="button"
                                  >
                                    {points}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="card-footer card-footer-actions is-centered">
                            <button
                              className="secondary-button"
                              onClick={() => openContestantDetails(contestant.id)}
                              type="button"
                            >
                              Zum Artist
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        </section>
        )}

        {activeSection === "results" && (
        <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Aktuelle Punktevergabe</h2>
                <p>Klicke auf ein Land und sieh, wie sich die Punkte zusammensetzen.</p>
              </div>
            </div>

          <section className="results-layout">
            <section className="panel">
              {leaderboard.length === 0 ? (
                <div className="empty-state compact">
                  <p>Hier erscheint die ESC-Tabelle nach den ersten Stimmen.</p>
                </div>
              ) : (
                <div className="results-list">
                  {leaderboard.map((entry) => (
                    <button
                      className={`results-row ${submittedIds.has(entry.id) ? "is-your-pick" : ""}`}
                      key={entry.id}
                      onClick={() => setSelectedResultId(entry.id)}
                      type="button"
                    >
                      <span className="results-rank">{entry.rank}</span>
                      <span className="results-country">
                        <img
                          alt={`Flagge ${entry.countryName}`}
                          className="flag-inline"
                          src={entry.flagPath}
                        />
                        <span>
                          <strong>{entry.countryName}</strong>
                          <span className="results-code">{entry.countryCode}</span>
                        </span>
                      </span>
                      <span className="results-total">{entry.totalPoints}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="panel">
                <div className="panel-header-row">
                  <div>
                    <h2>So hast du gewertet</h2>
                  </div>
                </div>

              {submittedVoteDetails.length === 0 ? (
                  <div className="empty-state compact">
                    <p>Nach deiner Stimmabgabe wird deine persönliche Top 10 hier gezeigt.</p>
                  </div>
              ) : (
                <div className="selected-list">
                  {submittedVoteDetails.map((entry) => (
                    <div className="selected-item" key={`${entry.entryId}-${entry.points}`}>
                      <span className="selected-points">{formatPoints(entry.points)}</span>
                      <div>
                        <strong>{entry.contestant?.countryName}</strong>
                        <p>
                          {entry.contestant?.songTitle}
                          {" · "}
                          {entry.contestant?.artist}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </section>
        </section>
        )}

        {activeSection === "participants" && (
        <section className="section-block">
            <div className="section-heading">
              <div />
            </div>

          <section className="participants-grid">
            {contestants.map((contestant) => {
              return (
                <button
                  className="participant-card participant-card-button"
                  key={`participant-${contestant.id}`}
                  onClick={() => openContestantDetails(contestant.id)}
                  type="button"
                >
                  <div className="participant-media-wrap">
                    <div className="participant-media-shell">
                      <img
                        alt={`Artistbild von ${contestant.artist}`}
                        className="participant-image"
                        src={getPortraitImagePath(contestant.startNumber)}
                      />
                      <div className="participant-overlay">
                        <div className="participant-meta-top participant-meta-top-right">
                          <span className="participant-rank">
                            {formatStartNumber(contestant.startNumber)}
                          </span>
                        </div>

                        <div className="participant-copy">
                          <h3>{contestant.artist}</h3>
                          <div className="overlay-chips participant-overlay-chips">
                            <div className="info-chip music-chip">
                              <span aria-hidden="true" className="chip-icon">
                                ♪
                              </span>
                              <span>{contestant.songTitle}</span>
                            </div>
                            <div className="info-chip country-chip">
                              <img
                                alt={`Flagge ${contestant.countryName}`}
                                className="chip-flag"
                                src={contestant.flagPath}
                              />
                              <span>{contestant.countryName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="participant-footer">
                    <span className="participant-footer-link">Mehr zum Act</span>
                  </div>
                </button>
              );
            })}
          </section>
        </section>
        )}

        {activeSection === "listen" && (
        <section className="section-block">
            <div className="section-heading">
              <div>
              <p className="panel-kicker">Album hören</p>
              <h2>Alle Songs an einem Ort</h2>
            </div>
          </div>

          <section className="listen-card panel">
            <img
              alt="Synthetic Union Albumcover"
              className="listen-cover"
              src={ALBUM_COVER_PATH}
            />

            <div className="listen-copy">
              <p className="panel-kicker">Synthetic Union</p>
              <h3>Höre das komplette Album auf deinen Plattformen</h3>
              <p>
                Über den Hyperfollow-Link gelangen alle direkt zu den Streaming-Plattformen und
                können dann von dort wieder zurück ins Voting springen.
              </p>
              <div className="listen-actions">
                <a className="primary-button primary-link" href={ALBUM_URL} target="_blank" rel="noreferrer">
                  Zum Album
                </a>
              </div>
            </div>
          </section>
        </section>
        )}

        {activeSection === "voting" && !canSubmit && (
          <div className="vote-progress-dock">
            <div className="vote-progress-copy">
              <strong>
                {remainingPoints.length === 0
                  ? "Alle Punkte vergeben"
                  : `${remainingPoints.length} Punktefelder noch offen`}
              </strong>
              <p>
                {remainingPoints.length === 0
                  ? "Du kannst jetzt deine Stimme absenden."
                  : "Offene Punkte leuchten auf. Bereits genutzte Zahlen sind abgedunkelt."}
              </p>
            </div>

            <div className="vote-progress-points" aria-label="Status deiner Punktevergabe">
              {POINT_SELECTION_ORDER.map((points) => (
                <span
                  className={`progress-point ${pointAssignments.has(points) ? "is-used" : "is-open"}`}
                  key={points}
                >
                  {points}
                </span>
              ))}
            </div>
          </div>
        )}

        {activeSection === "voting" && canSubmit && (
          <div className="vote-submit-dock">
            <button
              className="primary-button"
              disabled={hasVoted || submitting || loading}
              onClick={handleSubmit}
              type="button"
            >
              {submitting ? "Stimme wird gespeichert..." : "Jetzt verbindlich abstimmen"}
            </button>
          </div>
        )}
      </main>

      {selectedContestant && (
        <div
          aria-modal="true"
          className="modal-backdrop"
          onClick={closeContestantDetails}
          role="dialog"
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              aria-label="Detailansicht schliessen"
              className="modal-close"
              onClick={closeContestantDetails}
              type="button"
            >
              ×
            </button>

            <div className="detail-hero">
              <img
                alt={`Artistbild von ${selectedContestant.artist}`}
                className="detail-art-image"
                src={getPortraitImagePath(selectedContestant.startNumber)}
                style={{ objectPosition: "center center" }}
              />
              <div className="detail-hero-overlay">
                <div className="detail-topline">
                  <span className="start-number">
                    {formatStartNumber(selectedContestant.startNumber)}
                  </span>
                </div>

                <div className="detail-copy">
                  <h2>{selectedContestant.artist}</h2>
                  <div className="info-chip music-chip detail-song-chip">
                    <span aria-hidden="true" className="chip-icon">
                      ♪
                    </span>
                    <span>{selectedContestant.songTitle}</span>
                  </div>
                  <div className="overlay-chips detail-chips">
                    <div className="info-chip country-chip">
                      <img
                        alt={`Flagge ${selectedContestant.countryName}`}
                        className="chip-flag"
                        src={selectedContestant.flagPath}
                      />
                      <span>{selectedContestant.countryName}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-body">
              <div className="detail-accordion">
                <button
                  className="detail-accordion-trigger"
                  onClick={() => toggleDetailSection("bio")}
                  type="button"
                >
                  Artist Bio
                  <span className={`accordion-caret ${openDetailSection === "bio" ? "is-open" : ""}`} aria-hidden="true">
                    ›
                  </span>
                </button>
                {openDetailSection === "bio" && (
                  <div className="detail-accordion-content">
                    <p>{selectedContestant.artistBio || "Mini-Bio folgt."}</p>
                  </div>
                )}

                <button
                  className="detail-accordion-trigger"
                  onClick={() => toggleDetailSection("country")}
                  type="button"
                >
                  Länderprofil
                  <span className={`accordion-caret ${openDetailSection === "country" ? "is-open" : ""}`} aria-hidden="true">
                    ›
                  </span>
                </button>
                {openDetailSection === "country" && (
                  <div className="detail-accordion-content">
                    <p>{selectedContestant.countryTeaser || "Country-Teaser folgt."}</p>
                  </div>
                )}

                <button
                  className="detail-accordion-trigger"
                  onClick={() => toggleDetailSection("lyrics")}
                  type="button"
                >
                  Songtext
                  <span className={`accordion-caret ${openDetailSection === "lyrics" ? "is-open" : ""}`} aria-hidden="true">
                    ›
                  </span>
                </button>
                {openDetailSection === "lyrics" && (
                  <div className="detail-accordion-content">
                    <div className="lyrics-text">
                      {selectedContestant.lyrics || "Lyrics folgen."}
                    </div>
                  </div>
                )}

                <button
                  className="detail-accordion-trigger detail-vote-button"
                  onClick={() => {
                    handleSectionSelect("voting");
                    closeContestantDetails();
                  }}
                  type="button"
                >
                  Jetzt abstimmen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedResult && (
        <div
          aria-modal="true"
          className="modal-backdrop"
          onClick={closeResultDetails}
          role="dialog"
        >
          <div className="modal-card results-modal" onClick={(event) => event.stopPropagation()}>
            <button
              aria-label="Detailansicht schliessen"
              className="modal-close"
              onClick={closeResultDetails}
              type="button"
            >
              ×
            </button>

            <div className="results-detail">
              <div className="results-detail-hero">
                <img
                  alt={`Artistbild von ${selectedResult.artist}`}
                  className="results-hero-image"
                  src={getPortraitImagePath(selectedResult.startNumber)}
                />
                <div className="results-hero-overlay">
                  <div className="results-hero-topline">
                    <span className="start-number">{formatStartNumber(selectedResult.rank)}</span>
                  </div>
                  <div className="results-hero-copy">
                    <h2>{selectedResult.artist}</h2>
                    <div className="info-chip music-chip">
                      <span aria-hidden="true" className="chip-icon">
                        ♪
                      </span>
                      <span>{selectedResult.songTitle}</span>
                    </div>
                    <div className="info-chip country-chip">
                      <img
                        alt={`Flagge ${selectedResult.countryName}`}
                        className="chip-flag"
                        src={selectedResult.flagPath}
                      />
                      <span>{selectedResult.countryName}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="results-detail-header">
                <span className="results-total">{selectedResult.totalPoints} Punkte</span>
              </div>

              <div className="results-breakdown">
                {POINT_VALUES.map((points) => (
                  <div className="breakdown-card" key={points}>
                    <span className="breakdown-points">{points}</span>
                    <span className="breakdown-count">
                      {selectedResult.breakdown[String(points)] ?? 0}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
