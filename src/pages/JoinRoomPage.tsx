import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { supabase } from '../lib/supabase';
import { getSessionId } from '../lib/game-logic';

export default function JoinRoomPage() {
  const navigate = useNavigate();
  const { dispatch } = useGame();

  const [playerName, setPlayerName] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    const trimName = playerName.trim();
    const trimCode = code.trim().toUpperCase();

    if (!trimName) { setError('أدخل اسمك أولاً'); return; }
    if (trimName.length < 2) { setError('الاسم قصير جداً'); return; }
    if (!trimCode || trimCode.length !== 6) { setError('كود الغرفة يجب أن يكون 6 خانات'); return; }

    setIsLoading(true);
    setError('');

    try {
      // Find room
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', trimCode)
        .maybeSingle();

      if (roomErr || !room) { setError('الغرفة غير موجودة، تحقق من الكود'); setIsLoading(false); return; }
      if (room.status !== 'waiting') { setError('اللعبة بدأت بالفعل، لا يمكن الانضمام الآن'); setIsLoading(false); return; }

      // Check player count
      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if ((count || 0) >= 10) { setError('الغرفة ممتلئة (الحد الأقصى 10 لاعبين)'); setIsLoading(false); return; }

      const sessionId = getSessionId();

      // Check if already in room
      const { data: existing } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .eq('session_id', sessionId)
        .maybeSingle();

      let player;
      if (existing) {
        player = existing;
      } else {
        const { data: newPlayer, error: playerErr } = await supabase
          .from('players')
          .insert({
            room_id: room.id,
            name: trimName,
            session_id: sessionId,
            score: 0,
            status: 'waiting',
            is_host: false,
          })
          .select()
          .single();

        if (playerErr) throw playerErr;
        player = newPlayer;
      }

      dispatch({ type: 'SET_ROOM', payload: room });
      dispatch({ type: 'SET_CURRENT_PLAYER', payload: player });
      navigate(`/lobby/${trimCode}`);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page" style={{ justifyContent: 'center' }}>
      <div className="container container--narrow">
        {/* Header */}
        <div className="animate-fade-in" style={{ marginBottom: 'var(--space-2xl)', textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 'var(--space-md)' }}>🚪</div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>الانضمام لغرفة</h1>
          <p className="text-secondary">أدخل كود الغرفة وانضم للمتعة</p>
        </div>

        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="card card--elevated">
            <div className="input-group" style={{ marginBottom: 'var(--space-md)' }}>
              <label className="input-label">👤 اسمك</label>
              <input
                className="input"
                placeholder="ادخل اسمك..."
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                maxLength={20}
                style={{ fontSize: 'var(--font-size-lg)', padding: '14px 16px' }}
              />
            </div>

            <div className="input-group">
              <label className="input-label">🔑 كود الغرفة</label>
              <input
                className="input"
                placeholder="مثال: AB3X9K"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                style={{
                  fontSize: 'var(--font-size-2xl)',
                  fontWeight: 800,
                  textAlign: 'center',
                  letterSpacing: '0.3em',
                  padding: '16px',
                }}
              />
            </div>
          </div>

          {error && (
            <div className="card" style={{ borderColor: 'var(--status-invalid)', color: 'var(--status-invalid)', textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            className="btn btn--primary btn--lg btn--full"
            onClick={handleJoin}
            disabled={isLoading}
            style={{ fontSize: 'var(--font-size-lg)', padding: '18px' }}
          >
            {isLoading ? <><span className="spinner spinner--sm" /> جاري الانضمام...</> : '🚀 انضم الآن'}
          </button>

          <button className="btn btn--ghost btn--full" onClick={() => navigate('/')}>
            ← العودة للرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}
