import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, fonts } from '../theme';
import WoodButton from '../components/WoodButton';

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
      const { error } = await supabase.functions.invoke('start-game', { body: { gameId } });
      if (error) throw error;
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
      {joinCode && (
        <View style={styles.codeBadge}>
          <Text style={styles.codeLabel}>Code de la partie</Text>
          <Text style={styles.codeValue}>{joinCode}</Text>
        </View>
      )}
      <Text style={styles.subtitle}>{players.length} joueur(s)</Text>
      <FlatList
        data={players}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <View style={styles.seatBadge}><Text style={styles.seatBadgeText}>{item.seat_position}</Text></View>
            <Text style={styles.playerName}>Siège {item.seat_position}{item.id === playerId ? ' (vous)' : ''}</Text>
          </View>
        )}
        style={styles.list}
      />
      <WoodButton title="Démarrer la partie" onPress={handleStart} disabled={!canStart || starting} variant="primary" style={styles.button} />
      {!canStart && <Text style={styles.hint}>Entre 4 et 7 joueurs requis</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 60, gap: 12, backgroundColor: colors.parchment },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.leatherDark },
  codeBadge: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    backgroundColor: colors.parchmentLight,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  codeLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.leatherDark },
  codeValue: { fontFamily: fonts.display, fontSize: 26, color: colors.brass, letterSpacing: 3 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.leatherDark },
  list: { width: '100%', marginVertical: 12 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(43,27,18,0.15)' },
  seatBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.leather, alignItems: 'center', justifyContent: 'center' },
  seatBadgeText: { fontFamily: fonts.bodyBold, color: colors.parchmentLight, fontSize: 12 },
  playerName: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  button: { width: 240, marginTop: 12 },
  hint: { fontFamily: fonts.body, color: colors.leatherDark, fontSize: 12, fontStyle: 'italic' },
});