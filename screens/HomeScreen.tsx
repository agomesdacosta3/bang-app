import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, fonts } from '../theme';
import WoodButton from '../components/WoodButton';

type GameState = { gameId: string; playerId: string; joinCode?: string };

export default function HomeScreen({ onJoined }: { onJoined: (state: GameState) => void }) {
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function callFunction(name: string, body: object) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  }

  async function handleCreate() {
    setLoading(true);
    try {
      const data = await callFunction('create-game', {});
      onJoined({ gameId: data.gameId, playerId: data.playerId, joinCode: data.joinCode });
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!joinCodeInput.trim()) return;
    setLoading(true);
    try {
      const data = await callFunction('join-game', { joinCode: joinCodeInput.trim().toUpperCase() });
      onJoined({ gameId: data.gameId, playerId: data.playerId });
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flexFill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>BANG!</Text>
        <Text style={styles.subtitle}>Duels, trahisons et poussière au Far West</Text>

        <WoodButton title="Créer une partie" onPress={handleCreate} disabled={loading} variant="primary" style={styles.button} />

        <Text style={styles.orText}>— ou —</Text>

        <Text style={styles.inputLabel}>Code de la partie</Text>
        <TextInput
          style={styles.input}
          placeholder="XXXXXX"
          placeholderTextColor="#8A7256"
          autoCapitalize="characters"
          maxLength={6}
          value={joinCodeInput}
          onChangeText={setJoinCodeInput}
        />
        <WoodButton title="Rejoindre" onPress={handleJoin} disabled={loading} style={styles.button} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1, backgroundColor: colors.parchment },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 52, color: colors.blood, marginBottom: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.leatherDark, marginBottom: 24, textAlign: 'center' },
  orText: { fontFamily: fonts.body, fontSize: 13, color: colors.leatherDark, marginVertical: 8 },
  inputLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.leatherDark, marginTop: 4 },
  input: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    backgroundColor: colors.parchmentLight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: 220,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 18,
    letterSpacing: 4,
    color: colors.ink,
  },
  button: { width: 220 },
});