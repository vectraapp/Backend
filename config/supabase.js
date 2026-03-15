/**
 * PastQuest - Supabase Configuration
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_ANON_KEY');
}

// Public client (respects RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (bypasses RLS) - use carefully
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Create client with user token
function getAuthenticatedClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

module.exports = {
  supabase,
  supabaseAdmin,
  getAuthenticatedClient
};
