import { useEffect, useState, useRef } from 'react';
import { View, Text, Button, StyleSheet, Alert, Modal, Pressable, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { computeDistance, SeatedPlayer } from '../lib/distance';
import { getWeaponRange, WEAPON_TYPES } from '../lib/weapons';

type Game = {
  id: string; status: string; current_player_id: string | null; turn_phase: string | null;
  pending_type: string | null; pending_initiator_id: string | null; pending_expires_at: string | null; winner_team: string | null;
};
type Player = SeatedPlayer & { is_sheriff: boolean; life_points: number; max_life_points: number; has_played_bang_this_turn: boolean };
type HandCard = { id: string; card_type: string };
type Equipment = { player_id: string; card_type: string };
type StoreCard = { id: string; card_type: string; suit: string; value: number };
type PendingTargetRow = { player_id: string; is_current_turn: boolean };
type GameEvent = { id: string; event_type: string; actor_seat: number | null; amount: number | null; card_type: string | null };

const CARD_LABELS: Record<string, string> = {
  bang: 'Bang!', missed: 'Raté!', beer: 'Bière', duel: 'Duel', indians: 'Indiens!',
  prison: 'Prison', dynamite: 'Dynamite', barrel: 'Planque',
  saloon: 'Saloon', stagecoach: 'Diligence', wells_fargo: 'Convoi', mustang: 'Mustang', scope: 'Lunette',
  panic: 'Braquage!', cat_balou: 'Coup de foudre', gatling: 'Gatling', general_store: 'Magasin',
  schofield: 'Schofield', remington: 'Remington', carbine: 'Carabine', winchester: 'Winchester', volcanic: 'Volcanic',
};
const EQUIPMENT_TAGS: Record<string, string> = {
  prison: '🔒', dynamite: '💣', barrel: '🛢️', mustang: '🐎', scope: '🔭',
  schofield: '🔫', remington: '🔫', carbine: '🔫', winchester: '🔫', volcanic: '🌋',
};

const ROLE_LABELS: Record<string, string> = { sheriff: 'Shérif', deputy: 'Adjoint', outlaw: 'Hors-la-loi', renegade: 'Renégat' };
const CHARACTER_LABELS: Record<string, string> = {
  bart_cassidy: 'Bart Cassidy', black_jack: 'Black Jack', calamity_janet: 'Calamity Janet', el_gringo: 'El Gringo',
  jesse_jones: 'Jesse Jones', jourdonnais: 'Jourdonnais', kit_carlson: 'Kit Carlson', lucky_duke: 'Lucky Duke',
  paul_regret: 'Paul Regret', pedro_ramirez: 'Pedro Ramirez', rose_doolan: 'Rose Doolan', sid_ketchum: 'Sid Ketchum',
  slab_the_killer: 'Slab le Flingueur', suzy_lafayette: 'Suzy Lafayette', vulture_sam: 'Sam le Vautour', willy_the_kid: 'Willy le Kid',
};
const SUIT_LABELS: Record<string, string> = { hearts: 'Cœur', diamonds: 'Carreau', clubs: 'Trèfle', spades: 'Pique' };

function describeOutcome(recentEvents: GameEvent[]): string {
  const latest = recentEvents[0];
  if (!latest) return 'Résolu.';
  switch (latest.event_type) {
    case 'player_eliminated': return `Siège ${latest.actor_seat} a encaissé le tir et a été éliminé !`;
    case 'damage_taken': return `Siège ${latest.actor_seat} a encaissé ${latest.amount ?? 1} point(s) de vie`;
    case 'missed_played': return `Siège ${latest.actor_seat} a esquivé avec Raté!`;
    case 'barrel_used': return `Siège ${latest.actor_seat} a esquivé avec la Planque !`;
    case 'indians_defended': return `Siège ${latest.actor_seat} a défendu avec Bang! contre Indiens!`;
    case 'store_card_taken': return `Siège ${latest.actor_seat} a récupéré : ${CARD_LABELS[latest.card_type ?? ''] ?? latest.card_type}`;
    case 'card_discarded_forced': return `Siège ${latest.actor_seat} a défaussé : ${CARD_LABELS[latest.card_type ?? ''] ?? latest.card_type}`;
    default: return 'Résolu.';
  }
}

export default function GameScreen({ gameId, playerId, onLeave }: { gameId: string; playerId: string; onLeave: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [hand, setHand] = useState<HandCard[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, string>>({});
  const [charactersMap, setCharactersMap] = useState<Record<string, string>>({});
  const [myPendingRow, setMyPendingRow] = useState<{ is_current_turn: boolean; barrel_tried: boolean } | null>(null);
  const [allPendingTargets, setAllPendingTargets] = useState<PendingTargetRow[]>([]);
  const [storeCards, setStoreCards] = useState<StoreCard[]>([]);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [targetPickerFor, setTargetPickerFor] = useState<string | null>(null);
  const [duelTargetPickerFor, setDuelTargetPickerFor] = useState<string | null>(null);
  const [prisonTargetPickerFor, setPrisonTargetPickerFor] = useState<string | null>(null);
  const [panicTargetPickerFor, setPanicTargetPickerFor] = useState<string | null>(null);
  const [catbalouTargetPickerFor, setCatbalouTargetPickerFor] = useState<string | null>(null);
  const [stealFlow, setStealFlow] = useState<{ targetId: string } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [channelStatus, setChannelStatus] = useState('(pas encore connecté)');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const firedTimeoutRef = useRef(false);
  const pendingWatchRef = useRef<string | null>(null);

  const me = players.find(p => p.id === playerId);
  const amDead = me ? !me.is_alive : false;
  const isMyTurn = game?.current_player_id === playerId;
  const hasPending = !!game?.pending_type;

  function seatOf(id: string | null | undefined): number | null {
    return players.find(p => p.id === id)?.seat_position ?? null;
  }

  function describePendingSituation(): string {
    if (!game?.pending_type) return '';
    const actorSeat = seatOf(game.pending_initiator_id);
    const targetSeats = allPendingTargets.map(pt => seatOf(pt.player_id)).filter((s): s is number => s !== null);

    switch (game.pending_type) {
      case 'bang_response':
        return `Siège ${actorSeat} tire sur Siège ${targetSeats[0]} — en attente de sa réponse...`;
      case 'gatling_response':
        return `Siège ${actorSeat} a joué Gatling — en attente de ${targetSeats.length} réponse(s)`;
      case 'duel_response': {
        const current = allPendingTargets.find(pt => pt.is_current_turn);
        const currentSeat = seatOf(current?.player_id);
        return `Duel entre Siège ${actorSeat} et Siège ${targetSeats.find(s => s !== actorSeat)} — en attente de Siège ${currentSeat}`;
      }
      case 'indians_response':
        return `Siège ${actorSeat} a joué Indiens! — en attente de ${targetSeats.length} réponse(s)`;
      case 'cat_balou_discard':
        return `Siège ${actorSeat} a joué Coup de foudre sur Siège ${targetSeats[0]} — en attente de son choix`;
      case 'general_store': {
        const current = allPendingTargets.find(pt => pt.is_current_turn);
        const currentSeat = seatOf(current?.player_id);
        return `Magasin en cours — au tour de Siège ${currentSeat} de choisir`;
      }
      default:
        return 'Une action est en cours...';
    }
  }

  async function loadAll() {
    const { data: g } = await supabase.from('games').select('*').eq('id', gameId).single();
    const { data: p } = await supabase.from('players').select('*').eq('game_id', gameId).order('seat_position');
    const { data: h } = await supabase.from('hand_cards').select('id, card_type').eq('player_id', playerId);
    const { data: pending } = await supabase.from('pending_targets').select('is_current_turn, barrel_tried').eq('game_id', gameId).eq('player_id', playerId).maybeSingle();
    const { data: allPt } = await supabase.from('pending_targets').select('player_id, is_current_turn').eq('game_id', gameId);
    const { data: eq } = p?.length ? await supabase.from('cards_in_play').select('player_id, card_type').in('player_id', p.map(pl => pl.id)) : { data: [] };
    const { data: sc } = await supabase.from('general_store_cards').select('id, card_type, suit, value').eq('game_id', gameId);
    const { data: hc } = p?.length ? await supabase.from('hand_counts').select('player_id, count').in('player_id', p.map(pl => pl.id)) : { data: [] };

    const eliminatedIds = (p ?? []).filter(pl => !pl.is_alive).map(pl => pl.id);
    const idsForRoles = Array.from(new Set([...eliminatedIds, playerId]));
    const { data: roles } = await supabase.from('player_roles').select('player_id, role').in('player_id', idsForRoles);
    const map: Record<string, string> = {};
    (roles ?? []).forEach(r => { map[r.player_id] = r.role; });
    const hcMap: Record<string, number> = {};
    (hc ?? []).forEach(r => { hcMap[r.player_id] = r.count; });
    const { data: chars } = p?.length ? await supabase.from('player_characters').select('player_id, character').in('player_id', p.map(pl => pl.id)) : { data: [] };
    const charMap: Record<string, string> = {};
    (chars ?? []).forEach(c => { charMap[c.player_id] = c.character; });

    if (g) setGame(g);
    if (p) setPlayers(p);
    if (h) setHand(h);
    setMyPendingRow(pending ?? null);
    setAllPendingTargets(allPt ?? []);
    setEquipment(eq ?? []);
    setStoreCards(sc ?? []);
    setHandCounts(hcMap);
    setRolesMap(map);
    setCharactersMap(charMap);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'general_store_cards', filter: `game_id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_characters' }, loadAll)
      .subscribe((status) => setChannelStatus(status));
    return () => { supabase.removeChannel(channel); };
  }, [gameId, playerId]);

  // Filet de sécurité : resynchronise tout l'état même si un événement Realtime a été manqué
  useEffect(() => {
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [gameId, playerId]);

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

  // Pop-up de résultat pour l'acteur qui a initié l'action en attente
  useEffect(() => {
    if (game?.pending_type && game.pending_initiator_id === playerId) {
      pendingWatchRef.current = game.pending_type;
    } else if (!game?.pending_type && pendingWatchRef.current) {
      pendingWatchRef.current = null;
      if (game?.status !== 'finished') {
        (async () => {
          const { data: recent } = await supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at', { ascending: false }).limit(2);
          if (recent?.length) {
            Alert.alert('Résultat', describeOutcome(recent as GameEvent[]));
          }
        })();
      }
    }
  }, [game?.pending_type, game?.pending_initiator_id, game?.status, gameId, playerId]);

  async function runAction(action: () => Promise<void>) {
    if (actionLoading) return;
    setActionLoading(true);
    try { await action(); } catch (err: any) { Alert.alert('Erreur', err.message); } finally { setActionLoading(false); }
  }

  const handleDegainer = () => runAction(() => callFunction('resolve-start-of-turn', { gameId }));
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
  const handlePlaySaloon = () => runAction(() => callFunction('play-saloon', { gameId }));
  const handlePlayStagecoach = () => runAction(() => callFunction('play-stagecoach', { gameId }));
  const handlePlayWellsFargo = () => runAction(() => callFunction('play-wells-fargo', { gameId }));
  const handlePlayMustang = () => runAction(() => callFunction('play-mustang', { gameId }));
  const handlePlayScope = () => runAction(() => callFunction('play-scope', { gameId }));
  const handlePlayGatling = () => runAction(() => callFunction('play-gatling', { gameId }));
  const handlePlayGeneralStore = () => runAction(() => callFunction('play-general-store', { gameId }));
  const handlePlayWeapon = (cardType: string) => runAction(() => callFunction('play-weapon', { gameId, cardType }));
  const handleRespond = (action: 'missed' | 'accept_damage') => runAction(() => callFunction('respond-bang', { gameId, action }));
  const handleRespondGatling = (action: 'missed' | 'accept_damage') => runAction(() => callFunction('respond-gatling', { gameId, action }));
  const handleRespondDuel = (action: 'discard_bang' | 'accept_damage') => runAction(() => callFunction('respond-duel', { gameId, action }));
  const handleRespondIndians = (action: 'discard_bang' | 'accept_damage') => runAction(() => callFunction('respond-indians', { gameId, action }));
  const handlePickStoreCard = (cardId: string) => runAction(() => callFunction('pick-general-store-card', { gameId, cardId }));
  const handleRespondCatBalouHand = (handCardId: string) => runAction(() => callFunction('respond-catbalou', { gameId, handCardId }));
  const handleRespondCatBalouEquip = (inPlayCardType: string) => runAction(() => callFunction('respond-catbalou', { gameId, inPlayCardType }));
  const handlePlayCatBalou = (targetPlayerId: string) => {
    setCatbalouTargetPickerFor(null);
    return runAction(() => callFunction('play-catbalou', { gameId, targetPlayerId }));
  };

  async function handleSteal(source: 'hand' | 'in_play', cardType?: string) {
    if (!stealFlow || actionLoading) return;
    const { targetId } = stealFlow;
    setStealFlow(null);
    setActionLoading(true);
    try {
      const result = await callFunction('play-panic', { gameId, targetPlayerId: targetId, source, cardType });
      Alert.alert('Braquage!', `Vous avez récupéré : ${CARD_LABELS[result?.stolenCardType] ?? result?.stolenCardType ?? 'une carte'}`);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      setActionLoading(false);
    }
  }

    function handleOpenPanicPicker(cardId: string) {
    if (panicRangeTargets.length === 0) {
      Alert.alert('Braquage!', 'Aucun joueur n’est à portée pour utiliser Braquage!');
      return;
    }
    if (panicTargets.length === 0) {
      Alert.alert('Braquage!', 'Aucun joueur à portée n’a de carte à voler.');
      return;
    }
    setPanicTargetPickerFor(cardId);
  }

  function handleOpenCatBalouPicker(cardId: string) {
    if (catBalouTargets.length === 0) {
      Alert.alert('Coup de foudre', 'Aucun joueur n’a de carte à faire défausser.');
      return;
    }
    setCatbalouTargetPickerFor(cardId);
  }

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

  async function handleTryBarrelGatling() {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const result = await callFunction('respond-gatling', { gameId, action: 'try_barrel' });
      if (result?.barrelWorked === false) {
        Alert.alert('Planque ratée', `Carte tirée : ${SUIT_LABELS[result.drawnSuit] ?? result.drawnSuit}. Choisissez une autre réponse.`);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      setActionLoading(false);
    }
  }

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

  if (!game || !me) return <View style={styles.centerContainer}><Text>Chargement...</Text></View>;

  if (game.status === 'finished') {
    return (
      <View style={styles.centerContainer}>
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

  const mustangIds = new Set(equipment.filter(e => e.card_type === 'mustang').map(e => e.player_id));
  const scopeIds = new Set(equipment.filter(e => e.card_type === 'scope').map(e => e.player_id));
  players.forEach(p => {
    if (charactersMap[p.id] === 'paul_regret') mustangIds.add(p.id);
    if (charactersMap[p.id] === 'rose_doolan') scopeIds.add(p.id);
  });
  const equipmentFlags = { mustangIds, scopeIds };
  const myWeaponRange = getWeaponRange(myEquipmentTypes);
  const myWeaponType = myEquipmentTypes.find(t => WEAPON_TYPES.includes(t));
  const myWeaponName = myWeaponType ? (CARD_LABELS[myWeaponType] ?? myWeaponType) : 'Colt .45';
  const hasVolcanic = myEquipmentTypes.includes('volcanic');
  const bangTargets = players.filter(p => p.is_alive && p.id !== playerId && computeDistance(players, playerId, p.id, equipmentFlags) <= myWeaponRange);
  const duelTargets = players.filter(p => p.is_alive && p.id !== playerId);
  const prisonTargets = players.filter(p => p.is_alive && p.id !== playerId && !p.is_sheriff && !equipment.some(e => e.player_id === p.id && e.card_type === 'prison'));
  const hasAnyCards = (id: string) => (handCounts[id] ?? 0) > 0 || equipment.some(e => e.player_id === id);
  // Braquage! reste toujours à portée 1, contrairement à Bang! qui suit l'arme équipée
  const panicRangeTargets = players.filter(p => p.is_alive && p.id !== playerId && computeDistance(players, playerId, p.id, equipmentFlags) <= 1);
  const panicTargets = panicRangeTargets.filter(t => hasAnyCards(t.id));
  const catBalouTargets = duelTargets.filter(t => hasAnyCards(t.id));

  const needsDegainer = isMyTurn && !hasPending && game.turn_phase === 'draw' && myEquipmentTypes.some(t => t === 'dynamite' || t === 'prison');
  const canDraw = isMyTurn && !hasPending && game.turn_phase === 'draw' && !needsDegainer;
  const canAct = isMyTurn && !hasPending && game.turn_phase === 'play' && !discarding;
  const canPlayBang = canAct && bangTargets.length > 0 && (hasVolcanic || !me.has_played_bang_this_turn);
  const canPlayBeer = canAct && aliveCount > 2 && me.life_points < me.max_life_points;
  const canPlayDuel = canAct && duelTargets.length > 0;
  const canPlayIndians = canAct;
  const canPlayPrison = canAct && prisonTargets.length > 0;
  const canPlayDynamite = canAct && !myEquipmentTypes.includes('dynamite');
  const canPlayBarrel = canAct && !hasBarrelInPlay;
  const canPlaySaloon = canAct;
  const canPlayStagecoach = canAct;
  const canPlayWellsFargo = canAct;
  const canPlayMustang = canAct && !myEquipmentTypes.includes('mustang');
  const canPlayScope = canAct && !myEquipmentTypes.includes('scope');
  const canPlayPanic = canAct;
  const canPlayCatBalou = canAct;
  const canPlayGatling = canAct;
  const canPlayGeneralStore = canAct;
  const canPlayWeapon = canAct;

  const mustRespondToBang = myPendingRow && game.pending_type === 'bang_response';
  const mustRespondToGatling = myPendingRow && game.pending_type === 'gatling_response';
  const mustRespondToDuel = myPendingRow?.is_current_turn && game.pending_type === 'duel_response';
  const mustRespondToIndians = myPendingRow && game.pending_type === 'indians_response';
  const mustChooseCatBalouDiscard = myPendingRow && game.pending_type === 'cat_balou_discard';
  const isMyStoreTurn = myPendingRow?.is_current_turn && game.pending_type === 'general_store';
  const waitingOnOthers = hasPending && !mustRespondToBang && !mustRespondToGatling && !mustRespondToDuel && !mustRespondToIndians && !mustChooseCatBalouDiscard && !isMyStoreTurn;

  const timerLabel = secondsLeft !== null ? `⏱ ${secondsLeft}s` : '';

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Vie : {me.life_points}/{me.max_life_points}{me.is_sheriff ? ' 🎖️' : ''}</Text>
      <Text style={styles.subtitle}>Votre rôle : {ROLE_LABELS[myRole] ?? '...'}</Text>
      <Text style={styles.subtitle}>Personnage : {CHARACTER_LABELS[charactersMap[playerId]] ?? '...'}</Text>
      <Text style={styles.hint}>Arme équipée : {myWeaponName} (portée {myWeaponRange})</Text>
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

      {mustRespondToGatling && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>Gatling ! Répondez : {timerLabel}</Text>
          {hasMissed && <Button title="Jouer Raté!" onPress={() => handleRespondGatling('missed')} disabled={actionLoading} />}
          {canTryBarrel && <Button title="Essayer la Planque" onPress={handleTryBarrelGatling} disabled={actionLoading} />}
          <View style={styles.spacer} />
          <Button title="Encaisser les dégâts" color="#a33" onPress={() => handleRespondGatling('accept_damage')} disabled={actionLoading} />
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

      {mustChooseCatBalouDiscard && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>Coup de foudre ! Choisissez une carte à défausser (main ou en jeu) : {timerLabel}</Text>
          {hand.map(c => (
            <Button key={c.id} title={`${CARD_LABELS[c.card_type] ?? c.card_type} (main)`} onPress={() => handleRespondCatBalouHand(c.id)} disabled={actionLoading} />
          ))}
          {myEquipmentTypes.map(t => (
            <Button key={t} title={`${CARD_LABELS[t] ?? t} (en jeu)`} onPress={() => handleRespondCatBalouEquip(t)} disabled={actionLoading} />
          ))}
        </View>
      )}

      {game.pending_type === 'general_store' && (
        <View style={styles.pendingBox}>
          {isMyStoreTurn ? (
            <>
              <Text style={styles.pendingTitle}>Magasin — choisissez une carte : {timerLabel}</Text>
              {storeCards.map(c => (
                <Button key={c.id} title={CARD_LABELS[c.card_type] ?? c.card_type} onPress={() => handlePickStoreCard(c.id)} disabled={actionLoading} />
              ))}
            </>
          ) : (
            <Text style={styles.pendingTitle}>{describePendingSituation()} {timerLabel}</Text>
          )}
        </View>
      )}

      {waitingOnOthers && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>{amDead ? 'Vous êtes éliminé' : 'En attente de votre tour'} {timerLabel}</Text>
          <Text style={styles.subtitle}>{describePendingSituation()}</Text>
        </View>
      )}

      {!hasPending && !isMyTurn && (
        <Text style={styles.subtitle}>
          {amDead ? 'Vous êtes éliminé' : 'En attente de votre tour'} — c'est au siège {players.find(p => p.id === game.current_player_id)?.seat_position} de jouer
        </Text>
      )}

      <Text style={styles.sectionTitle}>Votre main</Text>
      {!discarding && (
        <View>
          {hand.length === 0 && <Text style={styles.hint}>Main vide</Text>}
          {hand.map(item => (
            <View key={item.id} style={styles.cardRow}>
              <Text style={styles.cardLabel}>{CARD_LABELS[item.card_type] ?? item.card_type}</Text>
              {item.card_type === 'bang' && canPlayBang && <Button title="Jouer" onPress={() => setTargetPickerFor(item.id)} disabled={actionLoading} />}
              {item.card_type === 'beer' && canPlayBeer && <Button title="Jouer" onPress={handlePlayBeer} disabled={actionLoading} />}
              {item.card_type === 'duel' && canPlayDuel && <Button title="Jouer" onPress={() => setDuelTargetPickerFor(item.id)} disabled={actionLoading} />}
              {item.card_type === 'indians' && canPlayIndians && <Button title="Jouer" onPress={handlePlayIndians} disabled={actionLoading} />}
              {item.card_type === 'prison' && canPlayPrison && <Button title="Jouer" onPress={() => setPrisonTargetPickerFor(item.id)} disabled={actionLoading} />}
              {item.card_type === 'dynamite' && canPlayDynamite && <Button title="Jouer" onPress={handlePlayDynamite} disabled={actionLoading} />}
              {item.card_type === 'barrel' && canPlayBarrel && <Button title="Jouer" onPress={handlePlayBarrel} disabled={actionLoading} />}
              {item.card_type === 'saloon' && canPlaySaloon && <Button title="Jouer" onPress={handlePlaySaloon} disabled={actionLoading} />}
              {item.card_type === 'stagecoach' && canPlayStagecoach && <Button title="Jouer" onPress={handlePlayStagecoach} disabled={actionLoading} />}
              {item.card_type === 'wells_fargo' && canPlayWellsFargo && <Button title="Jouer" onPress={handlePlayWellsFargo} disabled={actionLoading} />}
              {item.card_type === 'mustang' && canPlayMustang && <Button title="Jouer" onPress={handlePlayMustang} disabled={actionLoading} />}
              {item.card_type === 'scope' && canPlayScope && <Button title="Jouer" onPress={handlePlayScope} disabled={actionLoading} />}
              {WEAPON_TYPES.includes(item.card_type) && canPlayWeapon && <Button title="Équiper" onPress={() => handlePlayWeapon(item.card_type)} disabled={actionLoading} />}
              {item.card_type === 'panic' && canPlayPanic && <Button title="Jouer" onPress={() => handleOpenPanicPicker(item.id)} disabled={actionLoading} />}
              {item.card_type === 'cat_balou' && canPlayCatBalou && <Button title="Jouer" onPress={() => handleOpenCatBalouPicker(item.id)} disabled={actionLoading} />}
              {item.card_type === 'gatling' && canPlayGatling && <Button title="Jouer" onPress={handlePlayGatling} disabled={actionLoading} />}
              {item.card_type === 'general_store' && canPlayGeneralStore && <Button title="Jouer" onPress={handlePlayGeneralStore} disabled={actionLoading} />}
            </View>
          ))}
        </View>
      )}

      {discarding && (
        <>
          <Text style={styles.subtitle}>Choisis {excess} carte(s) à défausser :</Text>
          <View>
            {hand.map(item => (
              <Pressable key={item.id} style={styles.cardRow} onPress={() => toggleDiscardSelection(item.id)}>
                <Text style={styles.cardLabel}>
                  {selectedDiscards.includes(item.id) ? '☑' : '☐'} {CARD_LABELS[item.card_type] ?? item.card_type}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button title="Confirmer la défausse" onPress={handleConfirmEndTurn} disabled={actionLoading} />
          <View style={styles.spacer} />
          <Button title="Annuler" color="#999" onPress={() => { setDiscarding(false); setSelectedDiscards([]); }} disabled={actionLoading} />
        </>
      )}

      {needsDegainer && <Button title="Dégainer" onPress={handleDegainer} disabled={actionLoading} />}
      {canDraw && <Button title="Piocher" onPress={handleDraw} disabled={actionLoading} />}

      {canAct && (
        <Button title={excess > 0 ? `Terminer le tour (défausser ${excess})` : 'Terminer le tour'} onPress={() => (excess > 0 ? setDiscarding(true) : handleConfirmEndTurn())} disabled={actionLoading} />
      )}

      <Text style={styles.sectionTitle}>Joueurs</Text>
      <View>
        {players.map(item => {
          const tags = equipment.filter(e => e.player_id === item.id).map(e => EQUIPMENT_TAGS[e.card_type]).join(' ');
          const role = item.is_sheriff ? 'sheriff' : rolesMap[item.id];
          const roleLabel = !item.is_alive && role ? ` — ${ROLE_LABELS[role] ?? role}` : '';
          const characterLabel = CHARACTER_LABELS[charactersMap[item.id]] ?? '';
          const isOther = item.id !== playerId && item.is_alive && !amDead;
          const distTo = isOther ? computeDistance(players, playerId, item.id, equipmentFlags) : null;
          const distFrom = isOther ? computeDistance(players, item.id, playerId, equipmentFlags) : null;
          const distanceLabel = isOther ? ` · vous→lui: ${distTo} · lui→vous: ${distFrom}` : '';
          return (
            <Text key={item.id} style={styles.playerRow}>
              Siège {item.seat_position} ({characterLabel}){item.is_sheriff ? ' 🎖️' : ''} — {item.is_alive ? `${item.life_points} PV` : 'éliminé' + roleLabel}{item.id === playerId ? ' (vous)' : ''} {tags}{distanceLabel}
            </Text>
          );
        })}
      </View>

      <Modal visible={!!targetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Choisir une cible (portée {myWeaponRange}) :</Text>
            {bangTargets.map(t => <Button key={t.id} title={`Siège ${t.seat_position}`} onPress={() => handlePlayBang(t.id)} />)}
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

      <Modal visible={!!panicTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Choisir une cible pour Braquage! (portée 1) :</Text>
            {panicTargets.map(t => (
              <Button key={t.id} title={`Siège ${t.seat_position}`} onPress={() => { setPanicTargetPickerFor(null); setStealFlow({ targetId: t.id }); }} />
            ))}
            <View style={styles.spacer} />
            <Button title="Annuler" color="#999" onPress={() => setPanicTargetPickerFor(null)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!catbalouTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Choisir une cible pour Coup de foudre :</Text>
            {catBalouTargets.map(t => (
              <Button key={t.id} title={`Siège ${t.seat_position}`} onPress={() => handlePlayCatBalou(t.id)} />
            ))}
            <View style={styles.spacer} />
            <Button title="Annuler" color="#999" onPress={() => setCatbalouTargetPickerFor(null)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!stealFlow} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.subtitle}>Voler quelle carte ?</Text>
            <Button title="Carte au hasard en main" onPress={() => handleSteal('hand')} disabled={actionLoading} />
            {equipment.filter(e => e.player_id === stealFlow?.targetId).map(e => (
              <Button key={e.card_type} title={`${CARD_LABELS[e.card_type] ?? e.card_type} (en jeu)`} onPress={() => handleSteal('in_play', e.card_type)} disabled={actionLoading} />
            ))}
            <View style={styles.spacer} />
            <Button title="Annuler" color="#999" onPress={() => setStealFlow(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  container: { padding: 24, paddingTop: 60, paddingBottom: 48, gap: 8 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
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