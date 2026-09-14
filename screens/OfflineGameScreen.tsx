import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { OfflineEngine } from '../offline/engine';
import { aiPlayFullTurn, aiRespondSingleAttack, aiRespondDuel, aiRespondIndians, aiRespondCatBalou, aiRespondGeneralStore } from '../offline/ai';
import { OfflineGameState } from '../offline/types';
import { WEAPON_TYPES, getWeaponRange } from '../lib/weapons';
import { colors, fonts, cardLabels, equipmentTags, roleLabels, roleObjectives, winnerTeamLabels, characterLabels, characterDescriptions, renderPips, suitLabels } from '../theme';
import WoodButton from '../components/WoodButton';
import PlayingCard from '../components/PlayingCard';
import AbilityAnimationOverlay, { AbilityAnimationType } from '../components/AbilityAnimationOverlay';
import { useAbilityAnimationQueue } from '../hooks/useAbilityAnimationQueue';

type Player = OfflineGameState['players'][number];

type OfflineEventItem = OfflineGameState['events'][number];

function isRootEvent(e: OfflineEventItem) { return e.threadId === e.id; }

function groupEventsForDisplay(events: OfflineEventItem[], maxGroups = 10): OfflineEventItem[] {
  const byThread = new Map<string, OfflineEventItem[]>();
  for (const e of events) {
    const key = e.threadId ?? e.id;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key)!.push(e);
  }
  const groups = Array.from(byThread.values()).map(evs => {
    const sorted = [...evs].sort((a, b) => {
      if (isRootEvent(a) && !isRootEvent(b)) return -1;
      if (!isRootEvent(a) && isRootEvent(b)) return 1;
      return a.createdAt - b.createdAt;
    });
    const lastTime = sorted.reduce((max, e) => Math.max(max, e.createdAt), 0);
    return { sorted, lastTime };
  });
  groups.sort((a, b) => a.lastTime - b.lastTime);
  return groups.slice(-maxGroups).flatMap(g => g.sorted);
}

function NoticeBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function OfflineGameScreen({ engine, onLeave }: { engine: OfflineEngine; onLeave: () => void }) {
  const engineRef = useRef<OfflineEngine>(engine);
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationActiveRef = useRef(false);
  const [state, setState] = useState<OfflineGameState>(engineRef.current.getState());
  const [targetPickerFor, setTargetPickerFor] = useState<string | null>(null);
  const [bangSourceType, setBangSourceType] = useState<'bang' | 'missed'>('bang');
  const [duelTargetPickerFor, setDuelTargetPickerFor] = useState<string | null>(null);
  const [prisonTargetPickerFor, setPrisonTargetPickerFor] = useState<string | null>(null);
  const [panicTargetPickerFor, setPanicTargetPickerFor] = useState<string | null>(null);
  const [catbalouTargetPickerFor, setCatbalouTargetPickerFor] = useState<string | null>(null);
  const [jesseTargetPicker, setJesseTargetPicker] = useState(false);
  const [stealFlow, setStealFlow] = useState<{ targetId: string } | null>(null);
  const [kitCarlsonCards, setKitCarlsonCards] = useState<{ type: string; suit: string; value: number }[] | null>(null);
  const [kitCarlsonKeep, setKitCarlsonKeep] = useState<number[]>([]);
  const [discarding, setDiscarding] = useState(false);
  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [sidKetchumMode, setSidKetchumMode] = useState(false);
  const [selectedSidCards, setSelectedSidCards] = useState<string[]>([]);
  const abilityQueue = useAbilityAnimationQueue();
  const seenAbilityEventIds = useRef<Set<string> | null>(null);

  const humanId = engineRef.current.getHumanId();
  const me = state.players.find(p => p.id === humanId)!;

  function displayName(p: Player): string {
    return `${characterLabels[p.character] ?? '...'} (${p.nickname})`;
  }
  function nameFor(id: string | null | undefined): string {
    const p = state.players.find(pl => pl.id === id);
    return p ? displayName(p) : 'Un joueur';
  }
  function nameForSeat(seat: number | null): string {
    const p = state.players.find(pl => pl.seatPosition === seat);
    return p ? displayName(p) : 'Un joueur';
  }

  function refresh() {
    setState(engineRef.current.getState());
  }

  function runAction(action: () => void) {
    try { action(); refresh(); } catch (err: any) { Alert.alert('Erreur', err.message); }
  }

  useEffect(() => {
    let cancelled = false;

  function runOneStep() {
    if (animationActiveRef.current) {
      if (!cancelled) botTimeoutRef.current = setTimeout(runOneStep, 400);
      return;
    }
    try {
      const s = engineRef.current.getState();
        if (s.status === 'finished') { refresh(); return; }

        if (s.pending) {
          const pending = s.pending;
          if (pending.type === 'general_store') {
            const current = pending.targets.find(t => t.isCurrentTurn);
            const bot = s.players.find(p => p.id === current?.playerId && p.isBot);
            if (bot) { aiRespondGeneralStore(engineRef.current, bot.id); refresh(); }
          } else if (pending.type === 'duel_response') {
            const current = pending.targets.find(t => t.isCurrentTurn);
            const bot = s.players.find(p => p.id === current?.playerId && p.isBot);
            if (bot) { aiRespondDuel(engineRef.current, bot.id); refresh(); }
          } else if (pending.type === 'cat_balou_discard') {
            const t = pending.targets[0];
            const bot = s.players.find(p => p.id === t.playerId && p.isBot);
            if (bot) { aiRespondCatBalou(engineRef.current, bot.id); refresh(); }
          } else if (pending.type === 'indians_response') {
            const botTarget = pending.targets.map(t => s.players.find(p => p.id === t.playerId)).find(p => p?.isBot);
            if (botTarget) { aiRespondIndians(engineRef.current, botTarget.id); refresh(); }
          } else if (pending.type === 'bang_response' || pending.type === 'gatling_response') {
            const botTarget = pending.targets.map(t => s.players.find(p => p.id === t.playerId)).find(p => p?.isBot);
            if (botTarget) { aiRespondSingleAttack(engineRef.current, pending.type as any, botTarget.id); refresh(); }
          }
        } else {
          const current = s.players.find(p => p.id === s.currentPlayerId);
          if (current?.isBot && current.isAlive) {
            aiPlayFullTurn(engineRef.current, current.id);
            refresh();
          }
        }
      } catch (err) {
        console.log('Erreur IA (ignorée, nouvel essai au prochain tick) :', err);
      }

      if (!cancelled && engineRef.current.getState().status !== 'finished') {
        const delay = 2000 + Math.random() * 2000; // entre 2 et 4 secondes
        botTimeoutRef.current = setTimeout(runOneStep, delay);
      }
    }

    botTimeoutRef.current = setTimeout(runOneStep, 2000 + Math.random() * 2000);
    return () => { cancelled = true; if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current); };
  }, []);

  useEffect(() => {
    const events = state.events;
    const abilityTypes: AbilityAnimationType[] = ['bart_cassidy_draw', 'el_gringo_steal', 'sid_ketchum_heal', 'vulture_sam_loot'];

    // Premier passage : on mémorise ce qui existe déjà (reconnexion en cours de partie)
    // sans rejouer d'animation pour des capacités déjà anciennes.
    if (seenAbilityEventIds.current === null) {
      seenAbilityEventIds.current = new Set(events.map(e => e.id));
      return;
    }

    for (const e of events) {
      if (seenAbilityEventIds.current.has(e.id)) continue;
      seenAbilityEventIds.current.add(e.id);
      if (abilityTypes.includes(e.eventType as AbilityAnimationType)) {
        abilityQueue.enqueue(e.eventType as AbilityAnimationType, nameForSeat(e.actorSeat), e.targetSeat != null ? nameForSeat(e.targetSeat) : undefined);
      }
    }
  }, [state.events]);

  useEffect(() => {
    animationActiveRef.current = !!abilityQueue.current;
  }, [abilityQueue.current]);

  function Bold({ children }: { children: React.ReactNode }) {
    return <Text style={styles.eventBold}>{children}</Text>;
  }

  function renderEventLine(e: OfflineEventItem): React.ReactNode {
    const actor = <Bold>{nameForSeat(e.actorSeat)}</Bold>;
    const target = <Bold>{nameForSeat(e.targetSeat)}</Bold>;
    const card = (t: string | null) => <Bold>{cardLabels[t ?? ''] ?? t}</Bold>;
    switch (e.eventType) {
      case 'bang_played': return <>{actor} tire sur {target}</>;
      case 'missed_played': return <>{actor} esquive avec {card('missed')}</>;
      case 'barrel_equipped': return <>{actor} pose une {card('barrel')}</>;
      case 'barrel_used': return <>{actor} esquive avec la {card('barrel')} !</>;
      case 'barrel_failed': return <>{actor} rate son dégainer de {card('barrel')}</>;
      case 'damage_taken': return <>{actor} perd {e.amount ?? 1} point(s) de vie</>;
      case 'player_eliminated': return <>{actor} est éliminé !</>;
      case 'store_card_taken': return <>{actor} récupère {card(e.cardType)} au Magasin</>;
      case 'card_discarded_forced': return <>{actor} défausse {card(e.cardType)} (Coup de foudre)</>;
      case 'beer_played': return <>{actor} boit une {card('beer')}</>;
      case 'saloon_played': return <>{actor} joue {card('saloon')}, tout le monde est soigné</>;
      case 'stagecoach_played': return <>{actor} joue {card('stagecoach')}</>;
      case 'wellsfargo_played': return <>{actor} joue {card('wells_fargo')}</>;
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
      case 'weapon_equipped': return <>{actor} s'équipe : {card(e.cardType)}</>;
      case 'mustang_equipped': return <>{actor} pose un {card('mustang')}</>;
      case 'scope_equipped': return <>{actor} pose une {card('scope')}</>;
      case 'panic_played': return <>{actor} vole {card(e.cardType)} à {target}</>;
      case 'catbalou_played': return <>{actor} joue {card('cat_balou')} sur {target}</>;
      case 'general_store_played': return <>{actor} joue {card('general_store')}</>;
      case 'jesse_jones_steal': return <>{actor} pioche dans la main de {target}</>;
      case 'pedro_ramirez_discard_draw': return <>{actor} pioche depuis la défausse</>;
      case 'kit_carlson_pick': return <>{actor} choisit 2 cartes parmi 3</>;
      case 'bart_cassidy_draw': return <>{actor} pioche une carte</>;
      case 'suzy_lafayette_draw': return <>{actor} pioche une carte, main vide</>;
      case 'black_jack_bonus_draw': return <>{actor} pioche une carte de plus</>;
      case 'el_gringo_steal': return <>{actor} vole {e.amount} carte(s) à {target}</>;
      case 'vulture_sam_loot': return <>{actor} récupère les cartes de {target}</>;
      case 'sid_ketchum_heal': return <>{actor} défausse 2 cartes, +1 PV</>;
      case 'beer_saved_from_death': return <>{actor} survit grâce à une {card('beer')} !</>;
      case 'degainer_draw': return <>{actor} dégaine</>;
      default: return <>{actor} — {e.eventType}</>;
    }
  }

  function describePending(): string {
    if (!state.pending) return '';
    const actor = nameFor(state.pending.initiatorId);
    const ids = state.pending.targets.map(t => t.playerId);
    switch (state.pending.type) {
      case 'bang_response': return `${actor} tire sur ${nameFor(ids[0])} — en attente...`;
      case 'gatling_response': return `${actor} a joué Gatling — en attente de ${ids.length} réponse(s)`;
      case 'duel_response': {
        const other = ids.find(id => id !== state.pending!.initiatorId);
        const current = state.pending.targets.find(t => t.isCurrentTurn);
        return `Duel entre ${actor} et ${nameFor(other)} — en attente de ${nameFor(current?.playerId)}`;
      }
      case 'indians_response': return `${actor} a joué Indiens! — en attente de ${ids.length} réponse(s)`;
      case 'cat_balou_discard': return `${actor} a joué Coup de foudre sur ${nameFor(ids[0])}`;
      case 'general_store': {
        const current = state.pending.targets.find(t => t.isCurrentTurn);
        return `Magasin en cours — au tour de ${nameFor(current?.playerId)}`;
      }
      default: return 'Une action est en cours...';
    }
  }

  if (state.status === 'finished') {
    const iWon =
      (state.winnerTeam === 'sheriff' && (me.role === 'sheriff' || me.role === 'deputy')) ||
      (state.winnerTeam === 'outlaws' && me.role === 'outlaw') ||
      (state.winnerTeam === 'renegade' && me.role === 'renegade');
    return (
      <View style={styles.centerContainer}>
        <Text style={[styles.title, { color: iWon ? colors.sage : colors.blood }]}>{iWon ? 'Victoire !' : 'Défaite'}</Text>
        <Text style={styles.bodyText}>Camp vainqueur : {winnerTeamLabels[state.winnerTeam ?? ''] ?? state.winnerTeam}</Text>
        <Text style={styles.bodyText}>Vous étiez {roleLabels[me.role]} ({characterLabels[me.character]}).</Text>
        <View style={{ height: 16 }} />
        <WoodButton title="Retour à l'accueil" onPress={onLeave} variant="primary" />
      </View>
    );
  }

  const amDead = !me.isAlive;
  const isCalamityJanet = me.character === 'calamity_janet';
  const isJourdonnais = me.character === 'jourdonnais';
  const isWillyTheKid = me.character === 'willy_the_kid';
  const myHand = state.hands[humanId] ?? [];
  const myEquip = state.equipment[humanId] ?? [];
  const myEquipTypes = myEquip.map(c => c.type);
  const excess = myHand.length - me.lifePoints;
  const aliveCount = state.players.filter(p => p.isAlive).length;
  const hasMissed = myHand.some(c => c.type === 'missed');
  const hasBang = myHand.some(c => c.type === 'bang');
  const hasBeer = myHand.some(c => c.type === 'beer');
  const hasBarrelInPlay = myEquipTypes.includes('barrel');
  const maxBarrelTries = (isJourdonnais ? 1 : 0) + (hasBarrelInPlay ? 1 : 0);
  const myWeaponRange = getWeaponRange(myEquipTypes);
  const myWeaponType = myEquipTypes.find(t => WEAPON_TYPES.includes(t));
  const myWeaponName = myWeaponType ? (cardLabels[myWeaponType] ?? myWeaponType) : 'Colt .45';
  const hasVolcanic = myEquipTypes.includes('volcanic');
  const canDrinkBeerToSurvive = hasBeer && me.lifePoints <= 1 && aliveCount > 2;

  const isMyTurn = state.currentPlayerId === humanId;
  const hasPending = !!state.pending;
  const myPendingTarget = state.pending?.targets.find(t => t.playerId === humanId);
  const canTryBarrel = maxBarrelTries > 0 && (myPendingTarget?.barrelTriesUsed ?? 0) < maxBarrelTries;

  const animationBlocking = !!abilityQueue.current;
  const needsDegainer = isMyTurn && !hasPending && state.turnPhase === 'draw' && myEquipTypes.some(t => t === 'dynamite' || t === 'prison') && !animationBlocking;
  const canDraw = isMyTurn && !hasPending && state.turnPhase === 'draw' && !needsDegainer && !animationBlocking;
  const canAct = isMyTurn && !hasPending && state.turnPhase === 'play' && !discarding && !sidKetchumMode && !animationBlocking;

  const bangTargets = state.players.filter(p => p.isAlive && p.id !== humanId && engineRef.current.distanceBetween(humanId, p.id) <= myWeaponRange);
  const duelTargets = state.players.filter(p => p.isAlive && p.id !== humanId);
  const prisonTargets = state.players.filter(p => p.isAlive && p.id !== humanId && !p.isSheriff && !(state.equipment[p.id] ?? []).some(c => c.type === 'prison'));
  const panicRangeTargets = state.players.filter(p => p.isAlive && p.id !== humanId && engineRef.current.distanceBetween(humanId, p.id) <= 1);
  const hasAnyCards = (id: string) => (state.hands[id]?.length ?? 0) > 0 || (state.equipment[id]?.length ?? 0) > 0;
  const panicTargets = panicRangeTargets.filter(t => hasAnyCards(t.id));
  const catBalouTargets = duelTargets.filter(t => hasAnyCards(t.id));
  const jesseTargets = state.players.filter(p => p.isAlive && p.id !== humanId && (state.hands[p.id]?.length ?? 0) > 0);
  const equipmentTagsLegend = Object.entries(equipmentTags).map(([type, icon]) => `${icon} ${cardLabels[type] ?? type}`);

  const canPlayBang = canAct && bangTargets.length > 0 && (hasVolcanic || isWillyTheKid || !me.hasPlayedBangThisTurn);
  const canPlayBeer = canAct && aliveCount > 2 && me.lifePoints < me.maxLifePoints;
  const canPlayDuel = canAct && duelTargets.length > 0;
  const canPlayPrison = canAct && prisonTargets.length > 0;
  const canPlayDynamite = canAct && !myEquipTypes.includes('dynamite');
  const canPlayBarrel = canAct && !hasBarrelInPlay;
  const canPlayMustang = canAct && !myEquipTypes.includes('mustang');
  const canPlayScope = canAct && !myEquipTypes.includes('scope');

  const mustRespondToBang = myPendingTarget && state.pending!.type === 'bang_response';
  const mustRespondToGatling = myPendingTarget && state.pending!.type === 'gatling_response';
  const mustRespondToDuel = state.pending?.type === 'duel_response' && state.pending.targets.find(t => t.playerId === humanId && t.isCurrentTurn);
  const mustRespondToIndians = myPendingTarget && state.pending!.type === 'indians_response';
  const mustChooseCatBalouDiscard = state.pending?.type === 'cat_balou_discard' && state.pending.targets.some(t => t.playerId === humanId);
  const isMyStoreTurn = state.pending?.type === 'general_store' && state.pending.targets.find(t => t.playerId === humanId)?.isCurrentTurn;
  const waitingOnOthers = hasPending && !mustRespondToBang && !mustRespondToGatling && !mustRespondToDuel && !mustRespondToIndians && !mustChooseCatBalouDiscard && !isMyStoreTurn;

  function toggleDiscardSelection(id: string) {
    setSelectedDiscards(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function handleConfirmEndTurn() {
    if (excess > 0 && selectedDiscards.length !== excess) { Alert.alert('Défausse incomplète', `Sélectionne exactement ${excess} carte(s).`); return; }
    runAction(() => engineRef.current.discardCards(humanId, selectedDiscards));
    setDiscarding(false); setSelectedDiscards([]);
  }

  function toggleSidSelection(id: string) {
    setSelectedSidCards(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }
  function handleConfirmSidHeal() {
    if (selectedSidCards.length !== 2) { Alert.alert('Choix incomplet', 'Sélectionnez exactement 2 cartes.'); return; }
    runAction(() => engineRef.current.sidKetchumHeal(humanId, selectedSidCards));
    setSidKetchumMode(false); setSelectedSidCards([]);
  }

  function handlePeekKitCarlson() {
    try {
      const cards = engineRef.current.peekKitCarlson(humanId);
      setKitCarlsonCards(cards);
      setKitCarlsonKeep([]);
    } catch (err: any) { Alert.alert('Erreur', err.message); }
  }
  function toggleKitCarlsonKeep(i: number) {
    setKitCarlsonKeep(prev => {
      if (prev.includes(i)) return prev.filter(x => x !== i);
      if (prev.length >= 2) return prev;
      return [...prev, i];
    });
  }
  function handleConfirmKitCarlson() {
    if (kitCarlsonKeep.length !== 2) { Alert.alert('Choix incomplet', 'Sélectionnez exactement 2 cartes à garder.'); return; }
    runAction(() => engineRef.current.kitCarlsonChoose(humanId, kitCarlsonKeep));
    setKitCarlsonCards(null); setKitCarlsonKeep([]);
  }

  function handleTryBarrel() {
    try {
      if (state.pending!.type === 'gatling_response') engineRef.current.respondGatling(humanId, 'try_barrel');
      else engineRef.current.respondBang(humanId, 'try_barrel');
      const after = engineRef.current.getState();
      const lastEvent = after.events[after.events.length - 1];
      if (lastEvent?.eventType === 'barrel_failed') {
        Alert.alert('Planque ratée', `Carte tirée : ${suitLabels[lastEvent.drawnSuit ?? ''] ?? lastEvent.drawnSuit}. Choisissez une autre réponse.`);
      }
      refresh();
    } catch (err: any) { Alert.alert('Erreur', err.message); }
  }

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <View style={styles.plaque}>
        <View style={styles.plaqueRoleRow}>
          {me.isSheriff && <Text style={styles.starIcon}>★</Text>}
          <Text style={styles.plaqueRole}>{roleLabels[me.role]}</Text>
          <Text style={styles.plaquePips}>{renderPips(me.lifePoints, me.maxLifePoints)}</Text>
        </View>
        <Text style={styles.plaqueObjective}>{roleObjectives[me.role]}</Text>
        <Text style={styles.plaqueSub}>{displayName(me)} · {myWeaponName} (portée {myWeaponRange})</Text>
        <Text style={styles.plaqueDescription}>{characterDescriptions[me.character] ?? ''}</Text>
      </View>

      <Text style={styles.sectionTitle}>Actions récentes</Text>
      <View style={styles.historyBox}>
        <ScrollView nestedScrollEnabled>
          {groupEventsForDisplay(state.events).map(e => {
            const isChild = !isRootEvent(e);
            const isActiveThread = !!state.pending?.eventId && e.threadId === state.pending.eventId;
            return (
              <Text key={e.id} style={[styles.noticeBody, isChild && styles.noticeBodyChild, isActiveThread && styles.noticeBodyActive]}>
                {isChild ? '↳ ' : '• '}{renderEventLine(e)}
              </Text>
            );
          })}
        </ScrollView>
      </View>

      <Text style={styles.sectionTitle}>Confrontation</Text>
      <View style={styles.notice}>
        <ScrollView style={styles.confrontationScroll} nestedScrollEnabled>
          {!hasPending && <Text style={styles.noticeBody}>Aucune confrontation en cours.</Text>}
          {mustRespondToBang && (
            <>
              <Text style={styles.noticeBody}>Vous êtes visé par un Bang! Répondez :</Text>
              {myPendingTarget!.cancelsNeeded > 1 && (
                <Text style={styles.noticeMeta}>Annulations : {myPendingTarget!.cancelsAchieved}/{myPendingTarget!.cancelsNeeded} (Slab le Flingueur)</Text>
              )}
              {hasMissed && <WoodButton title="Jouer Raté!" onPress={() => runAction(() => engineRef.current.respondBang(humanId, 'missed'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {isCalamityJanet && hasBang && <WoodButton title="Jouer Bang! comme Raté!" onPress={() => runAction(() => engineRef.current.respondBang(humanId, 'missed', 'bang'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {canTryBarrel && <WoodButton title="Essayer la Planque" onPress={handleTryBarrel} disabled={animationBlocking} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => runAction(() => engineRef.current.respondBang(humanId, 'drink_beer'))} variant="safe" disabled={animationBlocking} style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => runAction(() => engineRef.current.respondBang(humanId, 'accept_damage'))} variant="primary" disabled={animationBlocking} style={styles.noticeBtn} />
            </>
          )}
          {mustRespondToGatling && (
            <>
              <Text style={styles.noticeBody}>Gatling ! Répondez :</Text>
              {hasMissed && <WoodButton title="Jouer Raté!" onPress={() => runAction(() => engineRef.current.respondGatling(humanId, 'missed'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {isCalamityJanet && hasBang && <WoodButton title="Jouer Bang! comme Raté!" onPress={() => runAction(() => engineRef.current.respondGatling(humanId, 'missed', 'bang'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {canTryBarrel && <WoodButton title="Essayer la Planque" onPress={handleTryBarrel} disabled={animationBlocking} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => runAction(() => engineRef.current.respondGatling(humanId, 'drink_beer'))} variant="safe" disabled={animationBlocking} style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => runAction(() => engineRef.current.respondGatling(humanId, 'accept_damage'))} variant="primary" disabled={animationBlocking} style={styles.noticeBtn} />
            </>
          )}
          {mustRespondToDuel && (
            <>
              <Text style={styles.noticeBody}>Duel ! Continuez ou encaissez :</Text>
              {hasBang && <WoodButton title="Jouer Bang!" onPress={() => runAction(() => engineRef.current.respondDuel(humanId, 'discard_bang'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {isCalamityJanet && hasMissed && <WoodButton title="Jouer Raté! comme Bang!" onPress={() => runAction(() => engineRef.current.respondDuel(humanId, 'discard_bang', 'missed'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => runAction(() => engineRef.current.respondDuel(humanId, 'drink_beer'))} variant="safe" disabled={animationBlocking} style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => runAction(() => engineRef.current.respondDuel(humanId, 'accept_damage'))} variant="primary" disabled={animationBlocking} style={styles.noticeBtn} />
            </>
          )}
          {mustRespondToIndians && (
            <>
              <Text style={styles.noticeBody}>Indiens! Défendez-vous ou encaissez :</Text>
              {hasBang && <WoodButton title="Jouer Bang!" onPress={() => runAction(() => engineRef.current.respondIndians(humanId, 'discard_bang'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {isCalamityJanet && hasMissed && <WoodButton title="Jouer Raté! comme Bang!" onPress={() => runAction(() => engineRef.current.respondIndians(humanId, 'discard_bang', 'missed'))} disabled={animationBlocking} style={styles.noticeBtn} />}
              {canDrinkBeerToSurvive && <WoodButton title="Boire une Bière (survivre)" onPress={() => runAction(() => engineRef.current.respondIndians(humanId, 'drink_beer'))} variant="safe" disabled={animationBlocking} style={styles.noticeBtn} />}
              <WoodButton title="Encaisser les dégâts" onPress={() => runAction(() => engineRef.current.respondIndians(humanId, 'accept_damage'))} variant="primary" disabled={animationBlocking} style={styles.noticeBtn} />
            </>
          )}
          {mustChooseCatBalouDiscard && (
            <>
              <Text style={styles.noticeBody}>Coup de foudre ! Choisissez une carte à défausser :</Text>
              {myHand.map(c => <WoodButton key={c.id} title={`${cardLabels[c.type] ?? c.type} (main)`} onPress={() => runAction(() => engineRef.current.respondCatBalou(humanId, c.id))} disabled={animationBlocking} style={styles.noticeBtn} />)}
              {myEquipTypes.map(t => <WoodButton key={t} title={`${cardLabels[t] ?? t} (en jeu)`} onPress={() => runAction(() => engineRef.current.respondCatBalou(humanId, undefined, t))} disabled={animationBlocking} style={styles.noticeBtn} />)}
            </>
          )}
          {isMyStoreTurn && (
            <>
              <Text style={styles.noticeBody}>Magasin — choisissez une carte :</Text>
              {state.generalStoreCards.map(c => <WoodButton key={c.id} title={cardLabels[c.type] ?? c.type} onPress={() => runAction(() => engineRef.current.pickGeneralStoreCard(humanId, c.id))} disabled={animationBlocking} style={styles.noticeBtn} />)}
            </>
          )}
          {waitingOnOthers && <Text style={styles.noticeBody}>{describePending()}</Text>}
        </ScrollView>
      </View>

      {!hasPending && (
        <Text style={styles.waitingText}>
          {amDead ? 'Vous êtes éliminé' : isMyTurn ? '' : `En attente de votre tour — c'est au tour de ${nameFor(state.currentPlayerId)}`}
        </Text>
      )}

      <Text style={styles.sectionTitle}>Votre main</Text>
      {!discarding && !sidKetchumMode && (
        <View style={styles.handRow}>
          {myHand.length === 0 && <Text style={styles.hint}>Main vide</Text>}
          {myHand.map(item => {
            let playable = false;
            let onPress: (() => void) | undefined;
            if (item.type === 'bang' && canPlayBang) { playable = true; onPress = () => { setBangSourceType('bang'); setTargetPickerFor(item.id); }; }
            else if (item.type === 'missed' && isCalamityJanet && canPlayBang) { playable = true; onPress = () => { setBangSourceType('missed'); setTargetPickerFor(item.id); }; }
            else if (item.type === 'beer' && canPlayBeer) { playable = true; onPress = () => runAction(() => engineRef.current.playBeer(humanId)); }
            else if (item.type === 'duel' && canPlayDuel) { playable = true; onPress = () => setDuelTargetPickerFor(item.id); }
            else if (item.type === 'indians' && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playIndians(humanId)); }
            else if (item.type === 'prison' && canPlayPrison) { playable = true; onPress = () => setPrisonTargetPickerFor(item.id); }
            else if (item.type === 'dynamite' && canPlayDynamite) { playable = true; onPress = () => runAction(() => engineRef.current.playDynamite(humanId)); }
            else if (item.type === 'barrel' && canPlayBarrel) { playable = true; onPress = () => runAction(() => engineRef.current.playBarrel(humanId)); }
            else if (item.type === 'saloon' && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playSaloon(humanId)); }
            else if (item.type === 'stagecoach' && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playStagecoach(humanId)); }
            else if (item.type === 'wells_fargo' && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playWellsFargo(humanId)); }
            else if (item.type === 'mustang' && canPlayMustang) { playable = true; onPress = () => runAction(() => engineRef.current.playMustang(humanId)); }
            else if (item.type === 'scope' && canPlayScope) { playable = true; onPress = () => runAction(() => engineRef.current.playScope(humanId)); }
            else if (WEAPON_TYPES.includes(item.type) && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playWeapon(humanId, item.type)); }
            else if (item.type === 'panic' && canAct) { playable = true; onPress = () => setPanicTargetPickerFor(item.id); }
            else if (item.type === 'cat_balou' && canAct) { playable = true; onPress = () => setCatbalouTargetPickerFor(item.id); }
            else if (item.type === 'gatling' && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playGatling(humanId)); }
            else if (item.type === 'general_store' && canAct) { playable = true; onPress = () => runAction(() => engineRef.current.playGeneralStore(humanId)); }
            return <PlayingCard key={item.id} cardType={item.type} suit={item.suit} value={item.value} playable={playable} onPress={playable ? onPress : undefined} />;
          })}
        </View>
      )}

      {discarding && (
        <>
          <Text style={styles.bodyText}>Choisis {excess} carte(s) à défausser :</Text>
          <View style={styles.handRow}>
            {myHand.map(item => (
              <PlayingCard key={item.id} cardType={item.type} suit={item.suit} value={item.value} selected={selectedDiscards.includes(item.id)} onPress={() => toggleDiscardSelection(item.id)} />
            ))}
          </View>
          <WoodButton title="Confirmer la défausse" onPress={handleConfirmEndTurn} variant="primary" style={styles.fullWidthBtn} />
          <WoodButton title="Annuler" onPress={() => { setDiscarding(false); setSelectedDiscards([]); }} variant="muted" style={styles.fullWidthBtn} />
        </>
      )}

      {sidKetchumMode && (
        <>
          <Text style={styles.bodyText}>Choisis 2 cartes à défausser pour regagner 1 PV :</Text>
          <View style={styles.handRow}>
            {myHand.map(item => (
              <PlayingCard key={item.id} cardType={item.type} suit={item.suit} value={item.value} selected={selectedSidCards.includes(item.id)} onPress={() => toggleSidSelection(item.id)} />
            ))}
          </View>
          <WoodButton title="Confirmer" onPress={handleConfirmSidHeal} variant="safe" style={styles.fullWidthBtn} />
          <WoodButton title="Annuler" onPress={() => { setSidKetchumMode(false); setSelectedSidCards([]); }} variant="muted" style={styles.fullWidthBtn} />
        </>
      )}

      {needsDegainer && <WoodButton title="Dégainer" onPress={() => runAction(() => engineRef.current.performDrawPhaseDegainer(humanId))} style={styles.fullWidthBtn} />}

      {canDraw && me.character === 'jesse_jones' && (
        <>
          <WoodButton title="Piocher normalement" onPress={() => runAction(() => engineRef.current.drawCards(humanId))} style={styles.fullWidthBtn} />
          <WoodButton title="Piocher dans la main d'un adversaire" onPress={() => setJesseTargetPicker(true)} disabled={jesseTargets.length === 0} style={styles.fullWidthBtn} />
        </>
      )}
      {canDraw && me.character === 'pedro_ramirez' && (
        <>
          <WoodButton title="Piocher normalement" onPress={() => runAction(() => engineRef.current.drawCards(humanId))} style={styles.fullWidthBtn} />
          <WoodButton title="Piocher depuis la défausse" onPress={() => runAction(() => engineRef.current.drawPedroDiscard(humanId))} disabled={state.discardPile.length === 0} style={styles.fullWidthBtn} />
        </>
      )}
      {canDraw && me.character === 'kit_carlson' && !kitCarlsonCards && (
        <WoodButton title="Regarder le dessus de la pioche" onPress={handlePeekKitCarlson} style={styles.fullWidthBtn} />
      )}
      {canDraw && !['jesse_jones', 'pedro_ramirez', 'kit_carlson'].includes(me.character) && (
        <WoodButton title="Piocher" onPress={() => runAction(() => engineRef.current.drawCards(humanId))} style={styles.fullWidthBtn} />
      )}

      {kitCarlsonCards && (
        <NoticeBox title="Kit Carlson">
          <Text style={styles.noticeBody}>Choisissez 2 cartes à garder :</Text>
          <View style={styles.handRow}>
            {kitCarlsonCards.map((c, i) => (
              <PlayingCard key={i} cardType={c.type} suit={c.suit} value={c.value} selected={kitCarlsonKeep.includes(i)} onPress={() => toggleKitCarlsonKeep(i)} />
            ))}
          </View>
          <WoodButton title="Confirmer" onPress={handleConfirmKitCarlson} variant="safe" style={styles.noticeBtn} />
        </NoticeBox>
      )}

      {me.character === 'sid_ketchum' && !amDead && me.lifePoints < me.maxLifePoints && myHand.length >= 2 && !sidKetchumMode && !discarding && !animationBlocking && (
        <WoodButton title="Défausser 2 cartes pour +1 PV (Sid Ketchum)" onPress={() => setSidKetchumMode(true)} variant="safe" style={styles.fullWidthBtn} />
      )}

      {canAct && (
        <WoodButton
          title={excess > 0 ? `Terminer le tour (défausser ${excess})` : 'Terminer le tour'}
          onPress={() => (excess > 0 ? setDiscarding(true) : handleConfirmEndTurn())}
          variant="primary"
          style={styles.fullWidthBtn}
        />
      )}

      <Text style={styles.sectionTitle}>Joueurs</Text>
      <Text style={styles.hint}>★ = Shérif</Text>
      {state.players.map(item => {
        const tags = (state.equipment[item.id] ?? []).map(c => equipmentTags[c.type]).filter(Boolean).join(' ');
        const isOther = item.id !== humanId && item.isAlive && !amDead;
        const distTo = isOther ? engineRef.current.distanceBetween(humanId, item.id) : null;
        const distFrom = isOther ? engineRef.current.distanceBetween(item.id, humanId) : null;
        const isCurrentTurn = item.id === state.currentPlayerId && item.isAlive;
        return (
          <View key={item.id} style={[styles.playerRow, isCurrentTurn && styles.playerRowActive]}>
            <View style={styles.seatBadge}>
              <Text style={styles.seatBadgeText}>{item.isAlive ? `${item.lifePoints}\u2764` : '\u2620'}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={[styles.playerName, item.id === humanId && styles.playerNameSelf, !item.isAlive && styles.playerNameDead]}>
                {displayName(item)}{item.isSheriff ? ' ★' : ''}
              </Text>
              {item.isAlive ? (
                <Text style={styles.playerMeta}>
                  {renderPips(item.lifePoints, item.maxLifePoints)}
                  {isOther ? `  ·  moi→lui : ${distTo}  ·  lui→moi : ${distFrom}` : ''}
                </Text>
              ) : (
                <Text style={styles.playerMeta}>éliminé — {roleLabels[item.role]}</Text>
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
        {state.discardPile.length === 0 && <Text style={styles.hint}>Vide</Text>}
        {state.discardPile.slice(-3).reverse().map((c, i) => (
          <View key={c.id} style={styles.discardItem}>
            {i === 0 && <Text style={styles.discardLatestLabel}>Dernière</Text>}
            <PlayingCard cardType={c.type} suit={c.suit} value={c.value} size="small" />
          </View>
        ))}
      </View>

      <Modal visible={!!targetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible (portée {myWeaponRange})</Text>
            {bangTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => { const type = bangSourceType; setTargetPickerFor(null); runAction(() => engineRef.current.playBang(humanId, t.id, type)); }} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!duelTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour le Duel</Text>
            {duelTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => { setDuelTargetPickerFor(null); runAction(() => engineRef.current.playDuel(humanId, t.id)); }} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setDuelTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!prisonTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour Prison</Text>
            {prisonTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => { setPrisonTargetPickerFor(null); runAction(() => engineRef.current.playPrison(humanId, t.id)); }} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setPrisonTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!panicTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour Braquage! (portée 1)</Text>
            {panicTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => { setPanicTargetPickerFor(null); setStealFlow({ targetId: t.id }); }} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setPanicTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!catbalouTargetPickerFor} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Choisir une cible pour Coup de foudre</Text>
            {catBalouTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => { setCatbalouTargetPickerFor(null); runAction(() => engineRef.current.playCatBalou(humanId, t.id)); }} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setCatbalouTargetPickerFor(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={jesseTargetPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Piocher dans la main de qui ?</Text>
            {jesseTargets.map(t => <WoodButton key={t.id} title={displayName(t)} onPress={() => { setJesseTargetPicker(false); runAction(() => engineRef.current.drawJesseSteal(humanId, t.id)); }} style={styles.noticeBtn} />)}
            <WoodButton title="Annuler" onPress={() => setJesseTargetPicker(false)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!stealFlow} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Voler quelle carte ?</Text>
            <WoodButton title="Carte au hasard en main" onPress={() => { const t = stealFlow!.targetId; setStealFlow(null); runAction(() => { const stolen = engineRef.current.playPanic(humanId, t, 'hand'); Alert.alert('Braquage!', `Vous avez récupéré : ${cardLabels[stolen] ?? stolen}`); }); }} style={styles.noticeBtn} />
            {(state.equipment[stealFlow?.targetId ?? ''] ?? []).map(e => (
              <WoodButton key={e.type} title={`${cardLabels[e.type] ?? e.type} (en jeu)`} onPress={() => { const t = stealFlow!.targetId; setStealFlow(null); runAction(() => { const stolen = engineRef.current.playPanic(humanId, t, 'in_play', e.type); Alert.alert('Braquage!', `Vous avez récupéré : ${cardLabels[stolen] ?? stolen}`); }); }} style={styles.noticeBtn} />
            ))}
            <WoodButton title="Annuler" onPress={() => setStealFlow(null)} variant="muted" style={styles.noticeBtn} />
          </View>
        </View>
      </Modal>

      <WoodButton title="Quitter la partie" onPress={onLeave} variant="muted" style={{ marginTop: 24 }} />
      <AbilityAnimationOverlay request={abilityQueue.current} onDone={abilityQueue.onDone} />
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
  historyBox: { height: 180, backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink, borderStyle: 'dashed', borderRadius: 6, padding: 10 },
  notice: { backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink, borderStyle: 'dashed', borderRadius: 6, padding: 12, marginTop: 4, gap: 3 },
  noticeTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.blood },
  confrontationScroll: { height: 320, marginTop: 2 },
  noticeBody: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18 },
  noticeBodyChild: { marginLeft: 18, color: colors.leatherDark },
  noticeBodyActive: { color: colors.brass },
  eventBold: { fontFamily: fonts.bodyBold },  
  noticeMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, fontStyle: 'italic' },
  noticeBtn: { marginTop: 4 },
  waitingText: { fontFamily: fonts.body, fontSize: 13, color: colors.leatherDark, marginTop: 4, fontStyle: 'italic' },
  handRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 6 },
  fullWidthBtn: { marginTop: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(43,27,18,0.15)', borderRadius: 6 },
  playerRowActive: { backgroundColor: 'rgba(198,149,43,0.22)' },
  seatBadge: { minWidth: 34, height: 28, borderRadius: 14, backgroundColor: colors.leather, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  seatBadgeText: { fontFamily: fonts.bodyBold, color: colors.parchmentLight, fontSize: 12 },
  playerInfo: { flex: 1 },
  playerName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  playerNameSelf: { color: colors.brass },
  playerNameDead: { textDecorationLine: 'line-through', color: colors.leatherDark },
  playerMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, marginTop: 1 },
  playerEquipment: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  equipmentLegend: { fontFamily: fonts.body, fontSize: 11, color: colors.leatherDark, marginTop: 8, fontStyle: 'italic' },
  discardRow: { flexDirection: 'row', gap: 16, paddingVertical: 6, paddingLeft: 4 },
  discardItem: { alignItems: 'center', gap: 3 },
  discardLatestLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.brass },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,27,18,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink, borderRadius: 12, padding: 20, width: '82%', gap: 8 },
  modalTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.leatherDark, marginBottom: 6 },
});