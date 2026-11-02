// GestMZ — Edge Function «recuperar-totp» (Deno). NÃO PUBLICADA. Ver docs/TOTP-DESENHO.md e docs/TOTP-IMPLEMENTACAO.md.
// A lógica (e os testes) está em logica.mjs. Aqui só se ligam as dependências reais.
// A chave de serviço (SUPABASE_SERVICE_ROLE_KEY) é injetada pelo Supabase na função; nunca vai para a app, o APK nem o repositório.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { tratar } from './logica.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Origens da app autorizadas (separadas por vírgula), p. ex. https://gestmz.vercel.app,https://localhost,capacitor://localhost,app://gestmz
const origens = (Deno.env.get('GESTMZ_ORIGENS') || '').split(',').map((s) => s.trim()).filter(Boolean);
const admin = createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });

const deps = {
  origens,
  getUser: async (jwt: string) => { const { data, error } = await admin.auth.getUser(jwt); return error || !data?.user ? null : { id: data.user.id }; },
  rpc: (nome: string, args: Record<string, unknown>) => admin.rpc(nome, args),
  listarFatores: async (userId: string) => { const { data, error } = await admin.auth.admin.mfa.listFactors({ userId }); if (error) throw new Error('listFactors'); return data?.factors ?? []; },
  apagarFator: async (userId: string, id: string) => { const { error } = await admin.auth.admin.mfa.deleteFactor({ id, userId }); return { error }; },
  log: (e: unknown) => console.log(JSON.stringify(e)),   // só eventos sem segredos
};

Deno.serve((req: Request) => tratar(req, deps));
