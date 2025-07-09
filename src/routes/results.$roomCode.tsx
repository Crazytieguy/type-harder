import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Clock, Zap } from "lucide-react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/results/$roomCode")({
  loader: async ({ context: { queryClient }, params: { roomCode } }) => {
    const queryOptions = convexQuery(api.games.getRoom, { roomCode });
    return await queryClient.ensureQueryData(queryOptions);
  },
  component: ResultsPage,
});

function ResultsPage() {
  const { roomCode } = Route.useParams();
  
  const roomQueryOptions = convexQuery(api.games.getRoom, { roomCode });
  const { data: room } = useSuspenseQuery(roomQueryOptions);

  if (!room || room.status !== "finished" || !room.paragraph || !room.startTime) {
    return (
      <div className="text-center">
        <h1>Results Not Available</h1>
        <p>This race hasn't finished yet or results are unavailable.</p>
        <Link to="/" className="btn btn-primary mt-4">Back to Home</Link>
      </div>
    );
  }

  // Calculate results for each player
  const results = room.players
    .filter(p => p.finishedAt)
    .map(player => {
      const raceDuration = (player.finishedAt! - room.startTime!) / 1000;
      const wpm = Math.round((room.paragraph!.wordCount / raceDuration) * 60);
      
      return {
        ...player,
        raceDuration,
        wpm,
      };
    })
    .sort((a, b) => a.raceDuration - b.raceDuration);

  const unfinishedPlayers = room.players.filter(p => !p.finishedAt);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1>Race Results</h1>
        <p className="text-xl opacity-70">Final standings for room {roomCode}</p>
      </div>

      <div className="not-prose">
        {/* Podium for top 3 */}
        {results.length > 0 && (
          <div className="card bg-base-200 mb-6">
            <div className="card-body">
              <h2 className="card-title justify-center mb-6">
                <Trophy className="w-6 h-6 text-warning" />
                Winners
              </h2>
              
              <div className="flex justify-center items-end gap-4 mb-6">
                {/* 2nd Place */}
                {results[1] && (
                  <div className="text-center">
                    <div className="bg-base-300 rounded-t-lg px-6 py-4 h-24 flex flex-col justify-end">
                      <div className="text-3xl mb-1">🥈</div>
                      <div className="font-medium">{results[1].name}</div>
                      <div className="text-sm opacity-70">{results[1].wpm} WPM</div>
                    </div>
                  </div>
                )}
                
                {/* 1st Place */}
                {results[0] && (
                  <div className="text-center">
                    <div className="bg-warning/20 rounded-t-lg px-6 py-4 h-32 flex flex-col justify-end border-2 border-warning">
                      <div className="text-4xl mb-1">🥇</div>
                      <div className="font-bold text-lg">{results[0].name}</div>
                      <div className="text-sm opacity-70">{results[0].wpm} WPM</div>
                    </div>
                  </div>
                )}
                
                {/* 3rd Place */}
                {results[2] && (
                  <div className="text-center">
                    <div className="bg-base-300 rounded-t-lg px-6 py-4 h-20 flex flex-col justify-end">
                      <div className="text-2xl mb-1">🥉</div>
                      <div className="font-medium text-sm">{results[2].name}</div>
                      <div className="text-xs opacity-70">{results[2].wpm} WPM</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Full Results Table */}
        <div className="card bg-base-200 mb-6">
          <div className="card-body">
            <h2 className="card-title">Complete Results</h2>
            
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>WPM</th>
                    <th>Time</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((player, index) => (
                    <tr key={player._id}>
                      <td>
                        <span className="font-bold">#{index + 1}</span>
                      </td>
                      <td>{player.name}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Zap className="w-4 h-4 text-primary" />
                          {player.wpm}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 opacity-70" />
                          {player.raceDuration.toFixed(1)}s
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-success">Finished</span>
                      </td>
                    </tr>
                  ))}
                  
                  {unfinishedPlayers.map((player) => (
                    <tr key={player._id} className="opacity-50">
                      <td>-</td>
                      <td>{player.name}</td>
                      <td>-</td>
                      <td>-</td>
                      <td>
                        <span className="badge">DNF</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Paragraph Info */}
        <div className="card bg-base-100 border border-base-300 mb-6">
          <div className="card-body">
            <h3 className="font-semibold mb-2">Race Text</h3>
            <p className="text-sm opacity-70 mb-3">
              From: {room.paragraph.bookTitle} → {room.paragraph.sequenceTitle} → {room.paragraph.articleTitle}
            </p>
            <p className="text-sm font-mono leading-relaxed">{room.paragraph.content}</p>
            <div className="text-sm opacity-70 mt-3">
              <div>Word count: {room.paragraph.wordCount}</div>
              <div className="mt-1">
                <a href={room.paragraph.articleUrl} target="_blank" rel="noopener noreferrer" className="link link-primary">
                  View original article
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4">
          <Link to="/" className="btn btn-primary">
            New Game
          </Link>
        </div>
      </div>
    </div>
  );
}