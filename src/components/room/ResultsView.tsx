import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Clock, RotateCcw, Trophy, Zap } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { RoomWithGame } from "../../types/room";
import { renderMarkdown } from "../../utils/markdown";

interface ResultsViewProps {
  room: RoomWithGame;
}

export default function ResultsView({ room: { roomCode, game, ...room } }: ResultsViewProps) {
  const playAgain = useMutation(api.games.playAgain);

  if (!game || game.status !== "finished" || !game.paragraph || !game.startTime) {
    return (
      <div className="text-center">
        <h1>Results Not Available</h1>
        <p>This race hasn't finished yet or results are unavailable.</p>
        <Link to="/" className="btn btn-primary mt-4">Back to Home</Link>
      </div>
    );
  }

  // Calculate results for each player
  const results = game.players
    .filter((p: any) => p.finishedAt)
    .map((player: any) => {
      const raceDuration = (player.finishedAt! - game.startTime) / 1000;
      const wpm = Math.round((game.paragraph.wordCount / raceDuration) * 60);
      
      return {
        ...player,
        raceDuration,
        wpm,
      };
    })
    .sort((a: any, b: any) => a.raceDuration - b.raceDuration);

  const unfinishedPlayers = game.players.filter((p: any) => !p.finishedAt);
  
  const isHost = room.currentUserId === room.hostId;
  
  const handlePlayAgain = async () => {
    try {
      await playAgain({ roomCode });
    } catch (err) {
      console.error("Failed to restart game:", err);
    }
  };

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
                  <div className="bg-base-300 rounded-lg px-6 py-4 text-center">
                    {results[1].avatarUrl && (
                      <div className="avatar mb-2">
                        <div className="w-16 rounded-full">
                          <img src={results[1].avatarUrl} alt={results[1].name} />
                        </div>
                      </div>
                    )}
                    <div className="text-3xl mb-2">🥈</div>
                    <div className="font-medium">{results[1].name}</div>
                    <div className="text-sm opacity-70 mt-1">{results[1].wpm} WPM</div>
                  </div>
                )}
                
                {/* 1st Place */}
                {results[0] && (
                  <div className="bg-warning/20 rounded-lg px-6 py-4 text-center border-2 border-warning">
                    {results[0].avatarUrl && (
                      <div className="avatar mb-2">
                        <div className="w-20 rounded-full ring ring-warning">
                          <img src={results[0].avatarUrl} alt={results[0].name} />
                        </div>
                      </div>
                    )}
                    <div className="text-4xl mb-2">🥇</div>
                    <div className="font-bold text-lg">{results[0].name}</div>
                    <div className="text-sm opacity-70 mt-1">{results[0].wpm} WPM</div>
                  </div>
                )}
                
                {/* 3rd Place */}
                {results[2] && (
                  <div className="bg-base-300 rounded-lg px-6 py-4 text-center">
                    {results[2].avatarUrl && (
                      <div className="avatar mb-2">
                        <div className="w-14 rounded-full">
                          <img src={results[2].avatarUrl} alt={results[2].name} />
                        </div>
                      </div>
                    )}
                    <div className="text-2xl mb-2">🥉</div>
                    <div className="font-medium text-sm">{results[2].name}</div>
                    <div className="text-xs opacity-70 mt-1">{results[2].wpm} WPM</div>
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
                  {results.map((player: any, index: number) => (
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
                  
                  {unfinishedPlayers.map((player: any) => (
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
              From: {game.paragraph.bookTitle} → {game.paragraph.sequenceTitle} → {game.paragraph.articleTitle}
            </p>
            <div className="text-sm font-mono leading-relaxed">{renderMarkdown(game.paragraph.content)}</div>
            <div className="text-sm opacity-70 mt-3">
              <div>Word count: {game.paragraph.wordCount}</div>
              <div className="mt-1">
                <a href={game.paragraph.articleUrl} target="_blank" rel="noopener noreferrer" className="link link-primary">
                  View original article
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4">
          {isHost && (
            <button 
              onClick={() => void handlePlayAgain()} 
              className="btn btn-primary"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </button>
          )}
          <Link to="/" className="btn btn-outline">
            New Game
          </Link>
        </div>
      </div>
    </div>
  );
}