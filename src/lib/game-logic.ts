import { ARABIC_LETTERS, HARD_LETTERS, type Answer, type Player } from '../types/game.types';

// Generate a random 6-character room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Generate a unique session ID for this browser tab
export function getSessionId(): string {
  let id = sessionStorage.getItem('bus_session_id');
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('bus_session_id', id);
  }
  return id;
}

// Get a random letter for a round
export function getRandomLetter(usedLetters: string[], excludeHard: boolean): string {
  let pool = [...ARABIC_LETTERS];
  if (excludeHard) {
    pool = pool.filter(l => !HARD_LETTERS.includes(l));
  }
  const available = pool.filter(l => !usedLetters.includes(l));
  if (available.length === 0) return pool[Math.floor(Math.random() * pool.length)];
  return available[Math.floor(Math.random() * available.length)];
}

// Calculate scores for a round
export interface ScoreResult {
  playerId: string;
  category: string;
  points: number;
  status: 'valid' | 'invalid' | 'duplicate' | 'suspicious';
}

export function calculateScores(
  answers: Answer[],
  busPresserPlayerId: string | null
): { playerId: string; totalPoints: number; bonusPoints: number }[] {
  const playerScores: Record<string, { totalPoints: number; bonusPoints: number }> = {};

  // Initialize scores for all players
  const playerIds = [...new Set(answers.map(a => a.player_id))];
  playerIds.forEach(id => {
    playerScores[id] = { totalPoints: 0, bonusPoints: 0 };
  });

  // Group valid answers by category and value
  const validAnswers = answers.filter(a => a.status === 'valid' || a.status === 'duplicate');

  // For each category, find duplicates
  const categories = [...new Set(answers.map(a => a.category))];
  categories.forEach(category => {
    const categoryAnswers = validAnswers.filter(a => a.category === category && a.status === 'valid');
    const valueCounts: Record<string, string[]> = {};

    categoryAnswers.forEach(answer => {
      const normalizedValue = answer.value.trim().toLowerCase();
      if (!valueCounts[normalizedValue]) valueCounts[normalizedValue] = [];
      valueCounts[normalizedValue].push(answer.player_id);
    });

    // Assign points
    Object.entries(valueCounts).forEach(([, playerIds]) => {
      if (playerIds.length === 1) {
        // Unique answer: 10 points
        playerScores[playerIds[0]].totalPoints += 10;
      } else {
        // Duplicate: 5 points each
        playerIds.forEach(pid => {
          playerScores[pid].totalPoints += 5;
        });
      }
    });
  });

  // Bus presser bonus
  if (busPresserPlayerId && playerScores[busPresserPlayerId]) {
    playerScores[busPresserPlayerId].bonusPoints += 5;
  }

  return Object.entries(playerScores).map(([playerId, scores]) => ({
    playerId,
    ...scores,
  }));
}

// Format time as MM:SS
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Get time remaining in a round
export function getTimeRemaining(startedAt: string, duration: number): number {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return Math.max(0, duration - elapsed);
}

// Check if word starts with the given Arabic letter
export function startsWithLetter(word: string, letter: string): boolean {
  if (!word || !letter) return false;
  const normalized = word.trim();
  if (normalized.length === 0) return false;

  // Handle همزة variations
  const alefVariants = ['أ', 'إ', 'آ', 'ا'];
  if (alefVariants.includes(letter) || letter === 'أ') {
    return alefVariants.some(v => normalized.startsWith(v));
  }

  return normalized.startsWith(letter);
}

export function getPlayerStatusLabel(status: Player['status']): string {
  switch (status) {
    case 'waiting': return '⏳ ينتظر';
    case 'typing': return '✍️ يكتب';
    case 'done': return '✅ انتهى';
    case 'pressed_bus': return '🚌 أتوبيس!';
    default: return '⏳ ينتظر';
  }
}
