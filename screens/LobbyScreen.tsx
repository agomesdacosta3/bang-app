import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { colors, fonts } from '../theme';
import WoodButton from '../components/WoodButton';

type Player = { id: string; seat_position: number; is_ready: boolean; nickname: string | null };

export default function LobbyScreen({
  gameId, playerId, joinCode, onGameStarted, onLeft,
}: {
  gameId: string; playerId: string; joinCode?: string; onGameStarted: () => void; onLeft: () => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const me = players.find(p => p.id === playerId);

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      const { data } = await supabase.from('players').select('id, seat_position, is_ready, nickname').eq('game_id', gameId).order('seat_position');
      if (active && data) setPlayers(data);
    }

    async function checkAlreadyStarted() {
      const { data } = await supabase.from('games').select('status').eq('id', gameId).single();
      if (active && (data?.status === 'preparing' || data?.status === 'in_progress')) onGameStarted();
    }

    loadPlayers();
    checkAlreadyStarted();

    const channel = supabase
      .channel(`lobby-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, loadPlayers)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload: any) => {
        if (payload.new.status === 'preparing' || payload.new.status === 'in_progress') onGameStarted();
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [gameId]);

  useEffect(() => {
    if (me?.nickname && !nicknameInput) setNicknameInput(me.nickname);
  }, [me?.nickname]);

  async function handleSaveNickname() {
    if (!nicknameInput.trim()) { Alert.alert('Pseudo requis', 'Entre un pseudo avant de continuer.'); return; }
    setSavingNickname(true);
    try {
      await callFunction('set-nickname', { gameId, nickname: nicknameInput.trim() });
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? String(err));
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleToggleReady() {
    setTogglingReady(true);
    try {
      await callFunction('toggle-ready', { gameId });
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? String(err));
    } finally {
      setTogglingReady(false);
    }
  }

  function handleLeave() {
    Alert.alert('Quitter la partie', 'Es-tu sûr de vouloir quitter cette salle d\u2019attente ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter', style: 'destructive', onPress: async () => {
          setLeaving(true);
          try {
            await callFunction('leave-lobby', { gameId });
            onLeft();
          } catch (err: any) {
            Alert.alert('Erreur', err.message ?? String(err));
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <Text style={styles.title}>Salle d'attente</Text>
        {joinCode && (
          <View style={styles.codeBadge}>
            <Text style={styles.codeLabel}>Code de la partie</Text>
            <Text style={styles.codeValue}>{joinCode}</Text>
          </View>
        )}
        <Text style={styles.subtitle}>{players.length} joueur(s)</Text>

        <View style={styles.nicknameRow}>
          <TextInput
            style={styles.nicknameInput}
            placeholder="Votre pseudo"
            placeholderTextColor="#8A7256"
            maxLength={20}
            value={nicknameInput}
            onChangeText={setNicknameInput}
          />
          <WoodButton title="Valider" onPress={handleSaveNickname} disabled={savingNickname} style={styles.nicknameBtn} />
        </View>

        <FlatList
          data={players}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <View style={styles.playerRow}>
              <View style={styles.seatBadge}><Text style={styles.seatBadgeText}>{item.seat_position}</Text></View>
              <Text style={styles.playerName}>
                {item.nickname ?? `Joueur du siège ${item.seat_position}`}{item.id === playerId ? ' (vous)' : ''}
              </Text>
              <Text style={item.is_ready ? styles.readyBadge : styles.notReadyBadge}>{item.is_ready ? '✓ Prêt' : 'En attente'}</Text>
            </View>
          )}
          style={styles.list}
        />

        <WoodButton
          title={me?.is_ready ? 'Je ne suis plus prêt' : 'Je suis prêt'}
          onPress={handleToggleReady}
          disabled={togglingReady || !me?.nickname}
          variant={me?.is_ready ? 'muted' : 'primary'}
          style={styles.button}
        />
        {!me?.nickname && <Text style={styles.hint}>Choisis un pseudo avant de pouvoir te déclarer prêt.</Text>}
        <Text style={styles.hint}>La partie démarre automatiquement dès que tout le monde (4 à 7 joueurs) est prêt.</Text>

        <WoodButton title="Quitter la partie" onPress={handleLeave} disabled={leaving} variant="muted" style={styles.button} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1, backgroundColor: colors.parchment },
  container: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 60, gap: 10, backgroundColor: colors.parchment },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.leatherDark },
  codeBadge: {
    borderWidth: 2, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.parchmentLight,
    paddingVertical: 8, paddingHorizontal: 20, alignItems: 'center', marginTop: 8,
  },
  codeLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.leatherDark },
  codeValue: { fontFamily: fonts.display, fontSize: 26, color: colors.brass, letterSpacing: 3 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.leatherDark },
  nicknameRow: { flexDirection: 'row', gap: 8, width: '100%', alignItems: 'center', marginTop: 4 },
  nicknameInput: {
    flex: 1, borderWidth: 2, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.parchmentLight,
    paddingVertical: 10, paddingHorizontal: 12, fontFamily: fonts.body, fontSize: 14, color: colors.ink,
  },
  nicknameBtn: { paddingVertical: 10 },
  list: { width: '100%', marginVertical: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(43,27,18,0.15)' },
  seatBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.leather, alignItems: 'center', justifyContent: 'center' },
  seatBadgeText: { fontFamily: fonts.bodyBold, color: colors.parchmentLight, fontSize: 12 },
  playerName: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, flex: 1 },
  readyBadge: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.sage },
  notReadyBadge: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, fontStyle: 'italic' },
  button: { width: 260, marginTop: 8 },
  hint: { fontFamily: fonts.body, color: colors.leatherDark, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },
});