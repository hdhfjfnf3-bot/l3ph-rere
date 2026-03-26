import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { supabase } from '../lib/supabase';
import { getSessionId, getTimeRemaining, getPlayerStatusLabel } from '../lib/game-logic';
import { preValidate } from '../lib/validation';
import { sounds, vibrate } from '../lib/sounds';
import type { Player, Round } from '../types/game.types';
import { PlayerAvatar } from './HomePage';

// ── Timer Ring ────────────────────────────────────────────────────
function TimerRing({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = timeLeft / totalTime;
  const offset = circumference * (1 - progress);

  const color = timeLeft <= 10 ? '#EF476F' : timeLeft <= 20 ? '#FFD166' : '#6C63FF';
  const isUrgent = timeLeft <= 10;

  return (
    <div className="timer-ring">
      <svg width={size} height={size} className="timer-ring__svg">
        <circle className="timer-ring__bg" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
        <circle
          className="timer-ring__progress"
          cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={`timer-ring__text ${isUrgent ? 'urgent' : ''}`}>
        {timeLeft}
        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.6, marginTop: 2 }}>ثانية</div>
      </div>
    </div>
  );
}

// ── Category Input ────────────────────────────────────────────────
function CategoryInput({
  category, letter, value, onChange, disabled, validationHint
}: {
  category: string;
  letter: string;
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  validationHint?: { ok: boolean; reason?: string } | null;
}) {
  const showError = value && validationHint && !validationHint.ok;
  const showOk = value && validationHint && validationHint.ok;

  return (
    <div className="category-row">
      <div className="category-label">{category}</div>
      <div style={{ position: 'relative' }}>
        <input
          className={`input ${showError ? 'input--error' : showOk ? 'input--valid' : ''}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`ابدأ بـ "${letter}"...`}
          maxLength={30}
          style={{ paddingLeft: value ? '36px' : '16px' }}
          dir="rtl"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {value && (
          <span style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
          }}>
            {showError ? '❌' : showOk ? '✍️' : ''}
          </span>
        )}
      </div>
      <div style={{ width: 60, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        {showError && <span style={{ color: 'var(--status-invalid)' }}>{validationHint?.reason?.slice(0, 12)}</span>}
      </div>
    </div>
  );
}

// ── Main Game Page ─────────────────────────────────────────────────
export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useGame();

  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isLocked, setIsLocked] = useState(false);
  const [busPressed, setBusPressed] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationHints, setValidationHints] = useState<Record<string, { ok: boolean; reason?: string } | null>>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickRef = useRef<number>(-1);
  const busPressedRef = useRef<string | null>(null); // Use ref to avoid Realtime subscription restart

  const currentPlayer = state.currentPlayer;
  const room = state.room;
  const categories = room?.settings?.categories || [];

  // Initialize answers - only set missing keys, NEVER overwrite existing typed answers
  useEffect(() => {
    const current = answersRef.current;
    const init: Record<string, string> = {};
    let changed = false;
    categories.forEach(c => {
      // Keep existing answer if already typed, only add missing categories
      init[c] = current[c] ?? '';
      if (!(c in current)) changed = true;
    });
    if (changed || Object.keys(current).length === 0) {
      dispatch({ type: 'SET_ANSWERS_DRAFT', payload: init });
      answersRef.current = init;
    }
  }, [categories.join(',')]);

  // Load room + round + players on mount
  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data: r } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
      if (r) {
        dispatch({ type: 'SET_ROOM', payload: r });
        setBusPressed(r.bus_pressed_by);
        if (r.bus_pressed_by) setIsLocked(true);
      }

      if (r?.id) {
        const { data: ps } = await supabase.from('players').select('*').eq('room_id', r.id).order('joined_at');
        if (ps) setPlayers(ps);

        const { data: rounds } = await supabase
          .from('rounds')
          .select('*')
          .eq('room_id', r.id)
          .order('round_number', { ascending: false })
          .limit(1);
        if (rounds && rounds[0]) setRound(rounds[0]);
      }
    })();
  }, [code]);

  // Timer
  useEffect(() => {
    if (!round?.started_at || !room?.settings?.timePerRound) return;
    const duration = room.settings.timePerRound;

    timerRef.current = setInterval(() => {
      const t = getTimeRemaining(round.started_at!, duration);
      setTimeLeft(t);

      // Sound effects
      if (state.soundEnabled) {
        if (t <= 10 && t > 0 && t !== lastTickRef.current) {
          sounds.urgentTick();
          lastTickRef.current = t;
        } else if (t > 10 && t <= 30 && t % 10 === 0 && t !== lastTickRef.current) {
          sounds.tick();
          lastTickRef.current = t;
        }
      }

      if (t === 0) {
        if (state.soundEnabled) sounds.timeUp();
        handleTimeUp();
      }
    }, 500);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [round?.started_at, room?.settings?.timePerRound]);

  // Keep a mutable ref to the latest submitAnswers function to avoid stale closures in Realtime
  const submitAnswersRef = useRef<((busPresserId?: string | null) => Promise<void>) | null>(null);

  // Realtime subscriptions
  useEffect(() => {
    if (!room?.id) return;

    const roomId = room.id; // capture to avoid stale closure

    const channel = supabase
      .channel(`game:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      }, payload => {
        const updated = payload.new as any;
        dispatch({ type: 'SET_ROOM', payload: updated });

        if (updated.bus_pressed_by && !busPressedRef.current) {
          busPressedRef.current = updated.bus_pressed_by;
          setBusPressed(updated.bus_pressed_by);
          setIsLocked(true);
          if (timerRef.current) clearInterval(timerRef.current);
          if (state.soundEnabled) sounds.busHorn();

          // Submit own answers first (using ref to avoid stale closure)
          if (submitAnswersRef.current) submitAnswersRef.current(updated.bus_pressed_by);

          // ALL clients attempt transition after 5 seconds (idempotent - first wins)
          // Fetch latest round ID fresh from DB then attempt transition
          setTimeout(async () => {
            const { data: latestRound } = await supabase
              .from('rounds').select('id').eq('room_id', roomId)
              .order('round_number', { ascending: false }).limit(1).maybeSingle();
            if (!latestRound) return;
            console.log('[Realtime] Attempting transition to results', roomId, latestRound.id);
            await supabase.from('rounds').update({ ended_at: new Date().toISOString() }).eq('id', latestRound.id);
            await supabase.from('rooms').update({ status: 'results' }).eq('id', roomId);
          }, 5000);
        }

        if (updated.status === 'results') {
          navigate(`/results/${code}`);
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${roomId}`,
      }, payload => {
        if (payload.eventType === 'UPDATE') {
          setPlayers(prev => prev.map(p => p.id === (payload.new as Player).id ? payload.new as Player : p));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id]); // CRITICAL: room.id only - no other deps to prevent subscription restarts!

  // Answer change handler with pre-validation and auto-save
  const handleAnswerChange = useCallback((category: string, value: string) => {
    const newAnswers = { ...answersRef.current, [category]: value };
    answersRef.current = newAnswers;
    dispatch({ type: 'SET_ANSWER', payload: { category, value } });

    // Pre-validate
    if (value && round?.letter) {
      const hint = preValidate(value, round.letter);
      setValidationHints(prev => ({ ...prev, [category]: hint }));
    } else {
      setValidationHints(prev => ({ ...prev, [category]: null }));
    }

    // Update player status to 'typing'
    if (currentPlayer?.status !== 'typing') {
      supabase.from('players').update({ status: 'typing' }).eq('id', currentPlayer?.id || '');
    }

    // Auto-save debounce
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      // Save to localStorage as backup
      localStorage.setItem(`answers_${code}`, JSON.stringify(newAnswers));
    }, 1000);
  }, [currentPlayer, round?.letter, code]);

  const submitAnswers = useCallback(async (busPresserId?: string | null) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const currentRound = round;
      if (!currentRound || !currentPlayer) return;

      const answers = answersRef.current;

      // Insert answers (ignore duplicate if already inserted)
      const answerRows = categories.map(cat => ({
        round_id: currentRound.id,
        player_id: currentPlayer.id,
        category: cat,
        value: answers[cat]?.trim() || '',
        status: 'pending' as const,
        points: 0,
      }));

      const { error } = await supabase.from('answers').insert(answerRows);
      if (error && error.code !== '23505') {
        console.error('Error inserting answers:', error);
      }

      // Update player status
      const newStatus = busPresserId === currentPlayer.id ? 'pressed_bus' : 'done';
      await supabase.from('players').update({ status: newStatus }).eq('id', currentPlayer.id);

    } catch (err) {
      console.error('Error submitting answers:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [round, currentPlayer, categories, isSubmitting]);

  // Update the ref whenever submitAnswers changes
  useEffect(() => {
    submitAnswersRef.current = submitAnswers;
  }, [submitAnswers]);

  const transitionToResults = useCallback(async (currentRound: Round) => {
    if (!room?.id) return;
    await supabase.from('rounds').update({ ended_at: new Date().toISOString() }).eq('id', currentRound.id);
    await supabase.from('rooms').update({ status: 'results' }).eq('id', room.id);
  }, [room?.id]);

  // Polling fallback: after bus pressed, ALL clients poll every 2s as backup for Realtime
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!busPressed || !room?.id || !code) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('rooms').select('status').eq('id', room.id).maybeSingle();
      if (data?.status === 'results') {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        navigate(`/results/${code}`);
      }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [busPressed, room?.id, code]);

  const handleTimeUp = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isLocked) return;
    setIsLocked(true);
    if (!round || !room?.id) return;
    await submitAnswers(null);
    // Host transitions to results after time up
    if (room?.host_id === getSessionId()) {
      setTimeout(() => transitionToResults(round), 3000);
    }
  }, [isLocked, submitAnswers, transitionToResults, round, room]);

  const handleBusPress = async () => {
    if (isLocked || busPressedRef.current || !currentPlayer || !room || !round) return;
    vibrate([100, 50, 100]);
    if (state.soundEnabled) sounds.busHorn();

    busPressedRef.current = currentPlayer.id;
    setIsLocked(true);
    setBusPressed(currentPlayer.id);
    if (timerRef.current) clearInterval(timerRef.current);

    // Capture IDs now to avoid stale closures in setTimeout
    const capturedRoomId = room.id;
    const capturedRoundId = round.id;
    const capturedPlayerId = currentPlayer.id;

    // Notify all clients via Realtime
    await supabase.from('rooms').update({ bus_pressed_by: capturedPlayerId }).eq('id', capturedRoomId);

    // Submit answers immediately
    await submitAnswers(capturedPlayerId);

    // Transition to results after delay - using captured IDs (NO closures)
    setTimeout(async () => {
      console.log('[Bus] Transitioning to results...', capturedRoomId, capturedRoundId);
      try {
        await supabase.from('rounds').update({ ended_at: new Date().toISOString() }).eq('id', capturedRoundId);
        const { error } = await supabase.from('rooms').update({ status: 'results' }).eq('id', capturedRoomId);
        if (error) {
          console.error('[Bus] Failed to set status=results:', error);
        } else {
          console.log('[Bus] status=results set successfully!');
        }
      } catch (e) {
        console.error('[Bus] transitionToResults threw:', e);
      }
    }, 4000);
  };

  // Determine bus presser name
  const busPresserPlayer = players.find(p => p.id === busPressed);
  const currentLetter = room?.current_letter || round?.letter || '؟';
  const totalTime = room?.settings?.timePerRound || 60;

  return (
    <div className="page" style={{ paddingTop: 'var(--space-md)', paddingBottom: 80 }}>
      <div className="container" style={{ maxWidth: 800 }}>

        {/* Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <div>
            <span className="badge badge--primary">جولة {room?.current_round || 1} / {room?.settings?.rounds || 5}</span>
          </div>
          <TimerRing timeLeft={timeLeft} totalTime={totalTime} />
          <div style={{ textAlign: 'left' }}>
            <div className="text-muted text-sm">اللاعبون</div>
            <div style={{ fontWeight: 700 }}>{players.length}</div>
          </div>
        </div>

        {/* Bus Pressed Alert */}
        {busPressed && (
          <div
            className="card animate-scale-in"
            style={{
              background: 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,142,83,0.15))',
              borderColor: 'rgba(255,107,107,0.4)',
              textAlign: 'center',
              marginBottom: 'var(--space-md)',
              padding: 'var(--space-md)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 4 }}>🚌</div>
            <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: '#FF6B6B' }}>
              {busPresserPlayer?.id === currentPlayer?.id ? 'أنت ضغطت أتوبيس!' : `${busPresserPlayer?.name} ضغط أتوبيس كومبليت!`}
            </div>
            <div className="text-secondary text-sm" style={{ marginTop: 4 }}>الإجابات محفوظة، جاري الانتقال للنتائج...</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 'var(--space-lg)', alignItems: 'start' }}>

          {/* Answers Section */}
          <div>
            {/* Letter Display */}
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
              <div className="text-secondary text-sm" style={{ marginBottom: 'var(--space-sm)' }}>الحرف</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="letter-display">{currentLetter}</div>
              </div>
            </div>

            {/* Category Inputs */}
            <div className="card card--elevated animate-fade-in">
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                <div className="category-row" style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>
                  <div>الفئة</div><div>إجابتك</div><div />
                </div>
              </div>
              {categories.map(cat => (
                <CategoryInput
                  key={cat}
                  category={cat}
                  letter={currentLetter}
                  value={state.answers[cat] || ''}
                  onChange={v => handleAnswerChange(cat, v)}
                  disabled={isLocked}
                  validationHint={validationHints[cat]}
                />
              ))}
            </div>

            {/* BUS BUTTON */}
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <button
                className="btn-bus"
                onClick={handleBusPress}
                disabled={isLocked || !!busPressed}
              >
                <span>🚌 أتوبيس كومبليت!</span>
                {!isLocked && <span className="bus-sub">اضغط لإنهاء الجولة فوراً +5 نقاط</span>}
                {isLocked && <span className="bus-sub">الجولة انتهت</span>}
              </button>
            </div>
          </div>

          {/* Players Panel */}
          <div>
            <div className="card card--elevated">
              <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-md)' }}>👥 اللاعبون</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {players.map((p, i) => (
                  <div
                    key={p.id}
                    className={`player-card player-card--${p.status}`}
                    style={{ padding: '8px 12px' }}
                  >
                    <PlayerAvatar name={p.name} index={i} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {getPlayerStatusLabel(p.status)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--bus-gold)', fontSize: 14 }}>
                      {p.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
