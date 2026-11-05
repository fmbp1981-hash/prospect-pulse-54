#!/usr/bin/env python3
"""Monta o teste de ciclo do opt-out (TASK-001, AC-007) a partir dos arquivos versionados.

Uso:
    python3 tests/db/contact-opt-outs-rollback-cycle.py > /tmp/ciclo.sql
    (colar no SQL editor do Supabase ou rodar com psql como postgres)

Pré-condição: 20261105100000 e 20261105110000 já aplicadas e as duas tabelas
VAZIAS. Com uma oposição real gravada, a trava do down da base recusa e o
ciclo aborta. Os DROPs seguram ACCESS EXCLUSIVE nas duas tabelas até o fim da
transação: em banco compartilhado (staging = produção), rodar em janela sem uso
do opt-out ou num banco local/branch.

O SQL gerado roda inteiro numa transação e termina com
`raise exception 'RESULTADO_TESTE ...'`, que desfaz tudo (inclusive os DROPs):
nada fica gravado. Esperado: todas as linhas `=true`.

Sequência:
  1. reforço 2x (idempotência)
  2. base reaplicada depois do reforço e reforço de novo (k1: service_role
     volta a ter UPDATE só nas colunas de situação)
  3. down do reforço, down da base (k2: tabelas removidas), base, reforço
  4. corpo de tests/db/contact-opt-outs.sql (cenários 1..39)
  5. trava do down da base com uma oposição gravada:
     k3 recusa sem confirmação; k4 aceita com app.confirm_drop_opt_out_evidence;
     k5 papel sem BYPASSRLS recebe erro (falha fechada), não passa vazio

Monta a partir dos próprios arquivos para não haver cópia divergente.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
MIG = RAIZ / "supabase" / "migrations"
BASE = (MIG / "20261105100000_contact_opt_outs.sql").read_text()
REFORCO = (MIG / "20261105110000_contact_opt_outs_hardening.sql").read_text()
DOWN_BASE = (MIG / "rollback" / "20261105100000_contact_opt_outs.down.sql").read_text()
DOWN_REFORCO = (MIG / "rollback" / "20261105110000_contact_opt_outs_hardening.down.sql").read_text()
TESTE = (RAIZ / "tests" / "db" / "contact-opt-outs.sql").read_text()

N_CENARIOS = 39
CICLO = ["k1", "k2", "k3", "k4", "k5"]


def corpo_do_teste() -> str:
    """Trecho de contact-opt-outs.sql entre `begin;` e a consulta final de resultados."""
    inicio = TESTE.index("\nbegin;\n") + len("\nbegin;\n")
    fim = TESTE.index("\nselect c.cenario")
    return TESTE[inicio:fim]


def trava_do_down_base() -> str:
    """Bloco DO da trava, extraído do down da base."""
    inicio = DOWN_BASE.index("do $$")
    fim = DOWN_BASE.index("end $$;", inicio) + len("end $$;")
    trava = DOWN_BASE[inicio:fim]
    assert "$g$" not in trava
    return trava


def conferir_delimitadores() -> None:
    """Os delimitadores do SQL montado não podem aparecer nos arquivos incluídos."""
    for delimitador in ("$g$", "$ciclo$", "$res$"):
        for texto in (BASE, REFORCO, DOWN_BASE, DOWN_REFORCO, TESTE):
            assert delimitador not in texto, delimitador


def tentar_trava(papel: str, uid: str, confirmar: bool) -> str:
    prefixo = "'select set_config(''app.confirm_drop_opt_out_evidence'', ''yes'', true)', " if confirmar else ""
    return f"pg_temp.tentar({uid}, '{papel}', array[{prefixo}$g${trava_do_down_base()}$g$])"


def montar() -> str:
    conferir_delimitadores()
    resultados = [f"c{n}" for n in range(1, N_CENARIOS + 1)] + CICLO
    lista = ", ".join(f"'{r}'" for r in resultados)
    partes = [
        "begin;",
        "-- ===== 1. reforço 2x (idempotência) =====",
        REFORCO,
        REFORCO,
        "-- ===== 2. base reaplicada depois do reforço, depois o reforço =====",
        BASE,
        REFORCO,
        "select set_config('teste.k1_ok', (",
        "  not has_column_privilege('service_role', 'public.contact_opt_outs', 'id', 'UPDATE')",
        "  and not has_column_privilege('service_role', 'public.contact_opt_outs', 'organization_id', 'UPDATE')",
        "  and not has_column_privilege('service_role', 'public.contact_opt_outs', 'created_at', 'UPDATE')",
        "  and has_column_privilege('service_role', 'public.contact_opt_outs', 'status', 'UPDATE'))::text, true);",
        "select set_config('teste.k1_det', 'base + reforço: UPDATE de service_role só nas colunas de situação', true);",
        "-- ===== 3. down do reforço, down da base, base, reforço =====",
        DOWN_REFORCO,
        DOWN_BASE,
        "select set_config('teste.k2_ok', (to_regclass('public.contact_opt_outs') is null",
        "  and to_regclass('public.contact_opt_out_events') is null)::text, true);",
        "select set_config('teste.k2_det', 'down removeu as tabelas; base + reforço reaplicados', true);",
        BASE,
        REFORCO,
        "-- ===== 4. tests/db/contact-opt-outs.sql =====",
        corpo_do_teste(),
        "-- ===== 5. trava do down da base com uma oposição gravada =====",
        "do $ciclo$",
        "declare v_res text; v_org uuid; v_uid uuid;",
        "begin",
        "  select id into v_org from public.organizations order by created_at limit 1;",
        "  -- teste.adm (definido pelo corpo do teste): determinístico",
        "  v_uid := nullif(current_setting('teste.adm', true), '')::uuid;",
        "  insert into public.contact_opt_outs (organization_id, phone_e164, source)",
        "  values (v_org, '+5511999990009', 'usuario');",
        f"  v_res := {tentar_trava('postgres', 'null', False)};",
        "  perform set_config('teste.k3_ok', (v_res like 'P0001%rollback recusado%')::text, true);",
        "  perform set_config('teste.k3_det', v_res, true);",
        f"  v_res := {tentar_trava('postgres', 'null', True)};",
        "  perform set_config('teste.k4_ok', (v_res = 'aceito')::text, true);",
        "  perform set_config('teste.k4_det', v_res, true);",
        f"  v_res := {tentar_trava('authenticated', 'v_uid', False)};",
        "  -- só o 42501 de RLS prova a falha fechada (P0001 viria da trava antiga)",
        "  perform set_config('teste.k5_ok', (v_res like '42501%row-level security%')::text, true);",
        "  perform set_config('teste.k5_det', v_res, true);",
        "end $ciclo$;",
        "do $res$",
        "declare v_out text;",
        "begin",
        "  select string_agg(r || '=' || coalesce(nullif(current_setting('teste.' || r || '_ok', true), ''), 'null')",
        "         || ' [' || left(coalesce(current_setting('teste.' || r || '_det', true), ''), 70) || ']', E'\\n' order by o)",
        f"    into v_out from unnest(array[{lista}]) with ordinality as t(r, o);",
        "  raise exception E'RESULTADO_TESTE (transação desfeita)\\n%', v_out;",
        "end $res$;",
        "rollback;",
    ]
    return "\n".join(partes) + "\n"


if __name__ == "__main__":
    print(montar(), end="")
