import { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Rye_400Regular } from '@expo-google-fonts/rye';
import { Arvo_400Regular, Arvo_700Bold } from '@expo-google-fonts/arvo';
import { supabase } from './lib/supabase';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameStartScreen from './screens/GameStartScreen';
import GameScreen from './screens/GameScreen';
import { colors } from './theme';
import OfflineSetupScreen from './screens/OfflineSetupScreen';
import OfflineGameScreen from './screens/OfflineGameScreen';
import OfflineGameStartScreen from './screens/OfflineGameStartScreen';
import { OfflineEngine } from './offline/engine';

type GameState = { gameId: string; playerId: string; joinCode?: string };
type Phase = 'home' | 'lobby' | 'preparing' | 'playing' | 'offline-setup' | 'offline-preparing' | 'offline-playing';

const STORAGE_KEY = 'bang_current_game';

export default function App() {
  const [fontsLoaded] = useFonts({ Rye_400Regular, Arvo_400Regular, Arvo_700Bold });
  const [ready, setReady] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [offlineEngine, setOfflineEngine] = useState<OfflineEngine | null>(null);
  const [phase, setPhase] = useState<Phase>('home');

  function persist(state: GameState | null) {
    if (state) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    else AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }

  function enterLobby(state: GameState) {
    setGameState(state);
    persist(state);
    setPhase('lobby');
  }

  function leaveGame() {
    setGameState(null);
    persist(null);
    setPhase('home');
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) Alert.alert('Erreur de connexion', error.message);
      }

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const state: GameState = JSON.parse(stored);
          const { data: game } = await supabase.from('games').select('status').eq('id', state.gameId).maybeSingle();
          const { data: player } = await supabase.from('players').select('id').eq('id', state.playerId).maybeSingle();
          if (game && player) {
            setGameState(state);
            // L'écran de préparation n'est rejoué qu'en direct — après reprise, on va droit à l'écran approprié.
            setPhase(game.status === 'lobby' ? 'lobby' : game.status === 'preparing' ? 'preparing' : 'playing');
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        // Reprise best-effort : en cas de souci, on repart simplement de l'accueil.
      }

      setReady(true);
    })();
  }, []);

  if (!fontsLoaded || !ready) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={colors.leather} /></SafeAreaView>;
  }

  if (phase === 'offline-playing' && offlineEngine) {
    return (
      <SafeAreaView style={styles.flexFill}>
        <OfflineGameScreen engine={offlineEngine} onLeave={() => { setOfflineEngine(null); setPhase('home'); }} />
      </SafeAreaView>
    );
  }

  if (phase === 'offline-preparing' && offlineEngine) {
    return (
      <SafeAreaView style={styles.flexFill}>
        <OfflineGameStartScreen engine={offlineEngine} onReady={() => setPhase('offline-playing')} />
      </SafeAreaView>
    );
  }

  if (phase === 'offline-setup') {
    return (
      <SafeAreaView style={styles.flexFill}>
        <OfflineSetupScreen
          onStart={(nickname, botCount) => { setOfflineEngine(OfflineEngine.create(nickname, botCount)); setPhase('offline-preparing'); }}
          onCancel={() => setPhase('home')}
        />
      </SafeAreaView>
    );
  }

  if (gameState && phase === 'playing') {
    return (
      <SafeAreaView style={styles.flexFill}>
        <GameScreen gameId={gameState.gameId} playerId={gameState.playerId} onLeave={leaveGame} />
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
        <LobbyScreen
          gameId={gameState.gameId}
          playerId={gameState.playerId}
          joinCode={gameState.joinCode}
          onGameStarted={() => setPhase('preparing')}
          onLeft={leaveGame}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flexFill}>
      <HomeScreen onJoined={enterLobby} onOfflineRequested={() => setPhase('offline-setup')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.parchment },
  flexFill: { flex: 1, backgroundColor: colors.parchment },
});