require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_2,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2
);

async function run() {
  const { data, error } = await supabase.from('payments').select('utility').limit(1000);
  if (error) console.error(error);
  else {
    const utils = new Set(data.map(d => d.utility));
    console.log(Array.from(utils));
  }
}
run();
