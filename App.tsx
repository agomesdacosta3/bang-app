import { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useFonts, Rye_400Regular } from '@expo-google-fonts/rye';
import { Arvo_400Regular, Arvo_700Bold } from '@expo-google-fonts/arvo';
import { supabase } from './lib/supabase';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameStartScreen from './screens/GameStartScreen';
import GameScreen from './screens/GameScreen';
import { colors } from './theme';

type GameState = { gameId: string; playerId: string; joinCode?: string };
type Phase = 'home' | 'lobby' | 'preparing' | 'playing';

export default function App() {
  const [fontsLoaded] = useFonts({ Rye_400Regular, Arvo_400Regular, Arvo_700Bold });
  const [ready, setReady] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [phase, setPhase] = useState<Phase>('home');

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

  if (!fontsLoaded || !ready) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={colors.leather} /></SafeAreaView>;
  }

  if (gameState && phase === 'playing') {
    return (
      <SafeAreaView style={styles.flexFill}>
        <GameScreen gameId={gameState.gameId} playerId={gameState.playerId} onLeave={() => { setGameState(null); setPhase('home'); }} />
      </SafeAreaView>
    );
  }

  if (gameState && phase === 'preparing') {
    return (
      <SafeAreaView style={styles.flexFill}>
        <GameStartScreen gameId={gameState.gameId} playerId={gameState.playerId} onReady={() => setPhase('playing')} />
      </SafeAreaView>
    );
  }

  if (gameState && phase === 'lobby') {
    return (
      <SafeAreaView style={styles.flexFill}>
        <LobbyScreen gameId={gameState.gameId} playerId={gameState.playerId} joinCode={gameState.joinCode} onGameStarted={() => setPhase('preparing')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flexFill}>
      <HomeScreen onJoined={(state) => { setGameState(state); setPhase('lobby'); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.parchment },
  flexFill: { flex: 1, backgroundColor: colors.parchment },
});