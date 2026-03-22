import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { supabase } from '../lib/supabase';
import { getSessionId, getRandomLetter } from '../lib/game-logic';
import { validateRoundAnswers } from '../lib/validation';
import { sounds } from '../lib/sounds';
import type { Player, Round, Answer } from '../types/game.types';
import { PlayerAvatar } from './HomePage';

type ValidationStatus = 'idle' | 'validating' | 'done';

export default function ResultsPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useGame();

  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationProgress, setValidationProgress] = useState(0);
  const [isStartingNext, setIsStartingNext] = useState(false);

  const sessionId = getSessionId();
  const room = state.room;
  const isHost = room?.host_id === sessionId;
  const isLastRound = (room?.current_round || 0) >= (room?.settings?.rounds || 5);

  // Load data
  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data: r } = await supabase.from('rooms').select('*').eq('code', code).single();
      if (r) dispatch({ type: 'SET_ROOM', payload: r });

      if (r?.id) {
        const { data: ps } = await supabase.from('players').select('*').eq('room_id', r.id).order('score', { ascending: false });
        if (ps) setPlayers(ps);

        const { data: rounds } = await supabase
          .from('rounds').select('*').eq('room_id', r.id)
          .order('round_number', { ascending: false }).limit(1);

        if (rounds?.[0]) {
          setRound(rounds[0]);
          const { data: ans } = await supabase.from('answers').select('*').eq('round_id', rounds[0].id);
          if (ans) {
            setAnswers(ans);
            // Auto-start validation if host
            if (r.host_id === sessionId && ans.some(a => a.status === 'pending')) {
              runValidation(rounds[0], ans, r.bus_pressed_by);
            }
          }
        }
      }
    })();
  }, [code]);

  // Realtime: listen for answer updates (validation results)
  useEffect(() => {
    if (!round?.id) return;
    const channel = supabase
      .channel(`results:${round.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'answers', filter: `round_id=eq.${round.id}` }, payload => {
        setAnswers(prev => prev.map(a => a.id === (payload.new as Answer).id ? payload.new as Answer : a));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${room?.id}` }, payload => {
        setPlayers(prev => prev.map(p => p.id === (payload.new as Player).id ? payload.new as Player : p));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room?.id}` }, payload => {
        const updated = payload.new as any;
        dispatch({ type: 'SET_ROOM', payload: updated });
        if (updated.status === 'playing') navigate(`/game/${code}`);
        if (updated.status === 'finished') navigate(`/final/${code}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [round?.id, room?.id]);

  const runValidation = useCallback(async (currentRound: Round, rawAnswers: Answer[], busPressedBy: string | null) => {
    if (validationStatus !== 'idle') return;
    setValidationStatus('validating');
    setValidationProgress(0);

    try {
      // Filter non-empty answers for validation
      const toValidate = rawAnswers.filter(a => a.value.trim().length > 0);
      const total = toValidate.length;

      // Validate with Gemini AI
      const results = await validateRoundAnswers(
        toValidate.map(a => ({ player_id: a.player_id, category: a.category, value: a.value })),
        currentRound.letter,
        (done) => setValidationProgress(Math.round((done / total) * 100))
      );

      // Map results back to answer IDs
      const updates: { id: string; status: string }[] = [];
      results.forEach((result, i) => {
        const answer = toValidate[i];
        if (answer) updates.push({ id: answer.id, status: result.status });
      });

      // Mark empty answers as invalid
      rawAnswers.filter(a => !a.value.trim()).forEach(a => {
        updates.push({ id: a.id, status: 'invalid' });
      });

      // Batch update answers
      for (const update of updates) {
        await supabase.from('answers').update({ status: update.status, validated_at: new Date().toISOString() }).eq('id', update.id);
      }

      // Now calculate scores
      const updatedAnswers: Answer[] = rawAnswers.map(a => {
        const u = updates.find(x => x.id === a.id);
        return u ? { ...a, status: u.status as any } : a;
      });

      // Find duplicates: for each category + value pair, check if multiple players have same answer
      const categories = room?.settings?.categories || [];
      const playerIds = [...new Set(updatedAnswers.map(a => a.player_id))];

      const scoreUpdate: Record<string, number> = {};
      playerIds.forEach(pid => { scoreUpdate[pid] = 0; });

      categories.forEach(cat => {
        const catAnswers = updatedAnswers.filter(a => a.category === cat && a.status === 'valid');
        const valueMap: Record<string, string[]> = {};
        catAnswers.forEach(a => {
          const key = a.value.trim().toLowerCase();
          if (!valueMap[key]) valueMap[key] = [];
          valueMap[key].push(a.player_id);
        });

        Object.values(valueMap).forEach(pids => {
          const points = pids.length === 1 ? 10 : 5;
          pids.forEach(pid => { scoreUpdate[pid] = (scoreUpdate[pid] || 0) + points; });
        });
      });

      // Bus bonus
      if (busPressedBy && scoreUpdate[busPressedBy] !== undefined) {
        scoreUpdate[busPressedBy] += 5;
      }

      // Update answer points
      for (const a of updatedAnswers) {
        const status = updates.find(u => u.id === a.id)?.status || a.status;
        // We set per-answer points: valid unique = 10, valid duplicate = 5
        const cat = a.category;
        const catAnswers = updatedAnswers.filter(x => x.category === cat && x.status === 'valid');
        const sameValue = catAnswers.filter(x => x.value.trim().toLowerCase() === a.value.trim().toLowerCase());
        const pts = status === 'valid' ? (sameValue.length > 1 ? 5 : 10) : 0;
        await supabase.from('answers').update({ points: pts }).eq('id', a.id);
      }

      // Update player scores
      for (const [pid, pts] of Object.entries(scoreUpdate)) {
        const player = players.find(p => p.id === pid);
        if (player) {
          await supabase.from('players').update({ score: player.score + pts }).eq('id', pid);
        }
      }

      setValidationStatus('done');
      if (state.soundEnabled) sounds.success();
    } catch (err) {
      console.error('Validation error:', err);
      setValidationStatus('done');
    }
  }, [validationStatus, room, players, state.soundEnabled]);

  const handleNextRound = async () => {
    if (!room || !isHost) return;
    setIsStartingNext(true);

    const nextRound = (room.current_round || 1) + 1;

    if (nextRound > (room.settings?.rounds || 5)) {
      // Game over
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);
      navigate(`/final/${code}`);
      return;
    }

    // Get used letters
    const { data: rounds } = await supabase.from('rounds').select('letter').eq('room_id', room.id);
    const usedLetters = rounds?.map(r => r.letter) || [];
    const newLetter = getRandomLetter(usedLetters, room.settings?.excludeHardLetters ?? true);

    // Create next round
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: _newRound } = await supabase.from('rounds').insert({
      room_id: room.id,
      round_number: nextRound,
      letter: newLetter,
      started_at: new Date().toISOString(),
    }).select().single();

    // Reset players
    await supabase.from('players').update({ status: 'typing' }).eq('room_id', room.id);

    // Update room
    await supabase.from('rooms').update({
      status: 'playing',
      current_round: nextRound,
      current_letter: newLetter,
      round_started_at: new Date().toISOString(),
      bus_pressed_by: null,
    }).eq('id', room.id);

    dispatch({ type: 'RESET_ANSWERS' });
  };

  const categories = room?.settings?.categories || [];
  const busPresserPlayer = players.find(p => p.id === round?.bus_pressed_by);

  return (
    <div className="page">
      <div className="container container--wide" style={{ paddingTop: 'var(--space-xl)' }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>📊 نتائج الجولة {round?.round_number}</h1>
          <p className="text-secondary">حرف: <strong style={{ color: 'var(--bus-primary)', fontSize: 'var(--font-size-xl)' }}>{round?.letter}</strong></p>
          {busPresserPlayer && (
            <span className="badge badge--invalid" style={{ marginTop: 'var(--space-sm)', padding: '6px 16px', fontSize: 'var(--font-size-sm)' }}>
              🚌 {busPresserPlayer.name} ضغط أتوبيس أولاً (+5 نقاط)
            </span>
          )}
        </div>

        {/* Validation Status */}
        {validationStatus === 'validating' && (
          <div className="card animate-fade-in" style={{ textAlign: 'center', marginBottom: 'var(--space-lg)', borderColor: 'var(--bus-primary)' }}>
            <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
            <div style={{ fontWeight: 600 }}>🤖 الذكاء الاصطناعي يراجع الإجابات...</div>
            <div className="text-secondary text-sm">{validationProgress}% مكتمل</div>
            <div style={{ marginTop: 'var(--space-sm)', height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${validationProgress}%`, background: 'var(--bus-primary)', transition: 'width 0.3s ease', borderRadius: 2 }} />
            </div>
          </div>
        )}

        {/* Scores Summary */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
          {players.map((p, i) => (
            <div
              key={p.id}
              className="card animate-fade-in-up"
              style={{ flex: 1, minWidth: 140, textAlign: 'center', animationDelay: `${i * 0.05}s` }}
            >
              <PlayerAvatar name={p.name} index={i} size={44} />
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: 'var(--font-size-md)' }}>{p.name}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--bus-gold)' }}>{p.score}</div>
              <div className="text-muted text-sm">نقطة</div>
              {i === 0 && players.length > 1 && <span className="badge badge--valid" style={{ marginTop: 4 }}>🥇 الأول</span>}
            </div>
          ))}
        </div>

        {/* Answers Table */}
        <div className="card card--elevated animate-fade-in" style={{ marginBottom: 'var(--space-xl)', overflowX: 'auto' }}>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>📋 جدول الإجابات</h3>
          <table className="results-table">
            <thead>
              <tr>
                <th>الفئة</th>
                {players.map((p, i) => (
                  <th key={p.id} style={{ color: ['#6C63FF','#FF6584','#06D6A0','#FFD166','#8338EC'][i % 5] }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat}>
                  <td style={{ fontWeight: 600 }}>{cat}</td>
                  {players.map(player => {
                    const answer = answers.find(a => a.player_id === player.id && a.category === cat);
                    return (
                      <td key={player.id}>
                        {answer?.value ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: 500 }}>{answer.value}</span>
                            <StatusBadge status={answer.status} />
                            {answer.points > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--bus-gold)', fontWeight: 700 }}>+{answer.points}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Next Round / Finish */}
        {isHost && (
          <div style={{ textAlign: 'center' }}>
            <button
              className={`btn btn--lg ${isLastRound ? 'btn--danger' : 'btn--primary'}`}
              onClick={handleNextRound}
              disabled={isStartingNext || validationStatus === 'validating'}
              style={{ fontSize: 'var(--font-size-lg)', padding: '18px 40px' }}
            >
              {isStartingNext
                ? <><span className="spinner spinner--sm" /> جاري البدء...</>
                : isLastRound
                ? '🏆 انتهاء اللعبة — عرض النتيجة النهائية'
                : `▶️ ابدأ الجولة ${(room?.current_round || 1) + 1}`}
            </button>
            {validationStatus === 'validating' && (
              <p className="text-secondary text-sm" style={{ marginTop: 'var(--space-sm)' }}>
                انتظر حتى تنتهي مراجعة الإجابات
              </p>
            )}
          </div>
        )}
        {!isHost && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            ⏳ في انتظار المضيف لبدء الجولة التالية...
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    valid: { label: '✅ صحيحة', cls: 'badge--valid' },
    invalid: { label: '❌ خاطئة', cls: 'badge--invalid' },
    duplicate: { label: '🔶 مكررة', cls: 'badge--suspicious' },
    suspicious: { label: '⚠️ مشكوك', cls: 'badge--suspicious' },
    pending: { label: '⏳ مراجعة', cls: 'badge--pending' },
  };
  const m = map[status] || map.pending;
  return <span className={`badge ${m.cls}`} style={{ fontSize: 10 }}>{m.label}</span>;
}
