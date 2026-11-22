import { RotateCw, Trophy } from 'lucide-react';
import { CountryFlag, WinRecord } from '../types';
import { FlagAvatar } from './FlagAvatar';

interface VictoryOverlayProps {
  winner: CountryFlag;
  leaderboard: WinRecord[];
  countdown: number | null;
  autoRestart: boolean;
  onStartNextRound: () => void;
}

export function VictoryOverlay({
  winner,
  leaderboard,
  countdown,
  autoRestart,
  onStartNextRound,
}: VictoryOverlayProps) {
  const sorted = [...leaderboard]
    .sort((a, b) => b.wins - a.wins || b.lastWonAt - a.lastWonAt)
    .slice(0, 5);
  const winnerRecord = leaderboard.find((r) => r.id === winner.id);
  const winTotal = winnerRecord?.wins ?? 1;

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#040814]/78 px-5 py-6 backdrop-blur-[3px]">
      <div className="w-full max-w-[340px] rounded-2xl border border-amber-400/35 bg-[#091124]/95 p-5 text-center shadow-[0_0_50px_rgba(250,204,21,0.18)]">
        {/* Victory Header */}
        <div className="flex items-center justify-center gap-2 text-amber-400">
          <Trophy className="h-5 w-5" />
          <span className="font-display text-2xl font-extrabold tracking-[0.14em] uppercase">
            Victory
          </span>
          <Trophy className="h-5 w-5" />
        </div>

        {/* Champion Flag & Name */}
        <div className="mt-4 flex flex-col items-center">
          <div className="rounded-full p-1 ring-2 ring-amber-400/80 shadow-[0_0_28px_rgba(250,204,21,0.45)]">
            <FlagAvatar
              imageUrl={winner.imageUrl}
              code={winner.code}
              name={winner.name}
              fallbackColor={winner.fallbackColor}
              size="xl"
            />
          </div>
          <h3 className="mt-3 font-display text-3xl font-bold tracking-wide text-white">
            {winner.name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-amber-300/90 tabular-nums">
            Last Flag Standing · {winTotal} {winTotal === 1 ? 'Total Win' : 'Total Wins'}
          </p>
        </div>

        {/* Top Champions Win Leaderboard */}
        {sorted.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-3 text-left">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span>Top Champions</span>
              <span>Wins</span>
            </div>
            <ol className="space-y-1">
              {sorted.map((entry, idx) => {
                const isWinner = entry.id === winner.id;
                return (
                  <li
                    key={entry.id}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                      isWinner
                        ? 'bg-amber-400/15 text-amber-100'
                        : 'bg-slate-950/60 text-slate-300'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                        {idx + 1}.
                      </span>
                      <FlagAvatar
                        imageUrl={entry.imageUrl}
                        code={entry.code}
                        name={entry.name}
                        fallbackColor={entry.fallbackColor}
                        size="xs"
                      />
                      <span className="truncate font-medium">{entry.name}</span>
                    </span>
                    <span className="shrink-0 font-mono font-bold text-amber-300 tabular-nums">
                      {entry.wins}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Auto-Restart 3-Second Countdown or Next Round CTA */}
        <div className="mt-4 flex flex-col items-center gap-2">
          {autoRestart && countdown !== null && (
            <p className="font-mono text-xs font-semibold text-cyan-300 tabular-nums">
              Next round starting in {countdown}s...
            </p>
          )}
          <button
            type="button"
            onClick={onStartNextRound}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300"
          >
            <RotateCw className="h-4 w-4" />
            <span>{autoRestart ? 'Start Next Round Now' : 'Play Next Round'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
