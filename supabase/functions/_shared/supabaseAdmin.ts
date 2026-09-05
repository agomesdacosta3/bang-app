import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  secretKey,
  { auth: { persistSession: false } }
);