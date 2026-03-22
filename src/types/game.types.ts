export type RoomStatus = 'waiting' | 'playing' | 'results' | 'finished';
export type PlayerStatus = 'waiting' | 'typing' | 'done' | 'pressed_bus';
export type AnswerStatus = 'pending' | 'valid' | 'invalid' | 'duplicate' | 'suspicious';

export interface GameSettings {
  rounds: number;
  timePerRound: number; // seconds
  categories: string[];
  excludeHardLetters: boolean;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  settings: GameSettings;
  current_round: number;
  current_letter: string | null;
  round_started_at: string | null;
  bus_pressed_by: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  session_id: string;
  score: number;
  status: PlayerStatus;
  is_host: boolean;
  joined_at: string;
}

export interface Round {
  id: string;
  room_id: string;
  round_number: number;
  letter: string;
  started_at: string | null;
  ended_at: string | null;
  bus_pressed_by: string | null;
}

export interface Answer {
  id: string;
  round_id: string;
  player_id: string;
  category: string;
  value: string;
  status: AnswerStatus;
  points: number;
  validated_at: string | null;
}

export interface PlayerWithAnswers extends Player {
  answers: Answer[];
  roundScore: number;
}

export interface ValidationResult {
  category: string;
  value: string;
  status: AnswerStatus;
  reason?: string;
}

export const DEFAULT_CATEGORIES = [
  'اسم ولد',
  'اسم بنت',
  'حيوان',
  'نبات',
  'بلد',
];

export const ARABIC_LETTERS = [
  'أ', 'ب', 'ت', 'ج', 'ح', 'خ', 'د', 'ر', 'ز', 'س',
  'ش', 'ص', 'ط', 'ع', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'
];

export const HARD_LETTERS = ['ث', 'خ', 'ذ', 'ض', 'ظ', 'غ'];

export const DEFAULT_SETTINGS: GameSettings = {
  rounds: 5,
  timePerRound: 60,
  categories: [...DEFAULT_CATEGORIES],
  excludeHardLetters: true,
};
