require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_2,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2
);

async function run() {
  const { data, error } = await supabase.from('payments').select('outlet, utility, periode, usage, tarif').eq('tarif', 33500);
  if (error) {
    console.error(error);
  } else {
    // filter data for usage 242.16 or close
    const matches = data.filter(d => String(d.usage).includes('242') || String(d.usage).includes('298'));
    console.log(matches);
  }
}
run();
