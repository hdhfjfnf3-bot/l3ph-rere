import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';

const playerColors = [
  '#6C63FF', '#FF6584', '#06D6A0', '#FFD166', '#118AB2',
  '#EF476F', '#073B4C', '#8338EC', '#FB5607', '#3A86FF',
];

export function getPlayerColor(index: number): string {
  return playerColors[index % playerColors.length];
}

export function PlayerAvatar({ name, index, size = 36 }: { name: string; index: number; size?: number }) {
  const color = getPlayerColor(index);
  const initials = name.trim().slice(0, 2) || '؟';
  return (
    <div
      className="player-card__avatar"
      style={{
        width: size,
        height: size,
        background: `${color}22`,
        color,
        border: `2px solid ${color}55`,
        fontSize: size < 30 ? 12 : 15,
      }}
    >
      {initials}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animated particles background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      r: number; color: string; opacity: number;
    }> = [];

    const colors = ['#6C63FF', '#FF6584', '#06D6A0', '#FFD166', '#8B7FF8'];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.4 + 0.1,
      });
    }

    let raf: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="page" style={{ position: 'relative', overflow: 'hidden', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      />

      {/* Theme + Sound toggles */}
      <div style={{ position: 'fixed', top: 20, left: 20, display: 'flex', gap: 8, zIndex: 10 }}>
        <button
          className="btn btn--ghost btn--icon"
          onClick={() => dispatch({ type: 'TOGGLE_THEME' })}
          title="تبديل الوضع"
        >
          {state.theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          className="btn btn--ghost btn--icon"
          onClick={() => dispatch({ type: 'TOGGLE_SOUND' })}
          title="الصوت"
        >
          {state.soundEnabled ? '🔊' : '🔇'}
        </button>
      </div>

      <div className="container container--narrow" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        {/* Logo */}
        <div className="animate-scale-in" style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 100,
            height: 100,
            borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, #FF6B6B, #FF8E53, #FFAE1F)',
            boxShadow: '0 8px 40px rgba(255, 107, 107, 0.5)',
            fontSize: 52,
            marginBottom: 'var(--space-lg)',
            animation: 'glow-pulse 3s ease-in-out infinite',
          }}>
            🚌
          </div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 900, marginBottom: 8 }}>
            أتوبيس كومبليت
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-lg)' }}>
            لعبة الكلمات الجماعية الأكثر إثارة
          </p>
        </div>

        {/* Stats Banner */}
        <div
          className="animate-fade-in-up"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'var(--space-xl)',
            marginBottom: 'var(--space-2xl)',
            animationDelay: '0.1s',
          }}
        >
          {[
            { icon: '👥', label: 'لاعبين', value: '2-10' },
            { icon: '🎯', label: 'فئات', value: '5+' },
            { icon: '⚡', label: 'لحظي', value: '100%' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{item.icon}</div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--bus-primary)' }}>
                {item.value}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <button
            className="btn btn--primary btn--lg btn--full"
            onClick={() => navigate('/create')}
            style={{ fontSize: 'var(--font-size-xl)', padding: '18px 32px' }}
          >
            🎮 إنشاء غرفة جديدة
          </button>
          <button
            className="btn btn--secondary btn--lg btn--full"
            onClick={() => navigate('/join')}
            style={{ fontSize: 'var(--font-size-lg)' }}
          >
            🚪 الانضمام لغرفة
          </button>
        </div>

        {/* Footer */}
        <div
          className="animate-fade-in"
          style={{
            marginTop: 'var(--space-2xl)',
            animationDelay: '0.5s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-sm)'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 'var(--font-size-md)',
            fontWeight: 700,
            color: 'var(--text-primary)'
          }}>
            <span>صنه بواسطه سوبرمان</span>
            <img
              /*  src="https://em-content.zobj.net/source/facebook/355/red-heart_2764-fe0f.png" */
              alt="❤️"
              style={{ width: 24, height: 24, animation: 'bus-pulse 2s infinite' }}
            />
          </div>
          <p className="text-muted text-xs">
            مدعوم بـ Supabase Realtime • تحقق بالذكاء الاصطناعي
          </p>
        </div>
      </div>
    </div>
  );
}
