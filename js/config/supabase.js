// Configuração do Supabase
export const SUPABASE_URL = 'https://empudtomipsvoqmovucy.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_iJmpm2MLQO_F5Id5bE1uKA_DvpdrOnL';

export function initSupabase() {
  if (window.supabase) return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Será carregado via CDN no HTML
  return null;
}
