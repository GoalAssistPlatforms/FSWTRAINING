import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cjtevckufmaygyhnbtup.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdGV2Y2t1Zm1heWd5aG5idHVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMDgzODQsImV4cCI6MjA4Mzc4NDM4NH0.EbKVKMRxcsrCG8iIfX55g_m1Vtj5OdBRqnbrGsXjcfU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSignup() {
  const email = 'test_signup_agent@examplenonexistent123.com';
  const password = 'TestPassword123!';
  
  console.log("Attempting to sign up:", email);
  
  const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
          data: {
              full_name: "Test User",
              department: "Engineering"
          },
          emailRedirectTo: "https://fsw-training.netlify.app"
      }
  });

  if (error) {
      console.error("Signup failed with error:", error);
  } else {
      console.log("Signup returned data:", JSON.stringify(data, null, 2));
      
      // Let's verify if the profile was created
      if (data.user) {
          console.log("Checking if profile exists...");
          const { data: profs, error: profErr } = await supabase.from('profiles').select('*').eq('id', data.user.id);
          if (profErr) {
              console.error("Profile check error:", profErr);
          } else {
              console.log("Found profile records:", profs);
          }
      }
  }
}

testSignup();
