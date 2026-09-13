import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, fonts, characterLabels, renderPips } from '../theme';
import { callFunction } from '../lib/functions';

type PlayerRow = { id: string; seat_position: number; is_sheriff: boolean; life_points: number; max_life_points: number; nickname: string | null };

const STEP_DURATIONS = [4000, 4500, 4000, 4000, 4000, 2500];

export default function GameStartScreen({ gameId, playerId, onReady }: { gameId: string; playerId: string; onReady: () => void }) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [charactersMap, setCharactersMap] = useState<Record<string, string>>({});
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  function displayName(p: PlayerRow): string {
    const charLabel = characterLabels[charactersMap[p.id]] ?? '...';
    return p.nickname ? `${charLabel} (${p.nickname})` : charLabel;
  }

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('players').select('id, seat_position, is_sheriff, life_points, max_life_points, nickname').eq('game_id', gameId).order('seat_position');
      const ids = (p ?? []).map(pl => pl.id);
      const { data: chars } = ids.length ? await supabase.from('player_characters').select('player_id, character').in('player_id', ids) : { data: [] };
      const { data: hc } = ids.length ? await supabase.from('hand_counts').select('player_id, count').in('player_id', ids) : { data: [] };

      const charMap: Record<string, string> = {};
      (chars ?? []).forEach(c => { charMap[c.player_id] = c.character; });
      const hcMap: Record<string, number> = {};
      (hc ?? []).forEach(r => { hcMap[r.player_id] = r.count; });

      if (p) setPlayers(p);
      setCharactersMap(charMap);
      setHandCounts(hcMap);
      setLoaded(true);
    })();
  }, [gameId]);

  useEffect(() => {
    if (!loaded) return;
    if (step >= STEP_DURATIONS.length) {
      callFunction('finish-preparation', { gameId }).catch(() => {}).finally(onReady);
      return;
    }
    timerRef.current = setTimeout(() => setStep(s => s + 1), STEP_DURATIONS[step]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, loaded]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [step]);

  if (!loaded) {
    return <View style={styles.container}><Text style={styles.bodyText}>Préparation de la partie...</Text></View>;
  }

  const sheriff = players.find(p => p.is_sheriff);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Préparation de la partie</Text>

      <ScrollView ref={scrollRef} style={styles.scrollBox} contentContainerStyle={styles.scrollContent}>
        {step >= 0 && sheriff && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Répartition des rôles</Text>
            <Text style={styles.highlight}>★ Le Shérif est {displayName(sheriff)}</Text>
            <Text style={styles.bodyText}>Les autres rôles (Adjoint, Hors-la-loi, Renégat) resteront secrets jusqu'à leur révélation en jeu.</Text>
          </View>
        )}

        {step >= 1 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Découverte des personnages</Text>
            {players.map(p => (
              <Text key={p.id} style={styles.listLine}>{displayName(p)}</Text>
            ))}
          </View>
        )}

        {step >= 2 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Distribution des cartes</Text>
            {players.map(p => (
              <Text key={p.id} style={styles.listLine}>{displayName(p)} : {handCounts[p.id] ?? 0} carte(s)</Text>
            ))}
          </View>
        )}

        {step >= 3 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Distribution des points de vie</Text>
            {players.map(p => {
              const baseLife = p.is_sheriff ? p.max_life_points - 1 : p.max_life_points;
              const showBonus = p.is_sheriff && step >= 4;
              return (
                <Text key={p.id} style={styles.listLine}>
                  {displayName(p)} :{' '}
                  <Text>{renderPips(baseLife, baseLife)}</Text>
                  {showBonus && <Text style={styles.bonusPip}>●</Text>}
                </Text>
              );
            })}
          </View>
        )}

        {step >= 4 && sheriff && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Prime du Shérif</Text>
            <Text style={styles.highlight}>{displayName(sheriff)} reçoit 1 point de vie supplémentaire !</Text>
          </View>
        )}

        {step >= 5 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>En selle, la partie commence !</Text>
          </View>
        )}
      </ScrollView>

      <Text style={styles.stepCounter}>Étape {Math.min(step + 1, STEP_DURATIONS.length)} / {STEP_DURATIONS.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 60, paddingBottom: 30, backgroundColor: colors.parchment },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.leatherDark, marginBottom: 16, textAlign: 'center' },
  scrollBox: { flex: 1, width: '100%' },
  scrollContent: { gap: 20, paddingBottom: 20 },
  block: { alignItems: 'center', gap: 4 },
  stepTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.leatherDark, marginBottom: 6, textAlign: 'center' },
  highlight: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blood, textAlign: 'center', marginBottom: 4 },
  bodyText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, textAlign: 'center' },
  listLine: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, marginVertical: 2, textAlign: 'center' },
  pipsLarge: { fontFamily: fonts.body, fontSize: 22, color: colors.brass, letterSpacing: 3, marginTop: 4 },
  bonusPip: { color: colors.brass, fontFamily: fonts.bodyBold },
  stepCounter: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, marginTop: 8 },
});