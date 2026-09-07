const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PLAYER_ID = process.argv[2];
if (!PLAYER_ID) {
  console.error('Usage: node scripts/get-bot-token.js PLAYER_ID');
  process.exit(1);
}

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function run() {
  const anon = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInAnonymously();
  if (error) throw error;

  const { error: updateError } = await admin.from('players').update({ user_id: data.user.id }).eq('id', PLAYER_ID);
  if (updateError) throw updateError;

  console.log('Nouveau token pour ce siège :');
  console.log(data.session.access_token);
}

run().catch(console.error);