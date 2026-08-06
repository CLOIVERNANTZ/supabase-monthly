const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if(match) envVars[match[1]] = match[2].replace(/^['"`]|['"`]$/g, '').trim();
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(envVars['NEXT_PUBLIC_SUPABASE_URL_2'], envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY_2']);
supabase.from('users').select('fullname, accessOutlets').eq('role', 'SPV AP').then(res => console.log(JSON.stringify(res.data, null, 2)));
