-- Funções de apoio aos testes (schema "t"): executar SQL "como" um utilizador do Supabase e registar PASSA/FALHA.
drop schema if exists t cascade; create schema t;
create table t.res(n serial, ok boolean, nome text, obtido text);
create function t.como(uid uuid, sql text) returns text language plpgsql as $$
declare r text; v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', case when uid is null then 'anon' else 'authenticated' end, 'session_id', 'sessao-' || coalesce(uid::text, 'anon'))::text, true);
  execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
  begin execute sql into v; r := 'ok' || coalesce(':' || v, '');
  exception when others then r := 'ERRO: ' || sqlerrm; end;
  reset role; return r;
end $$;
-- como(), mas para instruções que não devolvem linhas (insert/update/delete/call)
create function t.faz(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'session_id', 'sessao-' || coalesce(uid::text, 'anon'))::text, true);
  execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
  begin execute sql; r := 'ok'; exception when others then r := 'ERRO: ' || sqlerrm; end;
  reset role; return r;
end $$;
create function t.chk(nome text, obtido text, esperado text) returns void language plpgsql as $$
begin insert into t.res(ok, nome, obtido) values (coalesce(obtido ~ esperado, false), nome, left(coalesce(obtido, 'NULL'), 200)); end $$;
