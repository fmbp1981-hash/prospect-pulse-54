# LeadFinder Pro — Workflow Reference

## Os 4 Comandos IntelliX para Novas Features

```
/spec  → criar/atualizar SPEC.md
/break → criar issues/ atômicas
/plan  → plano técnico com 7 seções (nunca pular)
/execute → implementar APENAS arquivos listados no /plan
```

## Ordem de Implementação Obrigatória

1. Protótipo de UI (componente sem lógica, dados mockados)
2. Schema SQL em `supabase/migrations/`
3. Tipos em `src/types/index.ts`
4. Zod schema em `src/validations/`
5. Repository em `src/repositories/`
6. Service em `src/services/`
7. Route Handler em `app/api/`
8. Conectar UI ao backend
9. Testes

## Checklist pós-implementação

- [ ] Só arquivos do /plan foram modificados
- [ ] RLS ativo na tabela criada
- [ ] Nenhum secret exposto no frontend
- [ ] Sessão Supabase validada na API route
- [ ] `npx tsc --noEmit` sem erros
- [ ] Feature funcional em dev local antes de commitar
