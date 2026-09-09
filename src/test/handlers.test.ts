import {CONSULTS, HANDLERS, HANDLER_FNS, Handler} from '../handlers';

type Hook = keyof Handler<unknown>;

function definitions(): {table: string; id: string; hook: Hook}[] {
  const found: {table: string; id: string; hook: Hook}[] = [];
  for (const [table, entries] of Object.entries(HANDLERS)) {
    for (const [id, entry] of Object.entries(entries as {[id: string]: object})) {
      for (const key of Object.keys(entry)) {
        if ((HANDLER_FNS as string[]).includes(key)) found.push({table, id, hook: key as Hook});
      }
    }
  }
  return found;
}

describe('handler reachability', () => {
  test('every declared hook says which participants are asked for it', () => {
    for (const hook of HANDLER_FNS) expect(CONSULTS).toHaveProperty(hook);
  });

  test('no handler is defined for a hook nothing consults', () => {
    const dead = definitions()
      .filter(({hook}) => CONSULTS[hook].length === 0)
      .map(({table, id, hook}) => `${table}.${id}.${hook}`);

    const known = dead.filter(entry => entry.endsWith('.onEat') || entry.endsWith('.onUpdate'));
    expect(dead.filter(entry => !known.includes(entry))).toEqual([]);
  });

  test('the dead handlers are still exactly these', () => {
    const dead = definitions()
      .filter(({hook}) => CONSULTS[hook].length === 0)
      .map(({table, id, hook}) => `${table}.${id}.${hook}`)
      .sort();

    expect(dead).toEqual([
      'Items.berserkgene.onUpdate',
      'Items.figyberry.onEat',
      'Items.figyberry.onUpdate',
      'Items.sitrusberry.onEat',
      'Items.sitrusberry.onUpdate',
    ]);
  });
});
