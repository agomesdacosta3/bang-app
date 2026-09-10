import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'muted' | 'safe';
  style?: ViewStyle;
};

const BG_BY_VARIANT: Record<string, string> = {
  default: colors.leather,
  primary: colors.blood,
  muted: '#8A8073',
  safe: colors.sage,
};

export default function WoodButton({ title, onPress, disabled, variant = 'default', style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: BG_BY_VARIANT[variant], opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 15,
    letterSpacing: 0.5,
    color: colors.parchmentLight,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});