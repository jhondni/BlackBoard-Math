import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase.js';

export class AuthController {
  constructor() {
    this.supabase = null;
    this.user = null;
    this.session = null;
    this.onAuthChange = null;
  }

  async init() {
    if (!window.supabase) {
      console.error('Supabase JS não carregado');
      return;
    }
    this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Verificar sessão atual
    const { data: { session } } = await this.supabase.auth.getSession();
    this.session = session;
    this.user = session?.user || null;
    
    // Escutar mudanças de auth
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.session = session;
      this.user = session?.user || null;
      if (this.onAuthChange) this.onAuthChange(event, session, this.user);
    });
    
    return { session: this.session, user: this.user };
  }

  async signUp(email, password) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    this.user = null;
    this.session = null;
  }

  async saveBoard(title, boardData) {
    if (!this.user) throw new Error('Usuário não autenticado');
    
    const { data, error } = await this.supabase
      .from('boards')
      .upsert({
        user_id: this.user.id,
        title,
        data: boardData,
        updated_at: new Date().toISOString()
      })
      .select();
    
    if (error) throw error;
    return data;
  }

  async loadBoards() {
    if (!this.user) throw new Error('Usuário não autenticado');
    
    const { data, error } = await this.supabase
      .from('boards')
      .select('*')
      .eq('user_id', this.user.id)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  async loadBoard(id) {
    if (!this.user) throw new Error('Usuário não autenticado');
    
    const { data, error } = await this.supabase
      .from('boards')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.user.id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteBoard(id) {
    if (!this.user) throw new Error('Usuário não autenticado');
    
    const { error } = await this.supabase
      .from('boards')
      .delete()
      .eq('id', id)
      .eq('user_id', this.user.id);
    
    if (error) throw error;
  }
}
