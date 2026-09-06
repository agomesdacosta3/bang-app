import { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';

type Player = { id: string; seat_position: number };

export default function LobbyScreen({
  gameId, playerId, joinCode, onGameStarted,
}: {
  gameId: string; playerId: string; joinCode?: string; onGameStarted: () => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      const { data } = await supabase.from('players').select('id, seat_position').eq('game_id', gameId).order('seat_position');
      if (active && data) setPlayers(data);
    }

    async function checkAlreadyStarted() {
      const { data } = await supabase.from('games').select('status').eq('id', gameId).single();
      if (active && data?.status === 'in_progress') onGameStarted();
    }

    loadPlayers();
    checkAlreadyStarted();

    const channel = supabase
      .channel(`lobby-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, loadPlayers)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload: any) => {
        if (payload.new.status === 'in_progress') onGameStarted();
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [gameId]);

  async function handleStart() {
    setStarting(true);
    try {
      await callFunction('start-game', { gameId });
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? String(err));
    } finally {
      setStarting(false);
    }
  }

  const canStart = players.length >= 4 && players.length <= 7;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Salle d'attente</Text>
      {joinCode && <Text style={styles.code}>Code : {joinCode}</Text>}
      <Text style={styles.subtitle}>{players.length} joueur(s)</Text>
      <FlatList
        data={players}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <Text style={styles.playerRow}>Siège {item.seat_position}{item.id === playerId ? ' (vous)' : ''}</Text>
        )}
        style={styles.list}
      />
      <Button title="Démarrer la partie" onPress={handleStart} disabled={!canStart || starting} />
      {!canStart && <Text style={styles.hint}>Entre 4 et 7 joueurs requis</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 60, gap: 12 },
  title: { fontSize: 28, fontWeight: 'bold' },
  code: { fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  subtitle: { fontSize: 16, color: '#555' },
  list: { width: '100%', marginVertical: 16 },
  playerRow: { fontSize: 18, paddingVertical: 6, textAlign: 'center' },
  hint: { color: '#999', marginTop: 8 },
});