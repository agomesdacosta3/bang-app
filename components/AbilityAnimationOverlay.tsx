import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

export type AbilityAnimationType = 'bart_cassidy_draw' | 'el_gringo_steal' | 'sid_ketchum_heal' | 'vulture_sam_loot';

export interface AbilityAnimationRequest {
  id: string;
  type: AbilityAnimationType;
  actorName: string;
  targetName?: string;
}

// Durées "de référence" — servent uniquement à calculer les proportions internes
// de chaque scène (à quel instant tel élément bouge). Ne jamais les modifier seules :
// voir PLAYBACK_DURATIONS_MS pour changer la vitesse réelle de lecture.
const AUTHORED_DURATIONS_MS: Record<AbilityAnimationType, number> = {
  bart_cassidy_draw: 3400,
  el_gringo_steal: 3200,
  sid_ketchum_heal: 3000,
  vulture_sam_loot: 3400,
};

const SLOWDOWN_FACTOR = 2; // 2 = deux fois plus lent que la conception d'origine

const PLAYBACK_DURATIONS_MS: Record<AbilityAnimationType, number> = Object.fromEntries(
  Object.entries(AUTHORED_DURATIONS_MS).map(([k, v]) => [k, v * SLOWDOWN_FACTOR])
) as Record<AbilityAnimationType, number>;

// ---------- petites aides d'interpolation, réutilisées par les 4 scènes ----------

function windowed(master: Animated.Value, startFrac: number, endFrac: number) {
  const e = Math.max(endFrac, startFrac + 0.0005);
  return master.interpolate({ inputRange: [0, startFrac, e, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
}
function popScale(local: Animated.AnimatedInterpolation<number>, from = 0.8, to = 1) {
  return local.interpolate({ inputRange: [0, 0.7, 1], outputRange: [from, to + (to - from) * 0.35, to], extrapolate: 'clamp' });
}
function fadeInHoldOut(master: Animated.Value, inStart: number, inEnd: number, outStart: number, outEnd: number) {
  return master.interpolate({ inputRange: [0, inStart, inEnd, outStart, outEnd, 1], outputRange: [0, 0, 1, 1, 0, 0], extrapolate: 'clamp' });
}
function pulseScale(master: Animated.Value, center: number, half: number) {
  const s = Math.max(0, center - half), e = Math.min(1, center + half);
  return master.interpolate({ inputRange: [0, s, center, e, 1], outputRange: [1, 1, 1.08, 1, 1], extrapolate: 'clamp' });
}

// ---------- primitives visuelles (fidèles à bang-app-design-mockup-v2.html) ----------

function CardBack({ x, y, w = 46, h = 64, opacity = 1, scale = 1 }: any) {
  return (
    <Animated.View style={[styles.cardBase, { left: x - w / 2, top: y - h / 2, width: w, height: h, opacity, transform: [{ scale }] }]}>
      <Text style={{ color: colors.brass, fontSize: w * 0.4 }}>★</Text>
    </Animated.View>
  );
}
function CardFace({ x, y, w = 62, h = 82, corner, name, red, opacity = 1, scale = 1 }: any) {
  const color = red ? colors.blood : colors.ink;
  return (
    <Animated.View style={[styles.cardBase, { left: x - w / 2, top: y - h / 2, width: w, height: h, opacity, transform: [{ scale }], padding: 5 }]}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: w * 0.16, color }}>{corner}</Text>
      <Text style={{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: -w * 0.11, textAlign: 'center', fontFamily: fonts.display, fontSize: w * 0.19, color }}>{name}</Text>
    </Animated.View>
  );
}
function Avatar({ x, y, letter, tone, scale }: { x: number; y: number; letter: string; tone: 'self' | 'other' | 'eliminated'; scale?: Animated.AnimatedInterpolation<number> }) {
  const bg = tone === 'eliminated' ? colors.leatherDark : tone === 'self' ? colors.brass : colors.leather;
  return (
    <Animated.View style={{ position: 'absolute', left: x - 23, top: y - 23, width: 46, height: 46, borderRadius: 23, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink, opacity: tone === 'eliminated' ? 0.85 : 1, transform: scale ? [{ scale }] : undefined }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.parchmentLight }}>{tone === 'eliminated' ? '💀' : letter}</Text>
    </Animated.View>
  );
}
// Un seul composant calcule la position de TOUS les pions à la fois — élimine
// tout risque de décalage entre le pion animé et les pions fixes voisins.
function AnimatedLifeRow({ x, y, total, baselineCount, animatedIndex, mode, color, t }: {
  x: number; y: number; total: number; baselineCount: number; animatedIndex: number;
  mode: 'lose' | 'gain'; color: string; t: Animated.AnimatedInterpolation<number>;
}) {
  const pipSize = 10, gap = 4;
  const rowWidth = total * pipSize + (total - 1) * gap;
  const startX = x - rowWidth / 2;
  const animatedOpacity = mode === 'lose'
    ? t.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' })
    : t.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <View style={{ position: 'absolute', left: startX, top: y - pipSize / 2, flexDirection: 'row' }}>
      {Array.from({ length: total }).map((_, i) => {
        const marginLeft = i === 0 ? 0 : gap;
        if (i === animatedIndex) {
          return (
            <View key={i} style={{ marginLeft, width: pipSize, height: pipSize, borderRadius: pipSize / 2, borderWidth: 1.5, borderColor: colors.brass, overflow: 'hidden' }}>
              <Animated.View style={{ flex: 1, margin: 1, borderRadius: pipSize / 2, backgroundColor: color, opacity: animatedOpacity }} />
            </View>
          );
        }
        const filled = i < baselineCount;
        return (
          <View key={i} style={{ marginLeft, width: pipSize, height: pipSize, borderRadius: pipSize / 2, borderWidth: 1.5, borderColor: colors.brass, backgroundColor: filled ? colors.brass : 'transparent' }} />
        );
      })}
    </View>
  );
}
function Badge({ x, y, text, opacity, translateY, color }: any) {
  return (
    <Animated.Text style={{ position: 'absolute', left: x - 60, top: y - 8, width: 120, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 13, color, opacity, transform: [{ translateY }] }}>
      {text}
    </Animated.Text>
  );
}
function CaptionSwap({ phase1, phase2, o1, o2 }: any) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 160, height: 42 }}>
      <Animated.Text style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, opacity: o1 }}>{phase1}</Animated.Text>
      <Animated.Text style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.brass, opacity: o2 }}>{phase2}</Animated.Text>
    </View>
  );
}

// ---------- les 4 scènes, timings fidèles à la conception Claude Design ----------

function SceneBartCassidy({ progress, actorName }: { progress: Animated.Value; actorName: string }) {
  const D = AUTHORED_DURATIONS_MS.bart_cassidy_draw / 1000;
  const f = (s: number) => s / D;
  const pulse = pulseScale(progress, f(0.35), f(0.2));
  const pipT = windowed(progress, f(0.25), f(0.65));
  const move = windowed(progress, f(0.6), f(1.35));
  const x = move.interpolate({ inputRange: [0, 1], outputRange: [225, 78] });
  const y = move.interpolate({ inputRange: [0, 0.5, 1], outputRange: [55, 25, 40] });
  const scale = popScale(move);
  const cardOpacity = fadeInHoldOut(progress, f(0.55) - 0.001, f(0.55), f(1.35), f(1.55));
  const badgeIn = windowed(progress, f(1.35), f(1.65));
  const badgeOpacity = fadeInHoldOut(progress, f(1.35), f(1.45), f(2.25), f(2.55));
  const badgeTy = badgeIn.interpolate({ inputRange: [0, 1], outputRange: [8, -10] });
  const capO1 = progress.interpolate({ inputRange: [0, f(0.6), f(0.65), 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' });
  const capO2 = progress.interpolate({ inputRange: [0, f(0.6), f(0.65), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.stage}>
      <Avatar x={78} y={55} letter={actorName[0]} tone="self" scale={pulse} />
      <AnimatedLifeRow x={78} y={108} total={4} baselineCount={4} animatedIndex={3} mode="lose" color={colors.blood} t={pipT} />
      <CardBack x={225} y={50} />
      <Text style={{ position: 'absolute', left: 205, top: 78, fontFamily: fonts.body, fontSize: 10, color: colors.leatherDark }}>Pioche</Text>
      <CardFace x={x as any} y={y as any} scale={scale} opacity={cardOpacity} corner="3♣" name="Bang!" w={46} h={64} />
      <Badge x={78} y={135} text="+1 carte" opacity={badgeOpacity} translateY={badgeTy} color={colors.sage} />
      <CaptionSwap phase1={`${actorName} perd 1 point de vie…`} phase2="…et pioche aussitôt une carte !" o1={capO1} o2={capO2} />
    </View>
  );
}

function SceneElGringo({ progress, actorName, targetName }: { progress: Animated.Value; actorName: string; targetName: string }) {
  const D = AUTHORED_DURATIONS_MS.el_gringo_steal / 1000;
  const f = (s: number) => s / D;
  const pulse = pulseScale(progress, f(0.55), f(0.2));
  const atk = windowed(progress, 0, f(0.5));
  const ax = atk.interpolate({ inputRange: [0, 1], outputRange: [78, 225] });
  const ay = atk.interpolate({ inputRange: [0, 0.5, 1], outputRange: [55, 25, 55] });
  const aOpacity = fadeInHoldOut(progress, 0, 0.001, f(0.5), f(0.7));
  const pipT = windowed(progress, f(0.5), f(0.85));
  const steal = windowed(progress, f(1.0), f(1.7));
  const sx = steal.interpolate({ inputRange: [0, 1], outputRange: [225, 78] });
  const sy = steal.interpolate({ inputRange: [0, 0.5, 1], outputRange: [55, 25, 55] });
  const sScale = popScale(steal);
  const sOpacity = fadeInHoldOut(progress, f(0.95), f(1.0), f(1.7), f(1.9));
  const badgeOpacity = fadeInHoldOut(progress, f(1.7), f(1.8), f(2.6), f(2.9));
  const capO1 = progress.interpolate({ inputRange: [0, f(0.95), f(1.0), 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' });
  const capO2 = progress.interpolate({ inputRange: [0, f(0.95), f(1.0), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.stage}>
      <Avatar x={78} y={55} letter={targetName[0]} tone="other" />
      <Avatar x={225} y={55} letter={actorName[0]} tone="self" scale={pulse} />
      <AnimatedLifeRow x={225} y={108} total={4} baselineCount={3} animatedIndex={2} mode="lose" color={colors.blood} t={pipT} />
      <CardFace x={ax as any} y={ay as any} opacity={aOpacity} corner="K♦" name="Bang!" red w={50} h={66} />
      <CardFace x={sx as any} y={sy as any} scale={sScale} opacity={sOpacity} corner="8♠" name="Raté!" w={46} h={64} />
      <Badge x={225} y={135} text="+1 carte" opacity={badgeOpacity} translateY={0} color={colors.sage} />
      <Badge x={78} y={135} text="−1 carte" opacity={badgeOpacity} translateY={0} color={colors.blood} />
      <CaptionSwap phase1={`Un adversaire attaque ${actorName}…`} phase2="…qui riposte en lui volant une carte !" o1={capO1} o2={capO2} />
    </View>
  );
}

function SceneSidKetchum({ progress, actorName }: { progress: Animated.Value; actorName: string }) {
  const D = AUTHORED_DURATIONS_MS.sid_ketchum_heal / 1000;
  const f = (s: number) => s / D;
  const pulse = pulseScale(progress, f(1.0), f(0.2));
  const burn = (delay: number, dx: number) => {
    const lift = windowed(progress, f(delay), f(delay + 0.3));
    const burnT = windowed(progress, f(delay + 0.3), f(delay + 0.75));
    const x = lift.interpolate({ inputRange: [0, 1], outputRange: [152, 152 + dx] });
    const yLift = lift.interpolate({ inputRange: [0, 1], outputRange: [72, 30] });
    const y = Animated.subtract(yLift, Animated.multiply(burnT, 12));
    const scale = burnT.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
    const opacity = fadeInHoldOut(progress, 0, 0.001, f(delay + 0.3), f(delay + 0.75));
    return { x, y, scale, opacity };
  };
  const c1 = burn(0, -20), c2 = burn(0.15, 20);
  const pipT = windowed(progress, f(0.85), f(1.35));
  const badgeOpacity = fadeInHoldOut(progress, f(0.9), f(1.0), f(1.8), f(2.1));
  const capO1 = progress.interpolate({ inputRange: [0, f(0.85), f(0.9), 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' });
  const capO2 = progress.interpolate({ inputRange: [0, f(0.85), f(0.9), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.stage}>
      <Avatar x={152} y={55} letter={actorName[0]} tone="self" scale={pulse} />
      <AnimatedLifeRow x={152} y={108} total={4} baselineCount={2} animatedIndex={2} mode="gain" color={colors.sage} t={pipT} />
      <CardFace x={c1.x as any} y={c1.y as any} scale={c1.scale} opacity={c1.opacity} corner="9♥" name="Bière" red w={40} h={54} />
      <CardFace x={c2.x as any} y={c2.y as any} scale={c2.scale} opacity={c2.opacity} corner="4♣" name="Diligence" w={40} h={54} />
      <Badge x={152} y={135} text="+1 PV" opacity={badgeOpacity} translateY={0} color={colors.sage} />
      <CaptionSwap phase1={`${actorName} défausse 2 cartes de sa main…`} phase2="…et regagne 1 point de vie !" o1={capO1} o2={capO2} />
    </View>
  );
}

function SceneVultureSam({ progress, actorName, targetName }: { progress: Animated.Value; actorName: string; targetName: string }) {
  const D = AUTHORED_DURATIONS_MS.vulture_sam_loot / 1000;
  const f = (s: number) => s / D;
  const pulse = pulseScale(progress, f(0.9), f(0.2));
  const defs = [{ delay: 0.15, corner: 'Q♥', name: 'Braquage!', red: true }, { delay: 0.4, corner: '6♦', name: 'Bière', red: true }, { delay: 0.65, corner: '9♣', name: 'Diligence', red: false }];
  const cards = defs.map((d) => {
    const ct = windowed(progress, f(d.delay), f(d.delay + 0.55));
    const x = ct.interpolate({ inputRange: [0, 1], outputRange: [78, 225] });
    const y = ct.interpolate({ inputRange: [0, 0.5, 1], outputRange: [55, 18, 55] });
    const opacity = fadeInHoldOut(progress, 0, 0.001, f(d.delay + 0.55), f(d.delay + 0.75));
    return { ...d, x, y, opacity };
  });
  const badgeOpacity = fadeInHoldOut(progress, f(0.15), f(0.25), f(2.0), f(2.3));
  const capO1 = progress.interpolate({ inputRange: [0, f(0.55), f(0.6), 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' });
  const capO2 = progress.interpolate({ inputRange: [0, f(0.55), f(0.6), 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.stage}>
      <Avatar x={78} y={55} letter={targetName[0]} tone="eliminated" />
      <Avatar x={225} y={55} letter={actorName[0]} tone="self" scale={pulse} />
      {cards.map((c, i) => (
        <CardFace key={i} x={c.x as any} y={c.y as any} opacity={c.opacity} corner={c.corner} name={c.name} red={c.red} w={44} h={60} />
      ))}
      <Badge x={225} y={135} text="+3 cartes" opacity={badgeOpacity} translateY={0} color={colors.sage} />
      <CaptionSwap phase1="Un joueur vient d'être éliminé…" phase2={`…${actorName} récupère toutes ses cartes !`} o1={capO1} o2={capO2} />
    </View>
  );
}

const SCENES: Record<AbilityAnimationType, React.ComponentType<any>> = {
  bart_cassidy_draw: SceneBartCassidy,
  el_gringo_steal: SceneElGringo,
  sid_ketchum_heal: SceneSidKetchum,
  vulture_sam_loot: SceneVultureSam,
};

const TITLES: Record<AbilityAnimationType, string> = {
  bart_cassidy_draw: 'Bart Cassidy',
  el_gringo_steal: 'El Gringo',
  sid_ketchum_heal: 'Sid Ketchum',
  vulture_sam_loot: 'Sam le Vautour',
};

// ---------- le composant public : superposition auto-gérée ----------

export default function AbilityAnimationOverlay({ request, onDone }: { request: AbilityAnimationRequest | null; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const panelScale = useRef(new Animated.Value(0.85)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!request) return;
    progress.setValue(0);
    panelScale.setValue(0.85);
    panelOpacity.setValue(0);
    const duration = PLAYBACK_DURATIONS_MS[request.type];

    Animated.parallel([
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(panelOpacity, { toValue: 1, duration: duration * 0.28, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(panelScale, { toValue: 1, duration: duration * 0.28, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
    ]).start();

    const fadeOutTimer = setTimeout(() => {
      Animated.timing(panelOpacity, { toValue: 0, duration: duration * 0.3, useNativeDriver: true }).start(() => onDone());
    }, duration - duration * 0.3);

    return () => clearTimeout(fadeOutTimer);
  }, [request?.id]);

  if (!request) return null;
  const Scene = SCENES[request.type];

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: panelOpacity }]}>
      <View style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.panel, { transform: [{ scale: panelScale }] }]}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelHeaderStar}>★</Text>
          <Text style={styles.panelHeaderText}>{TITLES[request.type]}</Text>
        </View>
        <Scene progress={progress} actorName={request.actorName} targetName={request.targetName ?? ''} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', left: '50%', top: '50%', width: 300, height: 274,
    marginLeft: -150, marginTop: -137, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.parchmentLight,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  panelHeader: { backgroundColor: colors.leather, paddingVertical: 9, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  panelHeaderStar: { color: colors.brass, fontSize: 14 },
  panelHeaderText: { fontFamily: fonts.display, fontSize: 15, color: colors.parchmentLight },
  stage: { width: 260, height: 230, alignSelf: 'center', marginTop: 14 },
  cardBase: { position: 'absolute', backgroundColor: colors.parchmentLight, borderWidth: 2, borderColor: colors.ink, borderRadius: 7 },
});