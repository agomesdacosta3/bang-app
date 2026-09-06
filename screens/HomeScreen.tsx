import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { callFunction } from '../lib/functions';

type GameState = { gameId: string; playerId: string; joinCode?: string };

export default function HomeScreen({ onJoined }: { onJoined: (state: GameState) => void }) {
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [loading, setLoading] = useState(false);

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
    <View style={styles.container}>
      <Text style={styles.title}>BANG!</Text>
      <Button title="Créer une partie" onPress={handleCreate} disabled={loading} />
      <View style={styles.spacer} />
      <TextInput
        style={styles.input}
        placeholder="Code à 6 caractères"
        autoCapitalize="characters"
        maxLength={6}
        value={joinCodeInput}
        onChangeText={setJoinCodeInput}
      />
      <Button title="Rejoindre" onPress={handleJoin} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, width: 200, textAlign: 'center', fontSize: 18 },
  spacer: { height: 24 },
});