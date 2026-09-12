import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { OfflineEngine } from '../offline/engine';
import { colors, fonts, renderPips } from '../theme';

const STEP_DURATIONS = [4000, 4000, 4000, 2500];

export default function OfflineGameStartScreen({ engine, onReady }: { engine: OfflineEngine; onReady: () => void }) {
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const state = engine.getState();
  const sheriff = state.players.find(p => p.isSheriff)!;

  useEffect(() => {
    if (step >= STEP_DURATIONS.length) { onReady(); return; }
    timerRef.current = setTimeout(() => setStep(s => s + 1), STEP_DURATIONS[step]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [step]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Préparation de la partie</Text>

      <ScrollView ref={scrollRef} style={styles.scrollBox} contentContainerStyle={styles.scrollContent}>
        {step >= 0 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Répartition des rôles</Text>
            <Text style={styles.highlight}>★ Le Shérif est {sheriff.nickname}</Text>
            <Text style={styles.bodyText}>Les autres rôles (Adjoint, Hors-la-loi, Renégat) resteront secrets jusqu'à leur révélation en jeu.</Text>
          </View>
        )}

        {step >= 1 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Distribution des cartes</Text>
            {state.players.map(p => (
              <Text key={p.id} style={styles.listLine}>{p.nickname} : {state.hands[p.id]?.length ?? 0} carte(s)</Text>
            ))}
          </View>
        )}

        {step >= 2 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Distribution des points de vie</Text>
            {state.players.map(p => {
              const baseLife = p.isSheriff ? p.maxLifePoints - 1 : p.maxLifePoints;
              return <Text key={p.id} style={styles.listLine}>{p.nickname} : {renderPips(baseLife, baseLife)}</Text>;
            })}
          </View>
        )}

        {step >= 3 && (
          <View style={styles.block}>
            <Text style={styles.stepTitle}>Prime du Shérif</Text>
            <Text style={styles.highlight}>{sheriff.nickname} reçoit 1 point de vie supplémentaire !</Text>
            <Text style={styles.pipsLarge}>{renderPips(sheriff.maxLifePoints, sheriff.maxLifePoints)}</Text>
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
  stepTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.leatherDark, marginTop: 10, marginBottom: 6, textAlign: 'center' },
  highlight: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blood, textAlign: 'center', marginBottom: 4 },
  bodyText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, textAlign: 'center' },
  listLine: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, marginVertical: 2, textAlign: 'center' },
  pipsLarge: { fontFamily: fonts.body, fontSize: 22, color: colors.brass, letterSpacing: 3, marginTop: 4 },
  stepCounter: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, marginTop: 8 },
});