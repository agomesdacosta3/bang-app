import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function callFunction<T = any>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const errBody = await error.context.json();
        if (errBody?.error) message = errBody.error;
      } catch {
        // corps non-JSON, on garde le message générique
      }
    }
    throw new Error(message);
  }
  return data as T;
}