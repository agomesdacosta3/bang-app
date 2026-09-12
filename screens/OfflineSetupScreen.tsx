import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { colors, fonts } from '../theme';
import WoodButton from '../components/WoodButton';

export default function OfflineSetupScreen({ onStart, onCancel }: { onStart: (nickname: string, botCount: number) => void; onCancel: () => void }) {
  const [nickname, setNickname] = useState('');
  const [botCount, setBotCount] = useState(3);

  function handleStart() {
    if (!nickname.trim()) { Alert.alert('Pseudo requis', 'Entre un pseudo avant de commencer.'); return; }
    onStart(nickname.trim(), botCount);
  }

  return (
    <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Partie hors ligne</Text>
        <Text style={styles.subtitle}>Affrontez des IA, aucune connexion requise.</Text>

        <Text style={styles.label}>Votre pseudo</Text>
        <TextInput
          style={styles.input}
          placeholder="Votre pseudo"
          placeholderTextColor="#8A7256"
          maxLength={20}
          value={nickname}
          onChangeText={setNickname}
        />

        <Text style={styles.label}>Nombre d'adversaires ({botCount + 1} joueurs au total)</Text>
        <View style={styles.botRow}>
          {[3, 4, 5, 6].map(n => (
            <WoodButton
              key={n}
              title={`${n}`}
              onPress={() => setBotCount(n)}
              variant={botCount === n ? 'primary' : 'default'}
              style={styles.botBtn}
            />
          ))}
        </View>

        <WoodButton title="Commencer la partie" onPress={handleStart} variant="primary" style={styles.mainBtn} />
        <WoodButton title="Annuler" onPress={onCancel} variant="muted" style={styles.mainBtn} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1, backgroundColor: colors.parchment },
  container: { flexGrow: 1, alignItems: 'center', padding: 24, paddingTop: 60, gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.leatherDark },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.leatherDark, marginBottom: 16, textAlign: 'center' },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.leatherDark, alignSelf: 'flex-start', marginTop: 12 },
  input: {
    borderWidth: 2, borderColor: colors.ink, borderRadius: 8, backgroundColor: colors.parchmentLight,
    paddingVertical: 10, paddingHorizontal: 12, width: '100%', fontFamily: fonts.body, fontSize: 15, color: colors.ink,
  },
  botRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  botBtn: { width: 56, paddingVertical: 10 },
  mainBtn: { width: 260, marginTop: 16 },
});