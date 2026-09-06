import { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator, StyleSheet, Text, Alert } from 'react-native';
import { supabase } from './lib/supabase';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';

type GameState = { gameId: string; playerId: string; joinCode?: string };

export default function App() {
  const [ready, setReady] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) Alert.alert('Erreur de connexion', error.message);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" /></SafeAreaView>;
  }

  if (gameState && gameStarted) {
    return (
      <SafeAreaView style={styles.flexFill}>
        <GameScreen
          gameId={gameState.gameId}
          playerId={gameState.playerId}
          onLeave={() => { setGameState(null); setGameStarted(false); }}
        />
      </SafeAreaView>
    );
  }

  if (gameState) {
    return (
      <SafeAreaView style={styles.flexFill}>
        <LobbyScreen gameId={gameState.gameId} playerId={gameState.playerId} joinCode={gameState.joinCode} onGameStarted={() => setGameStarted(true)} />
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={styles.flexFill}><HomeScreen onJoined={setGameState} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  flexFill: { flex: 1 },
});