/**
 * Cliente Supabase falso para testes de rota/serviço com service_role.
 *
 * Registra cada consulta (tabela, operação, payload, filtros) em `calls` e
 * devolve o que o `handler` responder. Cobre o subconjunto do query builder
 * usado pelo código: select/insert/update/upsert/delete, filtros, single,
 * maybeSingle, await direto (thenable) e rpc.
 */

export type FakeOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';

export interface FakeFilter {
  kind: string;
  column: string;
  value: unknown;
}

export interface FakeCall {
  table: string;
  op: FakeOp;
  columns?: string;
  payload?: unknown;
  filters: FakeFilter[];
  returning: boolean;
}

export interface FakeResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export type FakeHandler = (call: FakeCall) => FakeResult | undefined;

export function filterValue(call: FakeCall, column: string, kind = 'eq'): unknown {
  return call.filters.find((f) => f.kind === kind && f.column === column)?.value;
}

export function createFakeSupabase(handler: FakeHandler) {
  const calls: FakeCall[] = [];

  function run(call: FakeCall): Promise<FakeResult> {
    calls.push(call);
    return Promise.resolve(handler(call) ?? { data: null, error: null });
  }

  function from(table: string) {
    const call: FakeCall = { table, op: 'select', filters: [], returning: false };
    let opSet = false;
    const setOp = (op: FakeOp, payload?: unknown) => {
      call.op = op;
      opSet = true;
      if (payload !== undefined) call.payload = payload;
    };
    const filter = (kind: string) => (column: string, value?: unknown) => {
      call.filters.push({ kind, column, value });
      return builder;
    };
    const builder = {
      select(columns?: string) {
        if (opSet) call.returning = true;
        else setOp('select');
        call.columns = columns ?? '*';
        return builder;
      },
      insert(payload: unknown) { setOp('insert', payload); return builder; },
      update(payload: unknown) { setOp('update', payload); return builder; },
      upsert(payload: unknown) { setOp('upsert', payload); return builder; },
      delete() { setOp('delete'); return builder; },
      eq: filter('eq'),
      neq: filter('neq'),
      lt: filter('lt'),
      lte: filter('lte'),
      gt: filter('gt'),
      gte: filter('gte'),
      like: filter('like'),
      ilike: filter('ilike'),
      in: filter('in'),
      is: filter('is'),
      or: (value: string) => { call.filters.push({ kind: 'or', column: '', value }); return builder; },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: () => run(call),
      maybeSingle: () => run(call),
      then<T1 = FakeResult, T2 = never>(
        onFulfilled?: ((value: FakeResult) => T1 | PromiseLike<T1>) | null,
        onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
      ): Promise<T1 | T2> {
        return run(call).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const client = {
    from,
    rpc: (name: string, args: unknown) =>
      run({ table: `rpc:${name}`, op: 'rpc', payload: args, filters: [], returning: false }),
  };

  return { client, calls };
}
