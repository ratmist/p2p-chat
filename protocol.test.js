/**
 * HexMesh Protocol Tests
 * Запуск: npx jest tests/protocol.test.js
 */

const { createHash } = require('crypto');

// ── Utils (extracted from MeshContext) ────────────────────────────────────────

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function generateId() {
  return Math.random().toString(36).slice(2, 10) + '-' +
    Math.random().toString(36).slice(2, 10);
}

const MSG_RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000];
const CHUNK_SIZE_BYTES = 48 * 1024;
const MAX_TTL = 7;
const ROUTE_STALE_MS = 45_000;

// ── Deduplication & Loop Prevention ───────────────────────────────────────────

describe('Packet deduplication', () => {
  let seen;
  beforeEach(() => { seen = new Set(); });

  const processPacket = (packet) => {
    if (seen.has(packet.id)) return 'duplicate';
    seen.add(packet.id);
    return 'processed';
  };

  test('processes new packet', () => {
    const p = { id: 'abc-123' };
    expect(processPacket(p)).toBe('processed');
  });

  test('drops duplicate packet id', () => {
    const p = { id: 'abc-123' };
    processPacket(p);
    expect(processPacket(p)).toBe('duplicate');
  });

  test('processes different ids independently', () => {
    expect(processPacket({ id: 'aaa' })).toBe('processed');
    expect(processPacket({ id: 'bbb' })).toBe('processed');
    expect(processPacket({ id: 'aaa' })).toBe('duplicate');
    expect(processPacket({ id: 'bbb' })).toBe('duplicate');
  });
});

describe('TTL enforcement', () => {
  const route = (packet) => {
    if (packet.ttl <= 0) return 'dropped';
    return { ...packet, ttl: packet.ttl - 1 };
  };

  test('drops packet with ttl=0', () => {
    expect(route({ ttl: 0 })).toBe('dropped');
  });

  test('drops packet with negative ttl', () => {
    expect(route({ ttl: -1 })).toBe('dropped');
  });

  test('forwards and decrements valid ttl', () => {
    expect(route({ ttl: 7 })).toMatchObject({ ttl: 6 });
    expect(route({ ttl: 1 })).toMatchObject({ ttl: 0 });
  });

  test('max TTL constant is 7', () => {
    expect(MAX_TTL).toBe(7);
  });
});

describe('Loop prevention via visited[]', () => {
  const nodeId = 'node-A';

  const shouldForward = (packet) => {
    return !packet.visited.includes(nodeId);
  };

  test('forwards packet not yet visited this node', () => {
    expect(shouldForward({ visited: [] })).toBe(true);
    expect(shouldForward({ visited: ['node-B', 'node-C'] })).toBe(true);
  });

  test('blocks packet already visited this node', () => {
    expect(shouldForward({ visited: ['node-A'] })).toBe(false);
    expect(shouldForward({ visited: ['node-B', 'node-A', 'node-C'] })).toBe(false);
  });
});

// ── Message Reliability ────────────────────────────────────────────────────────

describe('Message retry schedule', () => {
  test('has 5 retry attempts', () => {
    expect(MSG_RETRY_DELAYS).toHaveLength(5);
  });

  test('delays are increasing (exponential backoff)', () => {
    for (let i = 1; i < MSG_RETRY_DELAYS.length; i++) {
      expect(MSG_RETRY_DELAYS[i]).toBeGreaterThan(MSG_RETRY_DELAYS[i - 1]);
    }
  });

  test('total wait before failure is > 60 seconds', () => {
    const total = MSG_RETRY_DELAYS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(60_000);
  });

  test('first retry is 2 seconds', () => {
    expect(MSG_RETRY_DELAYS[0]).toBe(2000);
  });

  test('marks as failed after max retries', () => {
    let attempt = 0;
    const tryDeliver = () => {
      if (attempt >= MSG_RETRY_DELAYS.length) return 'failed';
      attempt++;
      return 'retry';
    };
    for (let i = 0; i < MSG_RETRY_DELAYS.length; i++) tryDeliver();
    expect(tryDeliver()).toBe('failed');
  });
});

// ── File Transfer Protocol ─────────────────────────────────────────────────────

describe('File chunking', () => {
  test('calculates correct chunk count', () => {
    const cases = [
      { size: CHUNK_SIZE_BYTES, expected: 1 },
      { size: CHUNK_SIZE_BYTES + 1, expected: 2 },
      { size: CHUNK_SIZE_BYTES * 4, expected: 4 },
      { size: 1, expected: 1 },
    ];
    for (const { size, expected } of cases) {
      expect(Math.ceil(size / CHUNK_SIZE_BYTES)).toBe(expected);
    }
  });

  test('reassembles file correctly from ordered chunks', () => {
    const original = 'AAABBBCCC';
    const CHUNK = 3;
    const chunks = new Map();
    for (let i = 0; i < 3; i++) {
      chunks.set(i, original.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    const assembled = Array.from({ length: 3 }, (_, i) => chunks.get(i) ?? '').join('');
    expect(assembled).toBe(original);
  });

  test('detects missing chunk in assembly', () => {
    const chunks = new Map([[0, 'AAA'], [2, 'CCC']]); // missing index 1
    const assembled = Array.from({ length: 3 }, (_, i) => chunks.get(i) ?? '').join('');
    expect(assembled).toBe('AAA' + '' + 'CCC');
    expect(assembled).not.toBe('AAABBBCCC');
  });

  test('chunk CHUNK_SIZE is 48 KB', () => {
    expect(CHUNK_SIZE_BYTES).toBe(48 * 1024);
  });
});

describe('SHA-256 integrity check', () => {
  test('same data produces same hash', () => {
    const data = Buffer.from('Hello HexMesh test data');
    expect(sha256Hex(data)).toBe(sha256Hex(data));
  });

  test('different data produces different hash', () => {
    expect(sha256Hex(Buffer.from('file A'))).not.toBe(sha256Hex(Buffer.from('file B')));
  });

  test('single byte corruption is detected', () => {
    const original = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const corrupted = Buffer.from([1, 2, 3, 99, 5, 6, 7, 8]);
    expect(sha256Hex(original)).not.toBe(sha256Hex(corrupted));
  });

  test('hash is 64 hex characters (256 bits)', () => {
    const hash = sha256Hex(Buffer.from('test'));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ── Routing ────────────────────────────────────────────────────────────────────

describe('Distance-vector routing', () => {
  let dvTable;
  const processRouteAd = (from, routes, now = Date.now()) => {
    for (const { dest, hops } of routes) {
      const newHops = hops + 1;
      const existing = dvTable.get(dest);
      if (!existing || newHops < existing.hops) {
        dvTable.set(dest, { hops: newHops, via: from, ts: now });
      }
    }
  };

  beforeEach(() => { dvTable = new Map(); });

  test('learns direct neighbour route', () => {
    processRouteAd('nodeB', [{ dest: 'nodeC', hops: 1 }]);
    expect(dvTable.get('nodeC')).toMatchObject({ hops: 2, via: 'nodeB' });
  });

  test('prefers shorter path', () => {
    processRouteAd('nodeB', [{ dest: 'nodeD', hops: 3 }]);
    processRouteAd('nodeC', [{ dest: 'nodeD', hops: 1 }]);
    expect(dvTable.get('nodeD')).toMatchObject({ hops: 2, via: 'nodeC' });
  });

  test('does not replace with longer path', () => {
    processRouteAd('nodeC', [{ dest: 'nodeD', hops: 1 }]);
    processRouteAd('nodeB', [{ dest: 'nodeD', hops: 5 }]);
    expect(dvTable.get('nodeD')?.via).toBe('nodeC');
    expect(dvTable.get('nodeD')?.hops).toBe(2);
  });

  test('evicts stale routes', () => {
    const staleTs = Date.now() - ROUTE_STALE_MS - 1000;
    dvTable.set('nodeX', { hops: 2, via: 'nodeB', ts: staleTs });

    const now = Date.now();
    for (const [dest, row] of dvTable) {
      if (now - row.ts > ROUTE_STALE_MS) dvTable.delete(dest);
    }
    expect(dvTable.has('nodeX')).toBe(false);
  });

  test('keeps fresh routes', () => {
    dvTable.set('nodeX', { hops: 2, via: 'nodeB', ts: Date.now() });
    const now = Date.now();
    for (const [dest, row] of dvTable) {
      if (now - row.ts > ROUTE_STALE_MS) dvTable.delete(dest);
    }
    expect(dvTable.has('nodeX')).toBe(true);
  });
});

describe('Peer score calculation', () => {
  const calcScore = (latency, stable, relayCapable) => {
    const latScore = latency !== null ? Math.max(0, 100 - latency / 3) : 0;
    return Math.round(latScore * 0.4 + (stable ? 30 : 0) + (relayCapable ? 30 : 0));
  };

  test('low-latency stable relay peer scores highest', () => {
    const best = calcScore(10, true, true);
    const slowLatency = calcScore(300, true, true);
    const unstable = calcScore(10, false, true);
    const notRelay = calcScore(10, true, false);
    expect(best).toBeGreaterThan(slowLatency);
    expect(best).toBeGreaterThan(unstable);
    expect(best).toBeGreaterThan(notRelay);
  });

  test('unknown latency + unstable + no relay = 0', () => {
    expect(calcScore(null, false, false)).toBe(0);
  });

  test('score does not exceed 100', () => {
    expect(calcScore(0, true, true)).toBeLessThanOrEqual(100);
  });

  test('stable adds 30 points', () => {
    const withStable = calcScore(null, true, false);
    const withoutStable = calcScore(null, false, false);
    expect(withStable - withoutStable).toBe(30);
  });

  test('relayCapable adds 30 points', () => {
    const withRelay = calcScore(null, false, true);
    const withoutRelay = calcScore(null, false, false);
    expect(withRelay - withoutRelay).toBe(30);
  });
});

// ── Rate Limiting ──────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  const MAX_MSG_PER_SEC = 10;

  test('allows messages within rate limit', () => {
    const log = [];
    const now = Date.now();
    const isAllowed = () => {
      const window = log.filter(ts => now - ts < 1000);
      if (window.length >= MAX_MSG_PER_SEC) return false;
      log.push(now);
      return true;
    };
    for (let i = 0; i < MAX_MSG_PER_SEC; i++) {
      expect(isAllowed()).toBe(true);
    }
  });

  test('blocks messages exceeding rate limit', () => {
    const log = Array(MAX_MSG_PER_SEC).fill(Date.now());
    const isAllowed = () => {
      const window = log.filter(ts => Date.now() - ts < 1000);
      return window.length < MAX_MSG_PER_SEC;
    };
    expect(isAllowed()).toBe(false);
  });
});
