import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not found!');
  console.error('Please set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY in your .env file');
  console.error('Current values:', {
    url: supabaseUrl ? '✓ Set' : '✗ Missing',
    key: supabaseAnonKey ? '✓ Set' : '✗ Missing'
  });
}

// Crear cliente de Supabase
export const supabase = createClient(
  supabaseUrl || 'https://fnpzoqjnisgkhgnlwzic.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY'
);

if (supabaseUrl && supabaseAnonKey) {
  console.log('✅ Supabase client initialized successfully');
  console.log('🔗 URL:', supabaseUrl);
}
