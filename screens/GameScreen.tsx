import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { computeDistance, SeatedPlayer } from '../lib/distance';
import { getWeaponRange, WEAPON_TYPES } from '../lib/weapons';
import {
  colors, fonts, cardLabels, equipmentTags, roleLabels, roleObjectives, winnerTeamLabels,
  characterLabels, characterDescriptions, renderPips,
} from '../theme';
import WoodButton from '../components/WoodButton';
import PlayingCard from '../components/PlayingCard';

type Game = {
  id: string; status: string; current_player_id: string | null; turn_phase: string | null;
  pending_type: string | null; pending_initiator_id: string | null; pending_expires_at: string | null;
  pending_event_id: string | null; turn_activity_at: string | null; winner_team: string | null;
};
type Player = SeatedPlayer & { is_sheriff: boolean; life_points: number; max_life_points: number; has_played_bang_this_turn: boolean; nickname: string | null };
type HandCard = { id: string; card_type: string; suit: string; value: number };
type Equipment = { player_id: string; card_type: string };
type StoreCard = { id: string; card_type: string; suit: string; value: number };
type DiscardCard = { id: string; card_type: string; suit: string; value: number };
type GameEvent = {
  id: string; event_type: string; actor_seat: number | null; target_seat: number | null;
  amount: number | null; card_type: string | null; thread_id: string | null; created_at: string;
};

function isRootEvent(e: GameEvent) { return e.thread_id === e.id; }

function NoticeBox({ title, timer, children }: { title: string; timer?: string; children: React.ReactNode }) {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeHeader}>
        <Text style={styles.noticeTitle}>{title}</Text>
        {!!timer && <Text style={styles.noticeTimer}>{timer}</Text>}
      </View>
      {children}
    </View>
  );
}

const FLAVOR_BY_TEAM: Record<string, string> = {
  sheriff: 'La loi triomphe, l\u2019ordre règne à nouveau sur la ville.',
  outlaws: 'Les hors-la-loi ont eu la peau du Shérif.',
  renegade: 'Le Renégat s\u2019en tire seul, la trahison a payé.',
};

export default function GameScreen({ gameId, playerId, onLeave }: { gameId: string; playerId: string; onLeave: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [hand, setHand] = useState<HandCard[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, string>>({});
  const [charactersMap, setCharactersMap] = useState<Record<string, string>>({});
  const [myPendingRow, setMyPendingRow] = useState<{ is_current_turn: boolean; barrel_tries_used: number; cancels_needed: number; cancels_achieved: number } | null>(null);
  const [allPendingTargets, setAllPendingTargets] = useState<{ player_id: string; is_current_turn: boolean }[]>([]);
  const [storeCards, setStoreCards] = useState<StoreCard[]>([]);
  const [discardTop, setDiscardTop] = useState<DiscardCard[]>([]);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [targetPickerFor, setTargetPickerFor] = useState<string | null>(null);
  const [bangSourceType, setBangSourceType] = useState<'bang' | 'missed'>('bang');
  const [duelTargetPickerFor, setDuelTargetPickerFor] = useState<string | null>(null);
  const [prisonTargetPickerFor, setPrisonTargetPickerFor] = useState<string | null>(null);
  const [panicTargetPickerFor, setPanicTargetPickerFor] = useState<string | null>(null);
  const [catbalouTargetPickerFor, setCatbalouTargetPickerFor] = useState<string | null>(null);
  const [stealFlow, setStealFlow] = useState<{ targetId: string } | null>(null);
  const [jesseTargetPicker, setJesseTargetPicker] = useState(false);
  const [kitCarlsonCards, setKitCarlsonCards] = useState<{ type: string; suit: string; value: number }[] | null>(null);
  const [kitCarlsonKeep, setKitCarlsonKeep] = useState<number[]>([]);
  const [discarding, setDiscarding] = useState(false);
  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [sidKetchumMode, setSidKetchumMode] = useState(false);
  const [selectedSidCards, setSelectedSidCards] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [forceLeaving, setForceLeaving] = useState(false);
  const firedTimeoutRef = useRef(false);
  const firedTurnTimeoutRef = useRef(false);
  const actionLoadingRef = useRef(false);
  const historyScrollRef = useRef<ScrollView>(null);

  const me = players.find(p => p.id === playerId);
  const isMyTurn = game?.current_player_id === playerId;
  const hasPending = !!game?.pending_type;

  function displayName(p: Player | undefined): string {
    if (!p) return 'Un joueur';
    const charLabel = characterLabels[charactersMap[p.id]] ?? 'Un joueur';
    return p.nickname ? `${charLabel} (${p.nickname})` : charLabel;
  }

  function nameFor(id: string | null | undefined): string {
    return displayName(players.find(pl => pl.id === id));
  }

  function nameForSeat(seat: number | null): string {
    if (seat === null || seat === undefined) return 'Un joueur';
    return displayName(players.find(pl => pl.seat_position === seat));
  }

  function Bold({ children }: { children: React.ReactNode }) {
    return <Text style={styles.eventBold}>{children}</Text>;
  }

  function renderEventLine(e: GameEvent): React.ReactNode {
    const actor = <Bold>{nameForSeat(e.actor_seat)}</Bold>;
    const target = <Bold>{nameForSeat(e.target_seat)}</Bold>;
    const card = (type?: string | null) => <Bold>{cardLabels[type ?? ''] ?? type}</Bold>;

    switch (e.event_type) {
      case 'bang_played': return <>{actor} tire sur {target}</>;
      case 'missed_played': return <>{actor} esquive avec {card('missed')}</>;
      case 'barrel_equipped': return <>{actor} pose une {card('barrel')}</>;
      case 'barrel_used': return <>{actor} esquive avec la {card('barrel')} !</>;
      case 'barrel_failed': return <>{actor} rate son dégainer de {card('barrel')}</>;
      case 'damage_taken': return <>{actor} perd {e.amount ?? 1} point(s) de vie</>;
      case 'player_eliminated': return <>{actor} est éliminé !</>;
      case 'store_card_taken': return <>{actor} récupère {card(e.card_type)} au Magasin</>;
      case 'card_discarded_forced': return <>{actor} défausse {card(e.card_type)} (Coup de foudre)</>;
      case 'beer_played': return <>{actor} boit une {card('beer')}</>;
      case 'saloon_played': return <>{actor} joue {card('saloon')}, tout le monde est soigné</>;
      case 'duel_played': return <>{actor} lance un {card('duel')} contre {target}</>;
      case 'duel_bang_discarded': return <>{actor} continue le Duel avec un {card('bang')}</>;
      case 'indians_played': return <>{actor} joue {card('indians')}</>;
      case 'indians_defended': return <>{actor} se défend avec un {card('bang')}</>;
      case 'gatling_played': return <>{actor} joue {card('gatling')} !</>;
      case 'prison_played': return <>{actor} met {target} en {card('prison')}</>;
      case 'prison_failed': return <>{actor} rate son dégainer de {card('prison')}, tour passé</>;
      case 'prison_escaped': return <>{actor} s'échappe de {card('prison')}</>;
      case 'dynamite_played': return <>{actor} pose une {card('dynamite')}</>;
      case 'dynamite_passed': return <>La {card('dynamite')} passe à {actor}</>;
      case 'weapon_equipped': return <>{actor} s'équipe : {card(e.card_type)}</>;
      case 'mustang_equipped': return <>{actor} pose un {card('mustang')}</>;
      case 'scope_equipped': return <>{actor} pose une {card('scope')}</>;
      case 'panic_played': return <>{actor} vole {card(e.card_type)} à {target}</>;
      case 'catbalou_played': return <>{actor} joue {card('cat_balou')} sur {target}</>;
      case 'general_store_played': return <>{actor} joue {card('general_store')}</>;
      case 'jesse_jones_steal': return <>{actor} pioche dans la main de {target}</>;
      case 'pedro_ramirez_discard_draw': return <>{actor} pioche depuis la défausse</>;
      case 'kit_carlson_pick': return <>{actor} choisit 2 cartes parmi 3</>;
      case 'bart_cassidy_draw': return <>{actor} pioche une carte</>;
      case 'suzy_lafayette_draw': return <>{actor} pioche une carte, main vide</>;
      case 'black_jack_bonus_draw': return <>{actor} pioche une carte de plus</>;
      case 'partial_cancel': return <>{actor} annule partiellement ({e.amount}/2)</>;
      case 'el_gringo_steal': return <>{actor} vole {e.amount} carte(s) à {target}</>;
      case 'vulture_sam_loot': return <>{actor} récupère les cartes de {target}</>;
      case 'sid_ketchum_heal': return <>{actor} défausse 2 cartes, +1 PV</>;
      case 'beer_saved_from_death': return <>{actor} survit grâce à une {card('beer')} !</>;
      case 'degainer_draw': return <>{actor} dégaine</>;
      default: return <>{actor} — {e.event_type}</>;
    }
  }

  function describePendingSituation(): string {
    if (!game?.pending_type) return '';
    const actor = nameFor(game.pending_initiator_id);
    const targetIds = allPendingTargets.map(pt => pt.player_id);
    switch (game.pending_type) {
      case 'bang_response': return `${actor} tire sur ${nameFor(targetIds[0])} — en attente de sa réponse...`;
      case 'gatling_response': return `${actor} a joué Gatling — en attente de ${targetIds.length} réponse(s)`;
      case 'duel_response': {
        const otherId = targetIds.find(id => id !== game.pending_initiator_id);
        const current = allPendingTargets.find(pt => pt.is_current_turn);
        return `Duel entre ${actor} et ${nameFor(otherId)} — en attente de ${nameFor(current?.player_id)}`;
      }
      case 'indians_response': return `${actor} a joué Indiens! — en attente de ${targetIds.length} réponse(s)`;
      case 'cat_balou_discard': return `${actor} a joué Coup de foudre sur ${nameFor(targetIds[0])} — en attente de son choix`;
      case 'general_store': {
        const current = allPendingTargets.find(pt => pt.is_current_turn);
        return `Magasin en cours — au tour de ${nameFor(current?.player_id)} de choisir`;
      }
      default: return 'Une action est en cours...';
    }
  }

  async function loadEvents(): Promise<GameEvent[]> {
    const { data: recent } = await supabase
      .from('game_events').select('*').eq('game_id', gameId)
      .order('created_at', { ascending: false }).limit(20);
    const recentEvents = (recent ?? []) as GameEvent[];

    const knownIds = new Set(recentEvents.map(e => e.id));
    const missingRootIds = Array.from(new Set(
      recentEvents.map(e => e.thread_id).filter((id): id is string => !!id && !knownIds.has(id))
    ));

    let roots: GameEvent[] = [];
    if (missingRootIds.length) {
      const { data } = await supabase.from('game_events').select('*').in('id', missingRootIds);
      roots = (data ?? []) as GameEvent[];
    }

    const byThread = new Map<string, GameEvent[]>();
    for (const e of [...recentEvents, ...roots]) {
      const key = e.thread_id ?? e.id;
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key)!.push(e);
    }

    const groups = Array.from(byThread.values()).map(evs => {
      evs.sort((a, b) => {
        if (isRootEvent(a) && !isRootEvent(b)) return -1;
        if (!isRootEvent(a) && isRootEvent(b)) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      const lastTime = evs.reduce((max, e) => Math.max(max, new Date(e.created_at).getTime()), 0);
      return { evs, lastTime };
    });

    // Chaque groupe est positionné selon son événement le PLUS RÉCENT, pas sa racine —
    // un fil qui reçoit une nouvelle ligne remonte donc en bas de la liste.
    groups.sort((a, b) => a.lastTime - b.lastTime);

    return groups.flatMap(g => g.evs);
  }

  async function loadAll() {
    const { data: g } = await supabase.from('games').select('*').eq('id', gameId).single();
    const { data: p } = await supabase.from('players').select('*').eq('game_id', gameId).order('seat_position');
    const { data: h } = await supabase.from('hand_cards').select('id, card_type, suit, value').eq('player_id', playerId);
    const { data: pending } = await supabase.from('pending_targets').select('is_current_turn, barrel_tries_used, cancels_needed, cancels_achieved').eq('game_id', gameId).eq('player_id', playerId).maybeSingle();
    const { data: allPt } = await supabase.from('pending_targets').select('player_id, is_current_turn').eq('game_id', gameId);
    const { data: eq } = p?.length ? await supabase.from('cards_in_play').select('player_id, card_type').in('player_id', p.map(pl => pl.id)) : { data: [] };
    const { data: sc } = await supabase.from('general_store_cards').select('id, card_type, suit, value').eq('game_id', gameId);
    const { data: dt } = await supabase.from('discard_pile').select('id, card_type, suit, value').eq('game_id', gameId).order('discarded_at', { ascending: false }).limit(3);
    const { data: hc } = p?.length ? await supabase.from('hand_counts').select('player_id, count').in('player_id', p.map(pl => pl.id)) : { data: [] };
    const groupedEvents = await loadEvents();

    const eliminatedIds = (p ?? []).filter(pl => !pl.is_alive).map(pl => pl.id);
    const idsForRoles = Array.from(new Set([...eliminatedIds, playerId]));
    const { data: roles } = await supabase.from('player_roles').select('player_id, role').in('player_id', idsForRoles);
    const map: Record<string, string> = {};
    (roles ?? []).forEach(r => { map[r.player_id] = r.role; });

    const { data: chars } = p?.length ? await supabase.from('player_characters').select('player_id, character').in('player_id', p.map(pl => pl.id)) : { data: [] };
    const charMap: Record<string, string> = {};
    (chars ?? []).forEach(c => { charMap[c.player_id] = c.character; });

    const hcMap: Record<string, number> = {};
    (hc ?? []).forEach(r => { hcMap[r.player_id] = r.count; });

    if (g) setGame(g);
    if (p) setPlayers(p);
    if (h) setHand(h);
    setMyPendingRow(pending ?? null);
    setAllPendingTargets(allPt ?? []);
    setEquipment(eq ?? []);
    setStoreCards(sc ?? []);
    setDiscardTop(dt ?? []);
    setHandCounts(hcMap);
    setEvents(groupedEvents);
    setRolesMap(map);
    setCharactersMap(charMap);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discard_pile', filter: `game_id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${gameId}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameId, playerId]);

  useEffect(() => {
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [gameId, playerId]);

  useEffect(() => {
    historyScrollRef.current?.scrollToEnd({ animated: true });
  }, [events]);

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

  useEffect(() => {
    firedTurnTimeoutRef.current = false;
    if (hasPending || !game?.turn_activity_at || game.status !== 'in_progress') { setTurnSecondsLeft(null); return; }
    const deadline = new Date(game.turn_activity_at).getTime() + 60_000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnSecondsLeft(remaining);
      if (remaining <= 0 && !firedTurnTimeoutRef.current) {
        firedTurnTimeoutRef.current = true;
        supabase.functions.invoke('check-turn-timeout', { body: { gameId } }).catch(() => {});
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [game?.turn_activity_at, hasPending, game?.status, gameId]);  

  useEffect(() => {
    if (!(isMyTurn && game?.turn_phase === 'play')) {
      setDiscarding(false);
      setSelectedDiscards([]);
    }
  }, [isMyTurn, game?.turn_phase]);

  async function runAction(action: () => Promise<void>) {
    if (actionLoadingRef.current) return;
    actionLoadingRef.current = true;
    setActionLoading(true);
    try {
      await action();
      await loadAll();
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }

  const handleDegainer = () => runAction(() => callFunction('resolve-start-of-turn', { gameId }));
  const handleDraw = () => runAction(() => callFunction('draw-cards', { gameId }));
  const handleDrawJesseSteal = (targetPlayerId: string) => {
    setJesseTargetPicker(false);
    return runAction(() => callFunction('draw-jesse-steal', { gameId, targetPlayerId }));
  };
  const handleDrawPedroDiscard = () => runAction(() => callFunction('draw-pedro-discard', { gameId }));

  async function handlePeekKitCarlson() {
    if (actionLoadingRef.current) return;
    actionLoadingRef.current = true;
    setActionLoading(true);
    try {
      const result = await callFunction('peek-kit-carlson', { gameId });
      setKitCarlsonCards(result.cards);
      setKitCarlsonKeep([]);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }
  function toggleKitCarlsonKeep(index: number) {
    setKitCarlsonKeep(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length >= 2) return prev;
      return [...prev, index];
    });
  }
  function handleConfirmKitCarlson() {
    if (kitCarlsonKeep.length !== 2) { Alert.alert('Choix incomplet', 'Sélectionnez exactement 2 cartes à garder.'); return; }
    return runAction(async () => {
      await callFunction('kit-carlson-choose', { gameId, keepIndices: kitCarlsonKeep });
      setKitCarlsonCards(null);
      setKitCarlsonKeep([]);
    });
  }

  const handlePlayBeer = () => runAction(() => callFunction('play-beer', { gameId }));
  const handlePlayBang = (targetPlayerId: string) => {
    setTargetPickerFor(null);
    const chosenType = bangSourceType;
    return runAction(() => callFunction('play-bang', { gameId, targetPlayerId, cardType: chosenType }));
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
  const handleRespond = (action: 'missed' | 'accept_damage' | 'drink_beer', cardType?: string) => runAction(() => callFunction('respond-bang', { gameId, action, cardType }));
  const handleRespondGatling = (action: 'missed' | 'accept_damage' | 'drink_beer', cardType?: string) => runAction(() => callFunction('respond-gatling', { gameId, action, cardType }));
  const handleRespondDuel = (action: 'discard_bang' | 'accept_damage' | 'drink_beer', cardType?: string) => runAction(() => callFunction('respond-duel', { gameId, action, cardType }));
  const handleRespondIndians = (action: 'discard_bang' | 'accept_damage' | 'drink_beer', cardType?: string) => runAction(() => callFunction('respond-indians', { gameId, action, cardType }));
  const handlePickStoreCard = (cardId: string) => runAction(() => callFunction('pick-general-store-card', { gameId, cardId }));
  const handleRespondCatBalouHand = (handCardId: string) => runAction(() => callFunction('respond-catbalou', { gameId, handCardId }));
  const handleRespondCatBalouEquip = (inPlayCardType: string) => runAction(() => callFunction('respond-catbalou', { gameId, inPlayCardType }));
  const handlePlayCatBalou = (targetPlayerId: string) => {
    setCatbalouTargetPickerFor(null);
    return runAction(() => callFunction('play-catbalou', { gameId, targetPlayerId }));
  };
  const handleTryBarrel = () => runAction(() => callFunction('respond-bang', { gameId, action: 'try_barrel' }));
  const handleTryBarrelGatling = () => runAction(() => callFunction('respond-gatling', { gameId, action: 'try_barrel' }));

  async function handleSteal(source: 'hand' | 'in_play', cardType?: string) {
    if (!stealFlow || actionLoadingRef.current) return;
    const { targetId } = stealFlow;
    setStealFlow(null);
    actionLoadingRef.current = true;
    setActionLoading(true);
    try {
      const result = await callFunction('play-panic', { gameId, targetPlayerId: targetId, source, cardType });
      await loadAll();
      Alert.alert('Braquage!', `Vous avez récupéré : ${cardLabels[result?.stolenCardType] ?? result?.stolenCardType ?? 'une carte'}`);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }

  function toggleDiscardSelection(cardId: string) {
    setSelectedDiscards(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]);
  }
  function handleOpenPanicPicker(cardId: string) {
    if (panicRangeTargets.length === 0) { Alert.alert('Braquage!', 'Aucun joueur n’est à portée pour utiliser Braquage!'); return; }
    if (panicTargets.length === 0) { Alert.alert('Braquage!', 'Aucun joueur à portée n’a de carte à voler.'); return; }
    setPanicTargetPickerFor(cardId);
  }
  function handleOpenCatBalouPicker(cardId: string) {
    if (catBalouTargets.length === 0) { Alert.alert('Coup de foudre', 'Aucun joueur n’a de carte à faire défausser.'); return; }
    setCatbalouTargetPickerFor(cardId);
  }
  function handleConfirmEndTurn() {
    const excess = hand.length - (me?.life_points ?? 0);
    if (excess > 0 && selectedDiscards.length !== excess) { Alert.alert('Défausse incomplète', `Sélectionne exactement ${excess} carte(s).`); return; }
    return runAction(async () => {
      await callFunction('discard-cards', { gameId, cardIds: selectedDiscards });
      setDiscarding(false);
      setSelectedDiscards([]);
    });
  }

  function toggleSidSelection(cardId: string) {
    setSelectedSidCards(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 2) return prev;
      return [...prev, cardId];
    });
  }
  function handleConfirmSidHeal() {
    if (selectedSidCards.length !== 2) { Alert.alert('Choix incomplet', 'Sélectionnez exactement 2 cartes.'); return; }
    return runAction(async () => {
      await callFunction('play-sid-ketchum-heal', { gameId, cardIds: selectedSidCards });
      setSidKetchumMode(false);
      setSelectedSidCards([]);
    });
  }
  function handleAbandon() {
    Alert.alert(
      'Abandonner la partie',
      'Tu seras éliminé immédiatement, comme si tu étais mort au combat. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Abandonner', style: 'destructive', onPress: () => {
            setAbandoning(true);
            runAction(() => callFunction('abandon-game', { gameId })).finally(() => setAbandoning(false));
          },
        },
      ]
    );
  }

  function handleForceLeave() {
    Alert.alert(
      'Quitter la partie',
      'Tu reviens à l\u2019accueil. Si tu es encore en vie, on tentera de t\u2019éliminer proprement au passage — utile si la partie est bloquée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter', style: 'destructive', onPress: async () => {
            setForceLeaving(true);
            try {
              if (!amDead) await callFunction('abandon-game', { gameId });
            } catch {
              // Best-effort : on quitte quand même, même si cet appel échoue.
            } finally {
              setForceLeaving(false);
              onLeave();
            }
          },
        },
      ]
    );
  }

  if (!game || !me) {
    return <View style={styles.centerContainer}><Text style={styles.bodyText}>Chargement...</Text></View>;
  }

  if (game.status === 'finished') {
    const myRoleFinal = me.is_sheriff ? 'sheriff' : rolesMap[playerId];
    const iWon =
      (game.winner_team === 'sheriff' && (myRoleFinal === 'sheriff' || myRoleFinal === 'deputy')) ||
      (game.winner_team === 'outlaws' && myRoleFinal === 'outlaw') ||
      (game.winner_team === 'renegade' && myRoleFinal === 'renegade');
    const teamLabel = winnerTeamLabels[game.winner_team ?? ''] ?? game.winner_team;
    return (
      <View style={styles.centerContainer}>
        <Text style={[styles.title, { color: iWon ? colors.sage : colors.blood }]}>{iWon ? 'Victoire !' : 'Défaite'}</Text>
        <Text style={styles.bodyText}>Camp vainqueur : {teamLabel}</Text>
        <Text style={styles.hint}>{FLAVOR_BY_TEAM[game.winner_team ?? ''] ?? ''}</Text>
        <Text style={styles.bodyText}>Vous étiez {roleLabels[myRoleFinal] ?? '...'} {iWon ? '— bravo !' : '— la prochaine fois peut-être.'}</Text>
        <View style={{ height: 16 }} />
        <WoodButton title="Retour à l'accueil" onPress={onLeave} variant="primary" />
      </View>
    );
  }

  const amDead = !me.is_alive;
  const myRole = me.is_sheriff ? 'sheriff' : rolesMap[playerId];
  const myCharacter = charactersMap[playerId];
  const isCalamityJanet = myCharacter === 'calamity_janet';
  const isJourdonnais = myCharacter === 'jourdonnais';
  const isWillyTheKid = myCharacter === 'willy_the_kid';
  const myEquipmentTypes = equipment.filter(e => e.player_id === playerId).map(e => e.card_type);
  const excess = hand.length - me.life_points;
  const aliveCount = players.filter(p => p.is_alive).length;
  const hasMissed = hand.some(c => c.card_type === 'missed');
  const hasBang = hand.some(c => c.card_type === 'bang');
  const hasBeer = hand.some(c => c.card_type === 'beer');
  const hasBarrelInPlay = myEquipmentTypes.includes('barrel');
  const maxBarrelTries = (isJourdonnais ? 1 : 0) + (hasBarrelInPlay ? 1 : 0);
  const canTryBarrel = maxBarrelTries > 0 && (myPendingRow?.barrel_tries_used ?? 0) < maxBarrelTries;
  const canDrinkBeerToSurvive = hasBeer && me.life_points <= 1 && aliveCount > 2;

  const mustangIds = new Set(equipment.filter(e => e.card_type === 'mustang').map(e => e.player_id));
  const scopeIds = new Set(equipment.filter(e => e.card_type === 'scope').map(e => e.player_id));
  players.forEach(p => {
    if (charactersMap[p.id] === 'paul_regret') mustangIds.add(p.id);
    if (charactersMap[p.id] === 'rose_doolan') scopeIds.add(p.id);
  });
  const equipmentFlags = { mustangIds, scopeIds };
  const myWeaponRange = getWeaponRange(myEquipmentTypes);
  const myWeaponType = myEquipmentTypes.find(t => WEAPON_TYPES.includes(t));
  const myWeaponName = myWeaponType ? (cardLabels[myWeaponType] ?? myWeaponType) : 'Colt .45';
  const hasVolcanic = myEquipmentTypes.includes('volcanic');

  const bangTargets = players.filter(p => p.is_alive && p.id !== playerId && computeDistance(players, playerId, p.id, equipmentFlags) <= myWeaponRange);
  const duelTargets = players.filter(p => p.is_alive && p.id !== playerId);
  const prisonTargets = players.filter(p => p.is_alive && p.id !== playerId && !p.is_sheriff && !equipment.some(e => e.player_id === p.id && e.card_type === 'prison'));
  const hasAnyCards = (id: string) => (handCounts[id] ?? 0) > 0 || equipment.some(e => e.player_id === id);
  const panicRangeTargets = players.filter(p => p.is_alive && p.id !== playerId && computeDistance(players, playerId, p.id, equipmentFlags) <= 1);
  const panicTargets = panicRangeTargets.filter(t => hasAnyCards(t.id));
  const catBalouTargets = duelTargets.filter(t => hasAnyCards(t.id));
  const jesseTargets = players.filter(p => p.is_alive && p.id !== playerId && (handCounts[p.id] ?? 0) > 0);

  const needsDegainer = isMyTurn && !hasPending && game.turn_phase === 'draw' && myEquipmentTypes.some(t => t === 'dynamite' || t === 'prison');
  const canDraw = isMyTurn && !hasPending && game.turn_phase === 'draw' && !needsDegainer;
  const canAct = isMyTurn && !hasPending && game.turn_phase === 'play' && !discarding && !sidKetchumMode;
  const canPlayBang = canAct && bangTargets.length > 0 && (hasVolcanic || isWillyTheKid || !me.has_played_bang_this_turn);
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
  
  const timerLabel = secondsLeft !== null ? `⏱ ${secondsLeft}s` : undefined;
  const equipmentTagsLegend = Object.entries(equipmentTags).map(([type, icon]) => `${icon} ${cardLabels[type] ?? type}`);

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <View style={styles.plaque}>
        <View style={styles.plaqueRoleRow}>
          {me.is_sheriff && <Text style={styles.starIcon}>★</Text>}
          <Text style={styles.plaqueRole}>{roleLabels[myRole] ?? '...'}</Text>
          <Text style={styles.plaquePips}>{renderPips(me.life_points, me.max_life_points)}</Text>
        </View>
        <Text style={styles.plaqueObjective}>{roleObjectives[myRole] ?? ''}</Text>
        <Text style={styles.plaqueSub}>{displayName(me)} · {myWeaponName} (portée {myWeaponRange})</Text>
        <Text style={styles.plaqueDescription}>{characterDescriptions[myCharacter] ?? ''}</Text>
      </View>

      <Text style={styles.sectionTitle}>Actions récentes</Text>
      <View style={styles.historyBox}>
        <ScrollView ref={historyScrollRef} nestedScrollEnabled>
          {events.length === 0 ? (
            <Text style={styles.noticeBody}>Aucun événement pour l'instant.</Text>
          ) : (
            events.map(e => {
              const isChild = !isRootEvent(e);
              const isActiveThread = !!game.pending_event_id && e.thread_id === game.pending_event_id;
              return (
                <Text
                  key={e.id}
                  style={[styles.noticeBody, isChild && styles.noticeBodyChild, isActiveThread && styles.noticeBodyActive]}
                >
                  {isChild ? '↳ ' : '• '}{renderEventLine(e)}
                </Text>
              );
            })
          )}
        </ScrollView>
      </View>

      <View style={styles.noticeHeader}>
        <Text style={styles.sectionTitle}>Confrontation</Text>
        {hasPending && !!timerLabel && <Text style={styles.noticeTimer}>{timerLabel}</Text>}
      </View>
      <View style={styles.notice}>
        <ScrollView style={styles.confrontationScroll} nestedScrollEnabled>
          {!hasPending && <Text style={styles.noticeBody}>Aucune confrontation en cours.</Text>}
          {mustRespondToBang && (
            <>
              <Text style={styles.noticeBody}>Vous êtes visé par un Bang! Répondez :</Text>
              {myPendingRow!.cancels_needed > 1 && (
                <Text style={styles.noticeMeta}>Annulations : {myPendingRow!.cancels_achieved}/{myPendingRow!.cancels_needed} (Slab le Flingueur)</Text>
              )}
              {hasMissed && <WoodButton title="Jouer Raté!" onPress={() => handleRespond('missed')} disabled={actionLoading} style={styles.noticeBtn} />}
              {isCalamityJanet && hasBang && <WoodButton title="Jouer Bang! comme Raté!" onPress={() => handleRespond('missed', 'bang')} disabled={actionLoading} style={styles.noticeBtn} />}
              {canTryBarrel && <WoodButton title="Essayer la Planque" onPress={handleTryBarrel} disabled={actionLoading} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => handleRespond('drink_beer')} disabled={actionLoading} variant="safe" style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => handleRespond('accept_damage')} disabled={actionLoading} variant="primary" style={styles.noticeBtn} />
            </>
          )}
          {mustRespondToGatling && (
            <>
              <Text style={styles.noticeBody}>Gatling ! Répondez :</Text>
              {hasMissed && <WoodButton title="Jouer Raté!" onPress={() => handleRespondGatling('missed')} disabled={actionLoading} style={styles.noticeBtn} />}
              {isCalamityJanet && hasBang && <WoodButton title="Jouer Bang! comme Raté!" onPress={() => handleRespondGatling('missed', 'bang')} disabled={actionLoading} style={styles.noticeBtn} />}
              {canTryBarrel && <WoodButton title="Essayer la Planque" onPress={handleTryBarrelGatling} disabled={actionLoading} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => handleRespondGatling('drink_beer')} disabled={actionLoading} variant="safe" style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => handleRespondGatling('accept_damage')} disabled={actionLoading} variant="primary" style={styles.noticeBtn} />
            </>
          )}
          {mustRespondToDuel && (
            <>
              <Text style={styles.noticeBody}>Duel ! Continuez ou encaissez :</Text>
              {hasBang && <WoodButton title="Jouer Bang!" onPress={() => handleRespondDuel('discard_bang')} disabled={actionLoading} style={styles.noticeBtn} />}
              {isCalamityJanet && hasMissed && <WoodButton title="Jouer Raté! comme Bang!" onPress={() => handleRespondDuel('discard_bang', 'missed')} disabled={actionLoading} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => handleRespondDuel('drink_beer')} disabled={actionLoading} variant="safe" style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => handleRespondDuel('accept_damage')} disabled={actionLoading} variant="primary" style={styles.noticeBtn} />
            </>
          )}
          {mustRespondToIndians && (
            <>
              <Text style={styles.noticeBody}>Indiens! Défendez-vous ou encaissez :</Text>
              {hasBang && <WoodButton title="Jouer Bang!" onPress={() => handleRespondIndians('discard_bang')} disabled={actionLoading} style={styles.noticeBtn} />}
              {isCalamityJanet && hasMissed && <WoodButton title="Jouer Raté! comme Bang!" onPress={() => handleRespondIndians('discard_bang', 'missed')} disabled={actionLoading} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => handleRespondIndians('drink_beer')} disabled={actionLoading} variant="safe" style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => handleRespondIndians('accept_damage')} disabled={actionLoading} variant="primary" style={styles.noticeBtn} />
            </>
          )}
          {mustChooseCatBalouDiscard && (
            <>
              <Text style={styles.noticeBody}>Coup de foudre ! Choisissez une carte à défausser :</Text>
              {hand.map(c => (
                <WoodButton key={c.id} title={`${cardLabels[c.card_type] ?? c.card_type} (main)`} onPress={() => handleRespondCatBalouHand(c.id)} disabled={actionLoading} style={styles.noticeBtn} />
              ))}
              {myEquipmentTypes.map(t => (
                <WoodButton key={t} title={`${cardLabels[t] ?? t} (en jeu)`} onPress={() => handleRespondCatBalouEquip(t)} disabled={actionLoading} style={styles.noticeBtn} />
              ))}
            </>
          )}
          {isMyStoreTurn && (
            <>
              <Text style={styles.noticeBody}>Magasin — choisissez une carte :</Text>
              {storeCards.map(c => (
                <WoodButton key={c.id} title={cardLabels[c.card_type] ?? c.card_type} onPress={() => handlePickStoreCard(c.id)} disabled={actionLoading} style={styles.noticeBtn} />
              ))}
            </>
          )}
          {waitingOnOthers && <Text style={styles.noticeBody}>{describePendingSituation()}</Text>}
        </ScrollView>
      </View>

      {!hasPending && turnSecondsLeft !== null && turnSecondsLeft <= 20 && (
        <Text style={styles.turnWarning}>⏱ {turnSecondsLeft}s avant un passage automatique</Text>
      )}

      {!hasPending && (
        <Text style={styles.waitingText}>
          {amDead
            ? 'Vous êtes éliminé'
            : isMyTurn
              ? ''
              : `En attente de votre tour — c'est au tour de ${nameFor(game.current_player_id)}`}
        </Text>
      )}

      <Text style={styles.sectionTitle}>Votre main</Text>
      {!discarding && !sidKetchumMode && (
        <View style={styles.handRow}>
          {hand.length === 0 && <Text style={styles.hint}>Main vide</Text>}
          {hand.map(item => {
            let playable = false;
            let onPress: (() => void) | undefined;
            if (item.card_type === 'bang' && canPlayBang) { playable = true; onPress = () => { setBangSourceType('bang'); setTargetPickerFor(item.id); }; }
            else if (item.card_type === 'missed' && isCalamityJanet && canPlayBang) { playable = true; onPress = () => { setBangSourceType('missed'); setTargetPickerFor(item.id); }; }
            else if (item.card_type === 'beer' && canPlayBeer) { playable = true; onPress = handlePlayBeer; }
            else if (item.card_type === 'duel' && canPlayDuel) { playable = true; onPress = () => setDuelTargetPickerFor(item.id); }
            else if (item.card_type === 'indians' && canPlayIndians) { playable = true; onPress = handlePlayIndians; }
            else if (item.card_type === 'prison' && canPlayPrison) { playable = true; onPress = () => setPrisonTargetPickerFor(item.id); }
            else if (item.card_type === 'dynamite' && canPlayDynamite) { playable = true; onPress = handlePlayDynamite; }
            else if (item.card_type === 'barrel' && canPlayBarrel) { playable = true; onPress = handlePlayBarrel; }
            else if (item.card_type === 'saloon' && canPlaySaloon) { playable = true; onPress = handlePlaySaloon; }
            else if (item.card_type === 'stagecoach' && canPlayStagecoach) { playable = true; onPress = handlePlayStagecoach; }
            else if (item.card_type === 'wells_fargo' && canPlayWellsFargo) { playable = true; onPress = handlePlayWellsFargo; }
            else if (item.card_type === 'mustang' && canPlayMustang) { playable = true; onPress = handlePlayMustang; }
            else if (item.card_type === 'scope' && canPlayScope) { playable = true; onPress = handlePlayScope; }
            else if (WEAPON_TYPES.includes(item.card_type) && canPlayWeapon) { playable = true; onPress = () => handlePlayWeapon(item.card_type); }
            else if (item.card_type === 'panic' && canPlayPanic) { playable = true; onPress = () => handleOpenPanicPicker(item.id); }
            else if (item.card_type === 'cat_balou' && canPlayCatBalou) { playable = true; onPress = () => handleOpenCatBalouPicker(item.id); }
            else if (item.card_type === 'gatling' && canPlayGatling) { playable = true; onPress = handlePlayGatling; }
            else if (item.card_type === 'general_store' && canPlayGeneralStore) { playable = true; onPress = handlePlayGeneralStore; }
            return (
              <PlayingCard
                key={item.id}
                cardType={item.card_type}
                suit={item.suit}
                value={item.value}
                playable={playable}
                onPress={playable ? onPress : undefined}
              />
            );
          })}
        </View>
      )}

      {discarding && (
        <>
          <Text style={styles.bodyText}>Choisis {excess} carte(s) à défausser :</Text>
          <View style={styles.handRow}>
            {hand.map(item => (
              <PlayingCard
                key={item.id}
                cardType={item.card_type}
                suit={item.suit}
                value={item.value}
                selected={selectedDiscards.includes(item.id)}
                onPress={() => toggleDiscardSelection(item.id)}
              />
            ))}
          </View>
          <WoodButton title="Confirmer la défausse" onPress={handleConfirmEndTurn} disabled={actionLoading} variant="primary" style={styles.fullWidthBtn} />
          <WoodButton title="Annuler" onPress={() => { setDiscarding(false); setSelectedDiscards([]); }} disabled={actionLoading} variant="muted" style={styles.fullWidthBtn} />
        </>
      )}

      {sidKetchumMode && (
        <>
          <Text style={styles.bodyText}>Choisis 2 cartes à défausser pour regagner 1 PV :</Text>
          <View style={styles.handRow}>
            {hand.map(item => (
              <PlayingCard
                key={item.id}
                cardType={item.card_type}
                suit={item.suit}
                value={item.value}
                selected={selectedSidCards.includes(item.id)}
                onPress={() => toggleSidSelection(item.id)}
              />
            ))}
          </View>
          <WoodButton title="Confirmer" onPress={handleConfirmSidHeal} disabled={actionLoading} variant="safe" style={styles.fullWidthBtn} />
          <WoodButton title="Annuler" onPress={() => { setSidKetchumMode(false); setSelectedSidCards([]); }} disabled={actionLoading} variant="muted" style={styles.fullWidthBtn} />
        </>
      )}

      {needsDegainer && <WoodButton title="Dégainer" onPress={handleDegainer} disabled={actionLoading} style={styles.fullWidthBtn} />}

      {canDraw && myCharacter === 'jesse_jones' && (
        <>
          <WoodButton title="Piocher normalement" onPress={handleDraw} disabled={actionLoading} style={styles.fullWidthBtn} />
          <WoodButton title="Piocher dans la main d'un adversaire" onPress={() => setJesseTargetPicker(true)} disabled={actionLoading || jesseTargets.length === 0} style={styles.fullWidthBtn} />
        </>
      )}
      {canDraw && myCharacter === 'pedro_ramirez' && (
        <>
          <WoodButton title="Piocher normalement" onPress={handleDraw} disabled={actionLoading} style={styles.fullWidthBtn} />
          <WoodButton title="Piocher depuis la défausse" onPress={handleDrawPedroDiscard} disabled={actionLoading || discardTop.length === 0} style={styles.fullWidthBtn} />
        </>
      )}
      {canDraw && myCharacter === 'kit_carlson' && !kitCarlsonCards && (
        <WoodButton title="Regarder le dessus de la pioche" onPress={handlePeekKitCarlson} disabled={actionLoading} style={styles.fullWidthBtn} />
      )}
      {canDraw && !['jesse_jones', 'pedro_ramirez', 'kit_carlson'].includes(myCharacter) && (
        <WoodButton title="Piocher" onPress={handleDraw} disabled={actionLoading} style={styles.fullWidthBtn} />
      )}

      {kitCarlsonCards && (
        <NoticeBox title="Kit Carlson">
          <Text style={styles.noticeBody}>Choisissez 2 cartes à garder :</Text>
          <View style={styles.handRow}>
            {kitCarlsonCards.map((c, i) => (
              <PlayingCard key={i} cardType={c.type} suit={c.suit} value={c.value} selected={kitCarlsonKeep.includes(i)} onPress={() => toggleKitCarlsonKeep(i)} />
            ))}
          </View>
          <WoodButton title="Confirmer" onPress={handleConfirmKitCarlson} disabled={actionLoading} variant="safe" style={styles.noticeBtn} />
        </NoticeBox>
      )}

      {myCharacter === 'sid_ketchum' && !amDead && me.life_points < me.max_life_points && hand.length >= 2 && !sidKetchumMode && !discarding && (
        <WoodButton title="Défausser 2 cartes pour +1 PV (Sid Ketchum)" onPress={() => setSidKetchumMode(true)} disabled={actionLoading} variant="safe" style={styles.fullWidthBtn} />
      )}

      {canAct && (
        <WoodButton
          title={excess > 0 ? `Terminer le tour (défausser ${excess})` : 'Terminer le tour'}
          onPress={() => (excess > 0 ? setDiscarding(true) : handleConfirmEndTurn())}
          disabled={actionLoading}
          variant="primary"
          style={styles.fullWidthBtn}
        />
      )}

      <Text style={styles.sectionTitle}>Joueurs</Text>
      <Text style={styles.hint}>★ = Shérif</Text>
      {players.map(item => {
        const tags = equipment.filter(e => e.player_id === item.id).map(e => equipmentTags[e.card_type]).join(' ');
        const role = item.is_sheriff ? 'sheriff' : rolesMap[item.id];
        const isOther = item.id !== playerId && item.is_alive && !amDead;
        const distTo = isOther ? computeDistance(players, playerId, item.id, equipmentFlags) : null;
        const distFrom = isOther ? computeDistance(players, item.id, playerId, equipmentFlags) : null;
        const isCurrentTurn = item.id === game.current_player_id && item.is_alive;
        
        return (
          <View key={item.id} style={[styles.playerRow, isCurrentTurn && styles.playerRowActive]}>
            <View style={styles.seatBadge}>
              <Text style={styles.seatBadgeText}>{item.is_alive ? `${item.life_points}\u2764` : '\u2620'}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={[styles.playerName, item.id === playerId && styles.playerNameSelf, !item.is_alive && styles.playerNameDead]}>
                {displayName(item)}{item.is_sheriff ? ' ★' : ''}
              </Text>
              {item.is_alive ? (
                <Text style={styles.playerMeta}>
                  {renderPips(item.life_points, item.max_life_points)}
                  {isOther ? `  ·  moi→lui : ${distTo}  ·  lui→moi : ${distFrom}` : ''}
                </Text>
              ) : (
                <Text style={styles.playerMeta}>éliminé — {roleLabels[role] ?? role}</Text>
              )}
              {!!tags && <Text style={styles.playerEquipment}>{tags}</Text>}
            </View>
          </View>
        );
      })}

      {equipmentTagsLegend.length > 0 && (
        <Text style={styles.equipmentLegend}>{equipmentTagsLegend.join('  ·  ')}</Text>
      )}

      <Text style={styles.sectionTitle}>Haut de la défausse</Text>
      <View style={styles.discardRow}>
        {discardTop.length === 0 && <Text style={styles.hint}>Vide</Text>}
        {discardTop.map((c, i) => (
          <View key={c.id} style={styles.discardItem}>
            {i === 0 && <Text style={styles.discardLatestLabel}>Dernière</Text>}
            <PlayingCard cardType={c.card_type} suit={c.suit} value={c.value} size="small" />
          </View>
        ))}
      </View>

      <Modal visible={!!targetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible (portée {myWeaponRange})</Text>
            {bangTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => handlePlayBang(t.id)} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!duelTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour le Duel</Text>
            {duelTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => handlePlayDuel(t.id)} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setDuelTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!prisonTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour Prison</Text>
            {prisonTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => handlePlayPrison(t.id)} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setPrisonTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!panicTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour Braquage! (portée 1)</Text>
            {panicTargets.map(t => (
              <WoodButton key={t.id} title={displayName(t)} onPress={() => { setPanicTargetPickerFor(null); setStealFlow({ targetId: t.id }); }} style={styles.noticeBtn} />
            ))}
            <WoodButton title="Annuler" onPress={() => setPanicTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!catbalouTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour Coup de foudre</Text>
            {catBalouTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => handlePlayCatBalou(t.id)} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setCatbalouTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!stealFlow} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Voler quelle carte ?</Text>
            <WoodButton title="Carte au hasard en main" onPress={() => handleSteal('hand')} disabled={actionLoading} style={styles.noticeBtn} />
            {equipment.filter(e => e.player_id === stealFlow?.targetId).map(e => (
              <WoodButton key={e.card_type} title={`${cardLabels[e.card_type] ?? e.card_type} (en jeu)`} onPress={() => handleSteal('in_play', e.card_type)} disabled={actionLoading} style={styles.noticeBtn} />
            ))}
            <WoodButton title="Annuler" onPress={() => setStealFlow(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={jesseTargetPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Piocher dans la main de qui ?</Text>
            {jesseTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => handleDrawJesseSteal(t.id)} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setJesseTargetPicker(false)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>
      {!amDead && (
        <WoodButton title="Abandonner la partie" onPress={handleAbandon} disabled={abandoning} variant="muted" style={{ marginTop: 24 }} />
      )}
      <WoodButton title="Quitter la partie (retour à l'accueil)" onPress={handleForceLeave} disabled={forceLeaving} variant="muted" style={{ marginTop: 10 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1, backgroundColor: colors.parchment },
  container: { padding: 20, paddingTop: 56, paddingBottom: 48, gap: 6 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8, backgroundColor: colors.parchment },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.blood },
  bodyText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, fontStyle: 'italic', marginBottom: 4 },
  plaque: { backgroundColor: colors.leather, borderWidth: 2, borderColor: colors.ink, borderRadius: 10, padding: 14, gap: 2 },
  plaqueRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  starIcon: { color: colors.brass, fontSize: 16 },
  plaqueRole: { fontFamily: fonts.display, fontSize: 17, color: colors.parchmentLight },
  plaquePips: { fontFamily: fonts.body, fontSize: 15, color: colors.brass, letterSpacing: 2 },
  plaqueObjective: { fontFamily: fonts.body, fontSize: 11, color: colors.parchmentLight, opacity: 0.85, fontStyle: 'italic' },
  plaqueSub: { fontFamily: fonts.body, fontSize: 12, color: colors.parchmentLight, opacity: 0.95, marginTop: 6 },
  plaqueDescription: { fontFamily: fonts.body, fontSize: 11, color: colors.parchmentLight, opacity: 0.85 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.leatherDark, marginTop: 18, marginBottom: 4 },
  historyBox: {
    height: 180, backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink,
    borderStyle: 'dashed', borderRadius: 6, padding: 10,
  },
  confrontationScroll: { height: 320, marginTop: 2 },
  notice: {
    backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink, borderStyle: 'dashed',
    borderRadius: 6, padding: 12, marginTop: 10, gap: 3,
  },
  noticeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noticeTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.blood },
  noticeTimer: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.leatherDark },
  noticeBody: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18 },
  noticeBodyChild: { marginLeft: 18, color: colors.leatherDark },
  noticeBodyActive: { color: colors.brass },
  noticeMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, fontStyle: 'italic' },
  noticeBtn: { marginTop: 4 },
  eventBold: { fontFamily: fonts.bodyBold },
  waitingText: { fontFamily: fonts.body, fontSize: 13, color: colors.leatherDark, marginTop: 4, fontStyle: 'italic' },
  turnWarning: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blood, marginTop: 4 },
  handRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 6 },
  fullWidthBtn: { marginTop: 10 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(43,27,18,0.15)', borderRadius: 6,
  },
  playerRowActive: { backgroundColor: 'rgba(198,149,43,0.22)' },
  seatBadge: { minWidth: 34, height: 28, borderRadius: 14, backgroundColor: colors.leather, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  seatBadgeText: { fontFamily: fonts.bodyBold, color: colors.parchmentLight, fontSize: 12 },
  playerInfo: { flex: 1 },
  playerNameSelf: { color: colors.brass },
  playerName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  playerNameDead: { textDecorationLine: 'line-through', color: colors.leatherDark },
  playerMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, marginTop: 1 },
  discardRow: { flexDirection: 'row', gap: 16, paddingVertical: 6, paddingLeft: 4 },
  discardItem: { alignItems: 'center', gap: 3 },
  discardLatestLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.brass },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,27,18,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink, borderRadius: 12, padding: 20, width: '82%', gap: 8 },
  modalTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.leatherDark, marginBottom: 6 },
  playerEquipment: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  equipmentLegend: { fontFamily: fonts.body, fontSize: 11, color: colors.leatherDark, marginTop: 8, fontStyle: 'italic' },
});