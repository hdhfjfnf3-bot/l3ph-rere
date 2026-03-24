import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGame } from '../context/GameContext';
import type { Player } from '../types/game.types';
import { PlayerAvatar } from './HomePage';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function FinalScoresPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { dispatch } = useGame();
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data: r } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
      if (r) dispatch({ type: 'SET_ROOM', payload: r });
      if (r?.id) {
        const { data: ps } = await supabase.from('players').select('*').eq('room_id', r.id).order('score', { ascending: false });
        if (ps) setPlayers(ps);
      }
    })();
  }, [code]);

  const winner = players[0];

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="container container--narrow" style={{ textAlign: 'center' }}>
        {/* Winner */}
        {winner && (
          <div className="animate-scale-in" style={{ marginBottom: 'var(--space-2xl)' }}>
            <div style={{ fontSize: 80, marginBottom: 'var(--space-md)', animation: 'bus-pulse 2s infinite' }}>🏆</div>
            <h1 style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 8 }}>
              {winner.name} يفوز!
            </h1>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--bus-gold)' }}>
              {winner.score} نقطة
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="card card--elevated animate-fade-in" style={{ marginBottom: 'var(--space-xl)' }}>
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>🏅 لوحة المتصدرين</h3>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {players.map((p, i) => (
              <div
                key={p.id}
                className="player-card"
                style={{
                  padding: 'var(--space-md)',
                  background: i === 0 ? 'rgba(255, 209, 102, 0.08)' : 'var(--bg-card)',
                  borderColor: i === 0 ? 'rgba(255, 209, 102, 0.3)' : 'var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 28, width: 40, textAlign: 'center' }}>
                  {MEDALS[i] || `${i + 1}.`}
                </div>
                <PlayerAvatar name={p.name} index={i} size={40} />
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{p.name}</div>
                </div>
                <div style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 900,
                  color: i === 0 ? 'var(--bus-gold)' : 'var(--text-primary)',
                }}>
                  {p.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
          <button className="btn btn--primary btn--lg" onClick={() => navigate('/')}>
            🏠 العودة للرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}
