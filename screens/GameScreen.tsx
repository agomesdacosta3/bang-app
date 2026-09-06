import { useEffect, useState, useRef } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert, Modal, Pressable } from 'react-native';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { computeDistance, SeatedPlayer } from '../lib/distance';

type Game = {
  id: string; status: string; current_player_id: string | null; turn_phase: string | null;
  pending_type: string | null; pending_expires_at: string | null; winner_team: string | null;
};
type Player = SeatedPlayer & { is_sheriff: boolean; life_points: number; max_life_points: number };
type HandCard = { id: string; card_type: string };
type Equipment = { player_id: string; card_type: string };

const CARD_LABELS: Record<string, string> = {
  bang: 'Bang!', missed: 'Raté!', beer: 'Bière', duel: 'Duel', indians: 'Indiens!',
  prison: 'Prison', dynamite: 'Dynamite', barrel: 'Planque',
};
const EQUIPMENT_TAGS: Record<string, string> = { prison: '🔒', dynamite: '💣', barrel: '🛢️' };
const ROLE_LABELS: Record<string, string> = { sheriff: 'Shérif', deputy: 'Adjoint', outlaw: 'Hors-la-loi', renegade: 'Renégat' };
const SUIT_LABELS: Record<string, string> = { hearts: 'Cœur', diamonds: 'Carreau', clubs: 'Trèfle', spades: 'Pique' };

export default function GameScreen({ gameId, playerId, onLeave }: { gameId: string; playerId: string; onLeave: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [hand, setHand] = useState<HandCard[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, string>>({});
  const [myPendingRow, setMyPendingRow] = useState<{ is_current_turn: boolean; barrel_tried: boolean } | null>(null);
  const [targetPickerFor, setTargetPickerFor] = useState<string | null>(null);
  const [duelTargetPickerFor, setDuelTargetPickerFor] = useState<string | null>(null);
  const [prisonTargetPickerFor, setPrisonTargetPickerFor] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [channelStatus, setChannelStatus] = useState('(pas encore connecté)');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const firedTimeoutRef = useRef(false);

  const me = players.find(p => p.id === playerId);
  const isMyTurn = game?.current_player_id === playerId;
  const hasPending = !!game?.pending_type;

  async function loadAll() {
    const { data: g } = await supabase.from('games').select('*').eq('id', gameId).single();
    const { data: p } = await supabase.from('players').select('*').eq('game_id', gameId).order('seat_position');
    const { data: h } = await supabase.from('hand_cards').select('id, card_type').eq('player_id', playerId);
    const { data: pending } = await supabase.from('pending_targets').select('is_current_turn, barrel_tried').eq('game_id', gameId).eq('player_id', playerId).maybeSingle();
    const { data: eq } = p?.length ? await supabase.from('cards_in_play').select('player_id, card_type').in('player_id', p.map(pl => pl.id)) : { data: [] };

    const eliminatedIds = (p ?? []).filter(pl => !pl.is_alive).map(pl => pl.id);
    const idsForRoles = Array.from(new Set([...eliminatedIds, playerId]));
    const { data: roles } = await supabase.from('player_roles').select('player_id, role').in('player_id', idsForRoles);
    const map: Record<string, string> = {};
    (roles ?? []).forEach(r => { map[r.player_id] = r.role; });

    if (g) setGame(g);
    if (p) setPlayers(p);
    if (h) setHand(h);
    setMyPendingRow(pending ?? null);
    setEquipment(eq ?? []);
    setRolesMap(map);
    setLastSync(new Date().toLocaleTimeString());
  }

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hand_cards', filter: `player_id=eq.${playerId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_targets', filter: `game_id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards_in_play' }, loadAll)
      .subscribe((status) => setChannelStatus(status));
    return () => { supabase.removeChannel(channel); };
  }, [gameId, playerId]);

  // Compteur visible + déclenchement automatique du timeout, revérifié chaque seconde
  useEffect(() => {
    firedTimeoutRef.current = false;
    if (!game?.pending_expires_at) { setSecondsLeft(null); return; }
    const expiresAt = new Date(game.pending_expires_at).getTime();

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !firedTimeoutRef.current) {
        firedTimeoutRef.current = true;
        supabase.functions.invoke('resolve-timeout', { body: { gameId } }).catch(() => {});
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [game?.pending_expires_at, gameId]);

  async function runAction(action: () => Promise<void>) {
    if (actionLoading) return;
    setActionLoading(true);
    try { await action(); } catch (err: any) { Alert.alert('Erreur', err.message); } finally { setActionLoading(false); }
  }

  const handleDraw = () => runAction(() => callFunction('draw-cards', { gameId }));
  const handlePlayBeer = () => runAction(() => callFunction('play-beer', { gameId }));
  const handlePlayBang = (targetPlayerId: string) => {
    setTargetPickerFor(null);
    return runAction(() => callFunction('play-bang', { gameId, targetPlayerId }));
  };
  const handlePlayDuel = (targetPlayerId: string) => {
    setDuelTargetPickerFor(null);
    return runAction(() => callFunction('play-duel', { gameId, targetPlayerId }));
  };
  const handlePlayIndians = () => runAction(() => callFunction('play-indians', { gameId }));
  const handlePlayPrison = (targetPlayerId: string) => {
    setPrisonTargetPickerFor(null);
    return runAction(() => callFunction('play-prison', { gameId, targetPlayerId }));
  };
  const handlePlayDynamite = () => runAction(() => callFunction('play-dynamite', { gameId }));
  const handlePlayBarrel = () => runAction(() => callFunction('play-barrel', { gameId }));
  const handleRespond = (action: 'missed' | 'accept_damage') => runAction(() => callFunction('respond-bang', { gameId, action }));

  async function handleTryBarrel() {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const result = await callFunction('respond-bang', { gameId, action: 'try_barrel' });
      if (result?.barrelWorked === false) {
        Alert.alert('Planque ratée', `Carte tirée : ${SUIT_LABELS[result.drawnSuit] ?? result.drawnSuit}. Choisissez une autre réponse.`);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const handleRespondDuel = (action: 'discard_bang' | 'accept_damage') => runAction(() => callFunction('respond-duel', { gameId, action }));
  const handleRespondIndians = (action: 'discard_bang' | 'accept_damage') => runAction(() => callFunction('respond-indians', { gameId, action }));

  function toggleDiscardSelection(cardId: string) {
    setSelectedDiscards(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]);
  }

  function handleConfirmEndTurn() {
    const excess = hand.length - (me?.life_points ?? 0);
    if (excess > 0 && selectedDiscards.length !== excess) {
      Alert.alert('Défausse incomplète', `Sélectionne exactement ${excess} carte(s).`);
      return;
    }
    return runAction(async () => {
      await callFunction('discard-cards', { gameId, cardIds: selectedDiscards });
      setDiscarding(false);
      setSelectedDiscards([]);
    });
  }

  if (!game || !me) return <View style={styles.container}><Text>Chargement...</Text></View>;

  if (game.status === 'finished') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Partie terminée</Text>
        <Text style={styles.subtitle}>Camp vainqueur : {game.winner_team}</Text>
        <View style={styles.spacer} />
        <Button title="Retour à l'accueil" onPress={onLeave} />
      </View>
    );
  }

  const myRole = me.is_sheriff ? 'sheriff' : rolesMap[playerId];
  const myEquipmentTypes = equipment.filter(e => e.player_id === playerId).map(e => e.card_type);
  const excess = hand.length - me.life_points;
  const aliveCount = players.filter(p => p.is_alive).length;
  const hasMissed = hand.some(c => c.card_type === 'missed');
  const hasBang = hand.some(c => c.card_type === 'bang');
  const hasBarrelInPlay = myEquipmentTypes.includes('barrel');
  const canTryBarrel = hasBarrelInPlay && !myPendingRow?.barrel_tried;
  const targets = players.filter(p => p.is_alive && p.id !== playerId && computeDistance(players, playerId, p.id) <= 1);
  const duelTargets = players.filter(p => p.is_alive && p.id !== playerId);
  const prisonTargets = players.filter(p => p.is_alive && p.id !== playerId && !p.is_sheriff && !equipment.some(e => e.player_id === p.id && e.card_type === 'prison'));

  const canDraw = isMyTurn && !hasPending && game.turn_phase === 'draw';
  const canAct = isMyTurn && !hasPending && game.turn_phase === 'play' && !discarding;
  const canPlayBang = canAct && targets.length > 0;
  const canPlayBeer = canAct && aliveCount > 2 && me.life_points < me.max_life_points;
  const canPlayDuel = canAct && duelTargets.length > 0;
  const canPlayIndians = canAct;
  const canPlayPrison = canAct && prisonTargets.length > 0;
  const canPlayDynamite = canAct && !myEquipmentTypes.includes('dynamite');
  const canPlayBarrel = canAct && !hasBarrelInPlay;

  const mustRespondToBang = myPendingRow && game.pending_type === 'bang_response';
  const mustRespondToDuel = myPendingRow?.is_current_turn && game.pending_type === 'duel_response';
  const mustRespondToIndians = myPendingRow && game.pending_type === 'indians_response';
  const waitingOnOthers = hasPending && !mustRespondToBang && !mustRespondToDuel && !mustRespondToIndians;

  const timerLabel = secondsLeft !== null ? `⏱ ${secondsLeft}s` : '';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vie : {me.life_points}/{me.max_life_points}{me.is_sheriff ? ' 🎖️' : ''}</Text>
      <Text style={styles.subtitle}>Votre rôle : {ROLE_LABELS[myRole] ?? '...'}</Text>
      <Text style={styles.hint}>Dernière synchro : {lastSync || '—'}</Text>
      <Text style={styles.hint}>Canal : {channelStatus}</Text>

      {mustRespondToBang && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>Vous êtes visé par un Bang! Répondez : {timerLabel}</Text>
          {hasMissed && <Button title="Jouer Raté!" onPress={() => handleRespond('missed')} disabled={actionLoading} />}
          {canTryBarrel && <Button title="Essayer la Planque" onPress={handleTryBarrel} disabled={actionLoading} />}
          <View style={styles.spacer} />
          <Button title="Encaisser les dégâts" color="#a33" onPress={() => handleRespond('accept_damage')} disabled={actionLoading} />
        </View>
      )}

      {mustRespondToDuel && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>Duel ! Continuez ou encaissez : {timerLabel}</Text>
          {hasBang && <Button title="Jouer Bang!" onPress={() => handleRespondDuel('discard_bang')} disabled={actionLoading} />}
          <View style={styles.spacer} />
          <Button title="Encaisser les dégâts" color="#a33" onPress={() => handleRespondDuel('accept_damage')} disabled={actionLoading} />
        </View>
      )}

      {mustRespondToIndians && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>Indiens! Défendez-vous ou encaissez : {timerLabel}</Text>
          {hasBang && <Button title="Jouer Bang!" onPress={() => handleRespondIndians('discard_bang')} disabled={actionLoading} />}
          <View style={styles.spacer} />
          <Button title="Encaisser les dégâts" color="#a33" onPress={() => handleRespondIndians('accept_damage')} disabled={actionLoading} />
        </View>
      )}

      {waitingOnOthers && <Text style={styles.pendingTitle}>En attente ({game.pending_type})... {timerLabel}</Text>}

      {!hasPending && !isMyTurn && (
        <Text style={styles.subtitle}>En attente du joueur au siège {players.find(p => p.id === game.current_player_id)?.seat_position}...</Text>
      )}

      <Text style={styles.sectionTitle}>Votre main</Text>
      {!discarding && (
        <FlatList
          data={hand}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>{CARD_LABELS[item.card_type] ?? item.card_type}</Text>
              {item.card_type === 'bang' && canPlayBang && <Button title="Jouer" onPress={() => setTargetPickerFor(item.id)} disabled={actionLoading} />}
              {item.card_type === 'beer' && canPlayBeer && <Button title="Jouer" onPress={handlePlayBeer} disabled={actionLoading} />}
              {item.card_type === 'duel' && canPlayDuel && <Button title="Jouer" onPress={() => setDuelTargetPickerFor(item.id)} disabled={actionLoading} />}
              {item.card_type === 'indians' && canPlayIndians && <Button title="Jouer" onPress={handlePlayIndians} disabled={actionLoading} />}
              {item.card_type === 'prison' && canPlayPrison && <Button title="Jouer" onPress={() => setPrisonTargetPickerFor(item.id)} disabled={actionLoading} />}
              {item.card_type === 'dynamite' && canPlayDynamite && <Button title="Jouer" onPress={handlePlayDynamite} disabled={actionLoading} />}
              {item.card_type === 'barrel' && canPlayBarrel && <Button title="Jouer" onPress={handlePlayBarrel} disabled={actionLoading} />}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.hint}>Main vide</Text>}
        />
      )}

      {discarding && (
        <>
          <Text style={styles.subtitle}>Choisis {excess} carte(s) à défausser :</Text>
          <FlatList
            data={hand}
            keyExtractor={c => c.id}
            renderItem={({ item }) => (
              <Pressable style={styles.cardRow} onPress={() => toggleDiscardSelection(item.id)}>
                <Text style={styles.cardLabel}>
                  {selectedDiscards.includes(item.id) ? '☑' : '☐'} {CARD_LABELS[item.card_type] ?? item.card_type}
                </Text>
              </Pressable>
            )}
          />
          <Button title="Confirmer la défausse" onPress={handleConfirmEndTurn} disabled={actionLoading} />
          <View style={styles.spacer} />
          <Button title="Annuler" color="#999" onPress={() => { setDiscarding(false); setSelectedDiscards([]); }} disabled={actionLoading} />
        </>
      )}

      {canDraw && <Button title="Piocher" onPress={handleDraw} disabled={actionLoading} />}

      {canAct && (
        <Button title={excess > 0 ? `Terminer le tour (défausser ${excess})` : 'Terminer le tour'} onPress={() => (excess > 0 ? setDiscarding(true) : handleConfirmEndTurn())} disabled={actionLoading} />
      )}

      <Text style={styles.sectionTitle}>Joueurs</Text>
      <FlatList
        data={players}
        keyExtractor={p => p.id}
        renderItem={({ item }) => {
          const tags = equipment.filter(e => e.player_id === item.id).map(e => EQUIPMENT_TAGS[e.card_type]).join(' ');
          const role = item.is_sheriff ? 'sheriff' : rolesMap[item.id];
          const roleLabel = !item.is_alive && role ? ` — ${ROLE_LABELS[role] ?? role}` : '';
          return (
            <Text style={styles.playerRow}>
              Siège {item.seat_position}{item.is_sheriff ? ' 🎖️' : ''} — {item.is_alive ? `${item.life_points} PV` : 'éliminé' + roleLabel}{item.id === playerId ? ' (vous)' : ''} {tags}
            </Text>
          );
        }}
      />

      <Modal visible={!!targetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Choisir une cible (portée 1) :</Text>
            {targets.map(t => <Button key={t.id} title={`Siège ${t.seat_position}`} onPress={() => handlePlayBang(t.id)} />)}
            <View style={styles.spacer} />
            <Button title="Annuler" color="#999" onPress={() => setTargetPickerFor(null)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!duelTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Choisir une cible pour le Duel :</Text>
            {duelTargets.map(t => <Button key={t.id} title={`Siège ${t.seat_position}`} onPress={() => handlePlayDuel(t.id)} />)}
            <View style={styles.spacer} />
            <Button title="Annuler" color="#999" onPress={() => setDuelTargetPickerFor(null)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!prisonTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Choisir une cible pour Prison :</Text>
            {prisonTargets.map(t => <Button key={t.id} title={`Siège ${t.seat_position}`} onPress={() => handlePlayPrison(t.id)} />)}
            <View style={styles.spacer} />
            <Button title="Annuler" color="#999" onPress={() => setPrisonTargetPickerFor(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
  subtitle: { fontSize: 16, marginTop: 12, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
  cardLabel: { fontSize: 16 },
  playerRow: { fontSize: 15, paddingVertical: 4 },
  pendingBox: { backgroundColor: '#fee', padding: 16, borderRadius: 8, marginVertical: 12, gap: 8 },
  pendingTitle: { fontWeight: 'bold', marginBottom: 4 },
  spacer: { height: 8 },
  hint: { color: '#999', fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: 'white', padding: 24, borderRadius: 12, width: '80%', gap: 8 },
});