import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, cardLabels } from '../theme';

const SUIT_SYMBOLS: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const VALUE_LABELS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function isRed(suit?: string | null) {
  return suit === 'hearts' || suit === 'diamonds';
}

type Props = {
  cardType: string;
  suit?: string | null;
  value?: number | null;
  playable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  size?: 'normal' | 'small';
};

export default function PlayingCard({ cardType, suit, value, playable, selected, onPress, size = 'normal' }: Props) {
  const label = cardLabels[cardType] ?? cardType;
  const corner = suit && value ? `${VALUE_LABELS[value] ?? value}${SUIT_SYMBOLS[suit] ?? ''}` : '';
  const red = isRed(suit);
  const small = size === 'small';

  const inner = (
    <View style={[styles.card, small ? styles.cardSmall : styles.cardNormal, selected && styles.selected]}>
      {!!corner && <Text style={[styles.corner, red ? styles.red : styles.black]}>{corner}</Text>}
      <Text style={[styles.name, small && styles.nameSmall, red ? styles.red : styles.black]} numberOfLines={3}>
        {label}
      </Text>
      {selected && <Text style={styles.checkMark}>&#10003;</Text>}
      {playable && !small && (
        <View style={styles.footer}><Text style={styles.footerText}>Jouer</Text></View>
      )}
    </View>
  );

  if (!onPress) return inner;
  return <Pressable onPress={onPress}>{inner}</Pressable>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.parchmentLight,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    padding: 6,
  },
  cardNormal: { width: 78, height: 100 },
  cardSmall: { width: 46, height: 62, padding: 4 },
  selected: { borderColor: colors.brass, borderWidth: 3 },
  corner: { fontFamily: fonts.bodyBold, fontSize: 11 },
  name: { fontFamily: fonts.display, fontSize: 13, textAlign: 'center', marginTop: 10 },
  nameSmall: { fontSize: 9, marginTop: 4 },
  red: { color: colors.blood },
  black: { color: colors.ink },
  checkMark: { position: 'absolute', top: 4, right: 6, color: colors.brass, fontFamily: fonts.bodyBold, fontSize: 14 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.sage, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, paddingVertical: 2,
  },
  footerText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.parchmentLight, textAlign: 'center' },
});