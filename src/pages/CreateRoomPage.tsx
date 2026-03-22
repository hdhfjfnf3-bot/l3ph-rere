import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { supabase } from '../lib/supabase';
import { generateRoomCode, getSessionId } from '../lib/game-logic';
import { DEFAULT_SETTINGS } from '../types/game.types';
import type { GameSettings } from '../types/game.types';

const ROUND_OPTIONS = [3, 5, 10];
const TIME_OPTIONS = [30, 60, 90, 120];

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const { dispatch } = useGame();

  const [playerName, setPlayerName] = useState('');
  const [settings, setSettings] = useState<GameSettings>({ ...DEFAULT_SETTINGS });
  const [newCategory, setNewCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed || settings.categories.includes(trimmed)) return;
    if (settings.categories.length >= 10) { setError('الحد الأقصى 10 فئات'); return; }
    setSettings(s => ({ ...s, categories: [...s.categories, trimmed] }));
    setNewCategory('');
    setError('');
  };

  const removeCategory = (cat: string) => {
    if (settings.categories.length <= 2) { setError('يجب أن يكون هناك فئتان على الأقل'); return; }
    setSettings(s => ({ ...s, categories: s.categories.filter(c => c !== cat) }));
  };

  const handleCreate = async () => {
    if (!playerName.trim()) { setError('أدخل اسمك أولاً'); return; }
    if (playerName.trim().length < 2) { setError('الاسم قصير جداً'); return; }

    setIsLoading(true);
    setError('');

    try {
      const code = generateRoomCode();
      const sessionId = getSessionId();

      // Create room
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          code,
          host_id: sessionId,
          status: 'waiting',
          settings,
          current_round: 0,
        })
        .select()
        .single();

      if (roomErr) throw roomErr;

      // Create host player
      const { data: player, error: playerErr } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: playerName.trim(),
          session_id: sessionId,
          score: 0,
          status: 'waiting',
          is_host: true,
        })
        .select()
        .single();

      if (playerErr) throw playerErr;

      dispatch({ type: 'SET_ROOM', payload: room });
      dispatch({ type: 'SET_CURRENT_PLAYER', payload: player });
      navigate(`/lobby/${code}`);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ، تحقق من إعدادات Supabase');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container container--narrow" style={{ paddingTop: 'var(--space-xl)' }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <button className="btn btn--ghost btn--icon" onClick={() => navigate('/')}>←</button>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>🎮 إنشاء غرفة</h1>
            <p className="text-sm text-secondary">قم بإعداد اللعبة كما يعجبك</p>
          </div>
        </div>

        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Player Name */}
          <div className="card card--elevated">
            <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)' }}>👤 اسمك</h3>
            <div className="input-group">
              <input
                className="input"
                placeholder="ادخل اسمك..."
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                maxLength={20}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                style={{ fontSize: 'var(--font-size-lg)', padding: '14px 16px' }}
              />
            </div>
          </div>

          {/* Rounds */}
          <div className="card card--elevated">
            <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)' }}>🔁 عدد الجولات</h3>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              {ROUND_OPTIONS.map(r => (
                <button
                  key={r}
                  className={`btn btn--sm ${settings.rounds === r ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ flex: 1, fontSize: 'var(--font-size-lg)', padding: '12px' }}
                  onClick={() => setSettings(s => ({ ...s, rounds: r }))}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="card card--elevated">
            <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)' }}>⏱ وقت الجولة</h3>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
              {TIME_OPTIONS.map(t => (
                <button
                  key={t}
                  className={`btn btn--sm ${settings.timePerRound === t ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ flex: 1, minWidth: '60px' }}
                  onClick={() => setSettings(s => ({ ...s, timePerRound: t }))}
                >
                  {t}ث
                </button>
              ))}
            </div>
          </div>

          {/* Hard Letters */}
          <div className="card card--elevated">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)' }}>🔤 الحروف الصعبة</h3>
                <p className="text-sm text-muted" style={{ marginTop: 4 }}>ث، ظ، ذ، ض، غ، خ</p>
              </div>
              <button
                className={`btn btn--sm ${settings.excludeHardLetters ? 'btn--success' : 'btn--secondary'}`}
                onClick={() => setSettings(s => ({ ...s, excludeHardLetters: !s.excludeHardLetters }))}
              >
                {settings.excludeHardLetters ? '✅ مستبعدة' : '⚠️ مفعّلة'}
              </button>
            </div>
          </div>

          {/* Categories */}
          <div className="card card--elevated">
            <h3 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)' }}>🧩 الفئات</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              {settings.categories.map(cat => (
                <div
                  key={cat}
                  className="badge badge--primary"
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {cat}
                  <button
                    onClick={() => removeCategory(cat)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      marginRight: 4,
                      opacity: 0.7,
                      fontSize: 14,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <input
                className="input"
                placeholder="أضف فئة جديدة..."
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                maxLength={20}
              />
              <button className="btn btn--secondary btn--sm" onClick={addCategory}>
                ＋
              </button>
            </div>
          </div>

          {error && (
            <div className="card" style={{ borderColor: 'var(--status-invalid)', color: 'var(--status-invalid)', textAlign: 'center', padding: 'var(--space-sm)' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            className="btn btn--primary btn--lg btn--full"
            onClick={handleCreate}
            disabled={isLoading}
            style={{ fontSize: 'var(--font-size-lg)', padding: '18px' }}
          >
            {isLoading ? <><span className="spinner spinner--sm" /> جاري الإنشاء...</> : '🎮 إنشاء الغرفة'}
          </button>
        </div>
      </div>
    </div>
  );
}
