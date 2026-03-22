import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider, useGame } from './context/GameContext';
import { sounds } from './lib/sounds';

import HomePage from './pages/HomePage';
import CreateRoomPage from './pages/CreateRoomPage';
import JoinRoomPage from './pages/JoinRoomPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ResultsPage from './pages/ResultsPage';
import FinalScoresPage from './pages/FinalScoresPage';

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useGame();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  useEffect(() => {
    sounds.setEnabled(state.soundEnabled);
  }, [state.soundEnabled]);

  return <>{children}</>;
}

export default function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <ThemeWrapper>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateRoomPage />} />
            <Route path="/join" element={<JoinRoomPage />} />
            <Route path="/lobby/:code" element={<LobbyPage />} />
            <Route path="/game/:code" element={<GamePage />} />
            <Route path="/results/:code" element={<ResultsPage />} />
            <Route path="/final/:code" element={<FinalScoresPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </ThemeWrapper>
      </BrowserRouter>
    </GameProvider>
  );
}
