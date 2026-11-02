// Configuração do GestMZ — preencha estes dois valores (Supabase → Project Settings → API).
// A chave abaixo é a chave PÚBLICA (anon / publishable). Pode ficar visível. NUNCA coloque aqui a chave "service_role" nem a senha do banco.
window.GESTMZ_CONFIG = {
  SUPABASE_URL: "https://vziaaqadoapstjumitor.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6aWFhcWFkb2Fwc3RqdW1pdG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTQ0NTIsImV4cCI6MjEwODI5MDQ1Mn0.9x0YF_PMT5DrDGaoLz3otYKhfoWMvcgFYWPYzenfAdU",
  // Domínio usado só internamente para os logins dos funcionários (não precisa de existir).
  STAFF_DOMAIN: "gestmz.app",
  // Onde as apps Android e Windows procuram a lista de versões publicadas (só é atualizada quando uma versão é aprovada).
  VERSOES_URL: "https://raw.githubusercontent.com/zeboys96/Gestmz-/main/www/versions.json"
};
