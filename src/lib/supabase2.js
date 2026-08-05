import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_2;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2;

// Kita hanya menginisialisasi jika kredensialnya ada agar tidak error
export const supabase2 = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;