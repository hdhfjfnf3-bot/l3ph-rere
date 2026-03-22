import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { supabase } from '../lib/supabase';
import { getSessionId, getRandomLetter } from '../lib/game-logic';
import type { Player } from '../types/game.types';
import { PlayerAvatar } from './HomePage';

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useGame();

  const [players, setPlayers] = useState<Player[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const sessionId = getSessionId();
  const isHost = state.currentPlayer?.is_host || state.room?.host_id === sessionId;

  // Load room and players on mount
  useEffect(() => {
    if (!code) return;

    (async () => {
      // Load room if not yet in context
      if (!state.room) {
        const { data: room } = await supabase.from('rooms').select('*').eq('code', code).single();
        if (room) dispatch({ type: 'SET_ROOM', payload: room });
      }

      // Load players
      const { data: ps } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', state.room?.id || '')
        .order('joined_at');
      if (ps) setPlayers(ps);
    })();
  }, [code, state.room?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!state.room?.id) return;

    const channel = supabase
      .channel(`lobby:${state.room.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${state.room.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          setPlayers(prev => [...prev.filter(p => p.id !== (payload.new as Player).id), payload.new as Player]);
        } else if (payload.eventType === 'UPDATE') {
          setPlayers(prev => prev.map(p => p.id === (payload.new as Player).id ? payload.new as Player : p));
        } else if (payload.eventType === 'DELETE') {
          setPlayers(prev => prev.filter(p => p.id !== (payload.old as Player).id));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${state.room.id}`,
      }, payload => {
        const room = payload.new as any;
        dispatch({ type: 'SET_ROOM', payload: room });
        if (room.status === 'playing') {
          navigate(`/game/${code}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [state.room?.id, code]);

  const copyCode = () => {
    navigator.clipboard.writeText(code || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleStart = async () => {
    if (players.length < 2) { setError('يحتاج على الأقل لاعبان للبدء'); return; }
    setIsStarting(true);
    setError('');

    try {
      const settings = state.room?.settings;
      const letter = getRandomLetter([], settings?.excludeHardLetters ?? true);

      // Create first round
      const { data: round, error: roundErr } = await supabase
        .from('rounds')
        .insert({
          room_id: state.room!.id,
          round_number: 1,
          letter,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (roundErr) throw roundErr;

      // Update room status
      await supabase
        .from('rooms')
        .update({
          status: 'playing',
          current_round: 1,
          current_letter: letter,
          round_started_at: new Date().toISOString(),
          bus_pressed_by: null,
        })
        .eq('id', state.room!.id);

      // Update all players to 'typing'
      await supabase
        .from('players')
        .update({ status: 'typing' })
        .eq('room_id', state.room!.id);

      dispatch({ type: 'SET_ROUND', payload: round });
    } catch (err: any) {
      setError(err.message || 'خطأ في بدء اللعبة');
      setIsStarting(false);
    }
  };

  const codeChars = (code || '').split('');

  return (
    <div className="page">
      <div className="container container--narrow" style={{ paddingTop: 'var(--space-xl)' }}>
        {/* Room Code */}
        <div className="animate-scale-in" style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
          <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-sm)' }}>كود الغرفة</p>
          <div className="room-code" style={{ marginBottom: 'var(--space-md)', justifyContent: 'center' }}>
            {codeChars.map((ch, i) => (
              <div key={i} className="room-code__char">{ch}</div>
            ))}
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={copyCode}
            style={{ margin: '0 auto' }}
          >
            {copied ? '✅ تم النسخ!' : '📋 انسخ الكود'}
          </button>
        </div>

        {/* Settings Summary */}
        {state.room?.settings && (
          <div className="card animate-fade-in" style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--bus-primary)' }}>
                  {state.room.settings.rounds}
                </div>
                <div className="text-muted text-sm">جولات</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--bus-accent)' }}>
                  {state.room.settings.timePerRound}ث
                </div>
                <div className="text-muted text-sm">للجولة</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--bus-mint)' }}>
                  {state.room.settings.categories.length}
                </div>
                <div className="text-muted text-sm">فئة</div>
              </div>
            </div>
          </div>
        )}

        {/* Players */}
        <div className="card card--elevated" style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3>👥 اللاعبون</h3>
            <span className="badge badge--primary">{players.length} / 10</span>
          </div>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {players.map((player, i) => (
              <div key={player.id} className="player-card">
                <PlayerAvatar name={player.name} index={i} />
                <div>
                  <div style={{ fontWeight: 600 }}>{player.name}</div>
                  {player.is_host && <div className="text-xs text-muted">👑 مضيف</div>}
                </div>
                <div style={{ marginRight: 'auto' }}>
                  {player.session_id === sessionId && (
                    <span className="badge badge--valid">أنت</span>
                  )}
                </div>
              </div>
            ))}

            {players.length < 2 && (
              <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)' }}>
                ⏳ في انتظار المزيد من اللاعبين...
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="card" style={{ borderColor: 'var(--status-invalid)', color: 'var(--status-invalid)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
            ⚠️ {error}
          </div>
        )}

        {isHost ? (
          <button
            className="btn btn--primary btn--lg btn--full"
            onClick={handleStart}
            disabled={isStarting || players.length < 2}
            style={{ fontSize: 'var(--font-size-lg)', padding: '18px' }}
          >
            {isStarting ? <><span className="spinner spinner--sm" /> جاري البدء...</> : '🚀 ابدأ اللعبة'}
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            ⏳ في انتظار المضيف لبدء اللعبة...
          </div>
        )}
      </div>
    </div>
  );
}
