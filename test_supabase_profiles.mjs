import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cjtevckufmaygyhnbtup.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdGV2Y2t1Zm1heWd5aG5idHVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMDgzODQsImV4cCI6MjA4Mzc4NDM4NH0.EbKVKMRxcsrCG8iIfX55g_m1Vtj5OdBRqnbrGsXjcfU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('profiles').select('*');
  console.log("Profiles:");
  console.log(data);
  if (error) console.error(error);
}
test();
