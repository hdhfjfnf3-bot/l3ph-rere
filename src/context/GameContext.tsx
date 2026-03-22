import React, { createContext, useContext, useReducer } from 'react';
import type { Room, Player, Round, Answer } from '../types/game.types';

interface GameState {
  room: Room | null;
  players: Player[];
  currentPlayer: Player | null;
  currentRound: Round | null;
  answers: Record<string, string>; // category -> value (local draft)
  submittedAnswers: Answer[];
  isLoading: boolean;
  error: string | null;
  theme: 'dark' | 'light';
  soundEnabled: boolean;
}

type GameAction =
  | { type: 'SET_ROOM'; payload: Room | null }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'UPDATE_PLAYER'; payload: Player }
  | { type: 'SET_CURRENT_PLAYER'; payload: Player | null }
  | { type: 'SET_ROUND'; payload: Round | null }
  | { type: 'SET_ANSWER'; payload: { category: string; value: string } }
  | { type: 'SET_ANSWERS_DRAFT'; payload: Record<string, string> }
  | { type: 'SET_SUBMITTED_ANSWERS'; payload: Answer[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TOGGLE_THEME' }
  | { type: 'TOGGLE_SOUND' }
  | { type: 'RESET_ANSWERS' };

const initialState: GameState = {
  room: null,
  players: [],
  currentPlayer: null,
  currentRound: null,
  answers: {},
  submittedAnswers: [],
  isLoading: false,
  error: null,
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  soundEnabled: localStorage.getItem('sound') !== 'false',
};

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_ROOM':
      return { ...state, room: action.payload };
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    case 'UPDATE_PLAYER':
      return {
        ...state,
        players: state.players.map(p => p.id === action.payload.id ? action.payload : p),
        currentPlayer: state.currentPlayer?.id === action.payload.id ? action.payload : state.currentPlayer,
      };
    case 'SET_CURRENT_PLAYER':
      return { ...state, currentPlayer: action.payload };
    case 'SET_ROUND':
      return { ...state, currentRound: action.payload };
    case 'SET_ANSWER':
      return {
        ...state,
        answers: { ...state.answers, [action.payload.category]: action.payload.value },
      };
    case 'SET_ANSWERS_DRAFT':
      return { ...state, answers: action.payload };
    case 'SET_SUBMITTED_ANSWERS':
      return { ...state, submittedAnswers: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'TOGGLE_THEME': {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return { ...state, theme: next };
    }
    case 'TOGGLE_SOUND': {
      const next = !state.soundEnabled;
      localStorage.setItem('sound', String(next));
      return { ...state, soundEnabled: next };
    }
    case 'RESET_ANSWERS':
      return { ...state, answers: {}, submittedAnswers: [] };
    default:
      return state;
  }
}

interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
