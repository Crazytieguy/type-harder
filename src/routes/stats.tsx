import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Award, ChevronDown, ChevronUp, ExternalLink, TrendingUp, User } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { renderMarkdown } from "../utils/markdown";

export const Route = createFileRoute("/stats")({
  loader: async ({ context: { queryClient } }) => {
    const statsQueryOptions = convexQuery(api.stats.getUserStats, {});
    return await queryClient.ensureQueryData(statsQueryOptions);
  },
  component: StatsPage,
});

function StatsPage() {
  const statsQueryOptions = convexQuery(api.stats.getUserStats, {});
  const { data } = useSuspenseQuery(statsQueryOptions);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  if (!data) {
    return (
      <div className="text-center">
        <h1>Loading Stats...</h1>
      </div>
    );
  }

  const { user, stats } = data;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h1>Personal Statistics</h1>
        <div className="flex items-center justify-center gap-3 mt-4">
          {user.avatarUrl && (
            <div className="avatar">
              <div className="w-12 rounded-full overflow-hidden">
                <img src={user.avatarUrl} alt={user.name} />
              </div>
            </div>
          )}
          <p className="text-xl opacity-70">{user.name}</p>
        </div>
      </div>

      <div className="not-prose">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card bg-base-200">
            <div className="card-body">
              <div className="flex items-center gap-3">
                <Activity className="w-8 h-8 text-primary" />
                <div>
                  <div className="text-3xl font-bold">{stats.totalRaces}</div>
                  <div className="text-sm opacity-70">Total Races</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card bg-base-200">
            <div className="card-body">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-success" />
                <div>
                  <div className="text-3xl font-bold">{stats.averageWpm}</div>
                  <div className="text-sm opacity-70">Average WPM</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card bg-base-200">
            <div className="card-body">
              <div className="flex items-center gap-3">
                <Award className="w-8 h-8 text-warning" />
                <div>
                  <div className="text-3xl font-bold">{stats.bestWpm}</div>
                  <div className="text-sm opacity-70">Best WPM</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Races */}
        {stats.recentRaces.length > 0 ? (
          <div className="card bg-base-200">
            <div className="card-body">
              <h2 className="card-title mb-4">Recent Races</h2>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>WPM</th>
                      <th>Rank</th>
                      <th>Words</th>
                      <th>Article</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentRaces.map((race, idx) => {
                      const date = new Date(race.finishedAt);
                      const isPersonalBest = race.wpm === stats.bestWpm;
                      const isExpanded = expandedRows.has(idx);
                      
                      return (
                        <>
                          <tr key={idx} className={`${isPersonalBest ? "bg-warning/10" : ""} cursor-pointer hover:bg-base-300`}
                              onClick={() => {
                                const newExpanded = new Set(expandedRows);
                                if (isExpanded) {
                                  newExpanded.delete(idx);
                                } else {
                                  newExpanded.add(idx);
                                }
                                setExpandedRows(newExpanded);
                              }}>
                            <td>
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                <div>
                                  <div className="text-sm">
                                    {date.toLocaleDateString()}
                                  </div>
                                  <div className="text-xs opacity-70">
                                    {date.toLocaleTimeString()}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${isPersonalBest ? "text-warning" : ""}`}>
                                  {race.wpm}
                                </span>
                                {isPersonalBest && (
                                  <span className="badge badge-warning badge-sm">PB</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={race.rank === 1 ? "font-bold text-warning" : ""}>
                                #{race.rank}
                              </span>
                              <span className="text-sm opacity-70"> / {race.totalPlayers}</span>
                            </td>
                            <td>{race.wordCount}</td>
                            <td className="max-w-xs truncate">{race.articleTitle}</td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${idx}-expanded`}>
                              <td colSpan={5} className="bg-base-100">
                                <div className="p-4 space-y-3">
                                  <div className="text-sm opacity-70">
                                    <span className="font-medium">From:</span> {race.bookTitle} → {race.sequenceTitle}
                                  </div>
                                  <div className="text-sm font-mono leading-relaxed bg-base-200 p-3 rounded">
                                    {renderMarkdown(race.paragraphContent)}
                                  </div>
                                  <div>
                                    <a
                                      href={race.articleUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="link link-primary text-sm inline-flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      View original article
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="card bg-base-200">
            <div className="card-body text-center">
              <User className="w-16 h-16 mx-auto text-base-content/30 mb-4" />
              <h2 className="card-title justify-center">No Races Yet</h2>
              <p className="opacity-70">
                Complete your first race to see your statistics here!
              </p>
              <Link to="/" className="btn btn-primary mt-4">
                Start Racing
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}