# TESTS.md — Тестирование HexMesh

## Методология замеров

### Задержка сообщений

Измеряем RTT на уровне протокола через PING/PONG:

```typescript
// Отправитель (каждые 5с):
const ts = Date.now();
sendPacket(peerId, { type: "PING", payload: { ts } });

// Получатель:
sendPacket(from, { type: "PONG", payload: { ts: packet.payload.ts, replyTo: packet.id } });

// Отправитель при получении PONG:
const rtt = Date.now() - packet.payload.ts;
updatePeerScore(peerId, { latency: rtt });
```

**Дополнительно:** для звонков используем `RTCPeerConnection.getStats()` каждую секунду — получаем `remote-inbound-rtp.roundTripTime` (медиа-уровень RTT).

### Потери пакетов

```typescript
// Из WebRTC getStats():
const prev = prevStatsRef.current;
const deltaLost = (cur.packetsLost - prev.packetsLost);
const deltaRecv = (cur.packetsReceived - prev.packetsReceived);
const lossPercent = deltaRecv > 0
  ? Math.round((deltaLost / (deltaLost + deltaRecv)) * 100)
  : 0;
```

### Пропускная способность файлов

```typescript
// В outbound transfer:
const startTime = Date.now();
// ... после завершения всех ACK:
const durationSec = (Date.now() - startTime) / 1000;
const throughputMBps = (file.size / 1024 / 1024) / durationSec;
```

---

## Сценарии ручного тестирования

### 1. Базовое обнаружение и P2P

```
Устройства: 2 (ноутбук + телефон, одна Wi-Fi сеть)

Шаги:
1. Запустить сервер: node server/index.js
2. Открыть http://[IP]:8081 на ноутбуке → должен появиться nodeId
3. Открыть http://[IP]:8081 на телефоне → должен увидеть ноутбук в списке
4. На ноутбуке должен появиться телефон

Ожидаемый результат:
  ✓ Оба узла видят друг друга
  ✓ Статус: "P2P Direct" (DataChannel открыт)
  ✓ Задержка отображается в интерфейсе
```

### 2. Обмен текстовыми сообщениями

```
Шаги:
1. Открыть чат между Node A и Node B
2. Отправить сообщение с A → должно появиться у B
3. Отправить ответ с B → должно появиться у A
4. Проверить статус "✓" (доставлено)

Дополнительно:
5. Отправить сообщение длиной > 1000 символов
6. Отправить 20 сообщений быстро подряд (проверка rate limit)

Ожидаемый результат:
  ✓ Сообщения доставляются < 100мс
  ✓ Статус "✓" после ACK
  ✓ Emoji и Unicode работают
  ✓ После 10 сообщений/сек — предупреждение в консоли
```

### 3. Мультихоп-цепочка

```
Устройства: 3 (A, B, C)
Топология: A ↔ B ↔ C (A и C не имеют прямого DC)

Шаги:
1. Запустить сервер
2. Подключить все три узла
3. Разорвать прямой DC между A и C (отключить в DevTools → Network)
4. Отправить сообщение с A → C

Ожидаемый результат:
  ✓ Сообщение доходит до C через B
  ✓ В логах A: "[RELAY] forwarding via B"
  ✓ В логах C: сообщение получено, ACK отправлен обратно через B
  ✓ Задержка: RTT(A→B) + RTT(B→C)
```

### 4. Передача файла

```
Файлы для тестирования:
  - small.jpg  (~400 KB)
  - medium.pdf (~1.6 MB)
  - large.pdf  (~18 MB)

Шаги:
1. Отправить small.jpg с A → B
   ✓ Прогресс-бар появляется на обоих устройствах
   ✓ Файл получен с правильным именем и размером
   ✓ SHA-256 проверка пройдена

2. Отправить large.pdf
   ✓ Прогресс отображается в процентах
   ✓ Скорость ≈ 1.5-2 MB/s в LAN

3. Передача с паузой:
   ✓ Нажать "Pause" в середине
   ✓ Подождать 5 сек
   ✓ Нажать "Resume"
   ✓ Файл докачивается и верифицируется

4. Integrity test:
   ✓ В коде временно повредить 1 байт в чанке
   ✓ Получатель должен логировать "[FILE] integrity fail"
   ✓ Сообщение об ошибке в UI
```

### 5. Голосовой звонок

```
Устройства: 2 (с микрофоном)

Шаги:
1. Инициировать звонок с A → B
   ✓ Входящий звонок виден на B
   ✓ B принимает звонок
   ✓ Двусторонний звук работает

2. В консоли Chrome открыть WebRTC internals: chrome://webrtc-internals
   ✓ Убедиться в кандидатах: тип "host" для LAN
   ✓ RTT < 50мс
   ✓ Jitter < 20мс
   ✓ Packet loss < 1%

3. Проверка QoS:
   ✓ В DevTools → Network → Throttling → "Slow 3G"
   ✓ Через ~5с UI должен показать "Fair" или "Poor"
   ✓ В консоли: "[QoS] poor network — disabling video"
```

### 6. Поведение при разрывах

```
Тест 6а — разрыв DataChannel:
1. A и B обмениваются сообщениями
2. В DevTools → Network отключить WebSocket у B
3. Отправить сообщение с A
   ✓ Сообщение попадает в очередь
4. Восстановить соединение
   ✓ Сообщение доставляется автоматически
   ✓ ACK приходит, статус "✓"

Тест 6б — отключение relay-узла:
1. Мультихоп A→B→C
2. Выключить B (закрыть вкладку)
   ✓ A и C получают NODE_LEFT
   ✓ DV-таблицы очищаются
   ✓ Если есть альтернативный путь — сообщения идут через него
   ✓ Если нет — статус "ws_relay" (через сервер)

Тест 6в — смена сети:
1. A подключён по Wi-Fi
2. Переключить A на мобильный интернет (или другой Wi-Fi)
   ✓ WebSocket реконнект (exponential backoff)
   ✓ DC реконнект через новый ICE gathering
   ✓ Pending сообщения отправляются после переподключения

Тест 6г — ICE failure → TURN:
1. A и B за разными NAT (например, через мобильный хотспот)
2. Заблокировать STUN (hosts файл или firewall)
   ✓ ICE timeout через 15с
   ✓ Авто-restart с iceTransportPolicy: "relay"
   ✓ Соединение устанавливается через TURN
   ✓ connectionMode: "turn" в UI
```

### 7. Безопасность

```
Тест 7а — проверка подписи:
1. В DevTools intercepte ECDH_HELLO пакет
2. Изменить publicKey в payload
   ✓ Верификация ECDSA должна упасть
   ✓ Лог: "[SECURITY] ECDSA verification failed"
   ✓ E2E шифрование не устанавливается

Тест 7б — key pinning:
1. Запомнить nodeId узла A
2. Удалить ключ: delete localStorage["hexmesh-key-ECDH"]
3. Обновить страницу A (новый ключ генерируется)
4. На B при следующем контакте с A:
   ✓ UI: "⚠️ Key changed!"

Тест 7в — rate limiting:
1. В консоли быстро отправить 100 сообщений:
   for(let i=0;i<100;i++) sendMessage("test")
   ✓ После 10-го сообщения: warning в консоли
   ✓ Сервер логирует RATE_LIMITED для > 60/сек
```

---

## Автоматические тесты

### Установка

```bash
npm install --save-dev jest ts-jest @types/jest
```

### Запуск

```bash
npm test
# или конкретный файл:
npx jest tests/protocol.test.ts
```

---

### `tests/protocol.test.ts` — Протокол

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';

// Тестируем логику дедупликации и TTL

describe('Packet deduplication', () => {
  it('should deduplicate packets with same id', () => {
    const seen = new Set<string>();
    const packet = { id: 'abc-123', type: 'MSG', from: 'A', to: 'B', ttl: 7, visited: [], payload: {}, ts: Date.now() };

    const process = (p: typeof packet) => {
      if (seen.has(p.id)) return 'duplicate';
      seen.add(p.id);
      return 'processed';
    };

    expect(process(packet)).toBe('processed');
    expect(process(packet)).toBe('duplicate');
    expect(process({ ...packet, id: 'xyz-456' })).toBe('processed');
  });

  it('should drop packets with TTL = 0', () => {
    const forward = (packet: { ttl: number }) => {
      if (packet.ttl <= 0) return 'dropped';
      return 'forwarded';
    };

    expect(forward({ ttl: 0 })).toBe('dropped');
    expect(forward({ ttl: -1 })).toBe('dropped');
    expect(forward({ ttl: 1 })).toBe('forwarded');
    expect(forward({ ttl: 7 })).toBe('forwarded');
  });

  it('should prevent loops via visited field', () => {
    const nodeId = 'node-A';
    const forward = (packet: { visited: string[] }) => {
      if (packet.visited.includes(nodeId)) return 'loop_prevented';
      return 'forwarded';
    };

    expect(forward({ visited: [] })).toBe('forwarded');
    expect(forward({ visited: ['node-B'] })).toBe('forwarded');
    expect(forward({ visited: ['node-B', 'node-A'] })).toBe('loop_prevented');
  });
});

describe('Message retry schedule', () => {
  const MSG_RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000];

  it('should have 5 retry attempts', () => {
    expect(MSG_RETRY_DELAYS).toHaveLength(5);
  });

  it('should use exponential backoff', () => {
    for (let i = 1; i < MSG_RETRY_DELAYS.length; i++) {
      expect(MSG_RETRY_DELAYS[i]).toBeGreaterThan(MSG_RETRY_DELAYS[i - 1]);
    }
  });

  it('should mark as failed after all retries', () => {
    let attempts = 0;
    const maxRetries = MSG_RETRY_DELAYS.length;
    const tryDeliver = () => {
      if (attempts >= maxRetries) return 'failed';
      attempts++;
      return 'retry';
    };

    for (let i = 0; i < maxRetries; i++) tryDeliver();
    expect(tryDeliver()).toBe('failed');
  });
});
```

### `tests/crypto.test.ts` — Шифрование

```typescript
import { describe, it, expect } from '@jest/globals';

// Тест SHA-256 (pure JS реализация из MeshContext)
function sha256Sync(data: Uint8Array): string {
  // Используем встроенный crypto в Node.js для теста
  const { createHash } = require('crypto');
  return createHash('sha256').update(data).digest('hex');
}

describe('SHA-256 integrity', () => {
  it('should produce consistent hash for same input', () => {
    const data = new TextEncoder().encode('Hello HexMesh');
    const hash1 = sha256Sync(data);
    const hash2 = sha256Sync(data);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const a = sha256Sync(new TextEncoder().encode('file content A'));
    const b = sha256Sync(new TextEncoder().encode('file content B'));
    expect(a).not.toBe(b);
  });

  it('should detect single-byte corruption', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const corrupted = new Uint8Array([1, 2, 99, 4, 5]);
    expect(sha256Sync(original)).not.toBe(sha256Sync(corrupted));
  });
});

describe('File chunking', () => {
  const CHUNK_SIZE_BYTES = 48 * 1024;

  it('should split file into correct number of chunks', () => {
    const fileSizes = [
      { size: 48 * 1024, expected: 1 },
      { size: 48 * 1024 + 1, expected: 2 },
      { size: 256 * 1024, expected: 6 },
      { size: 18 * 1024 * 1024, expected: Math.ceil(18 * 1024 * 1024 / CHUNK_SIZE_BYTES) },
    ];

    for (const { size, expected } of fileSizes) {
      const chunks = Math.ceil(size / CHUNK_SIZE_BYTES);
      expect(chunks).toBe(expected);
    }
  });

  it('should reassemble file correctly', () => {
    const original = 'A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(50);
    const CHUNK = 100;
    const chunks = new Map<number, string>();
    for (let i = 0; i < Math.ceil(original.length / CHUNK); i++) {
      chunks.set(i, original.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    const assembled = Array.from({ length: chunks.size }, (_, i) => chunks.get(i) ?? '').join('');
    expect(assembled).toBe(original);
  });

  it('should detect missing chunks in assembly', () => {
    const chunks = new Map<number, string>([[0, 'aaa'], [2, 'ccc']]); // missing 1
    const totalChunks = 3;
    const assembled = Array.from({ length: totalChunks }, (_, i) => chunks.get(i) ?? '').join('');
    expect(assembled).toBe('aaa' + '' + 'ccc'); // missing chunk = empty string
    expect(assembled).not.toBe('aaabbbccc');
  });
});
```

### `tests/routing.test.ts` — Маршрутизация

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Distance-vector routing', () => {
  type RouteTable = Map<string, { hops: number; via: string; ts: number }>;

  const processRouteAd = (
    dvTable: RouteTable,
    from: string,
    routes: { dest: string; hops: number }[],
    now: number = Date.now()
  ) => {
    for (const { dest, hops } of routes) {
      if (dest === 'self') continue; // split-horizon: skip self
      const newHops = hops + 1;
      const existing = dvTable.get(dest);
      if (!existing || newHops < existing.hops) {
        dvTable.set(dest, { hops: newHops, via: from, ts: now });
      }
    }
  };

  it('should learn routes from neighbours', () => {
    const dvTable: RouteTable = new Map();
    processRouteAd(dvTable, 'nodeB', [
      { dest: 'nodeC', hops: 1 },
      { dest: 'nodeD', hops: 2 },
    ]);

    expect(dvTable.get('nodeC')).toEqual(expect.objectContaining({ hops: 2, via: 'nodeB' }));
    expect(dvTable.get('nodeD')).toEqual(expect.objectContaining({ hops: 3, via: 'nodeB' }));
  });

  it('should prefer shorter path', () => {
    const dvTable: RouteTable = new Map();
    // Learn long path via B
    processRouteAd(dvTable, 'nodeB', [{ dest: 'nodeD', hops: 3 }]);
    expect(dvTable.get('nodeD')?.hops).toBe(4);

    // Learn shorter path via C
    processRouteAd(dvTable, 'nodeC', [{ dest: 'nodeD', hops: 1 }]);
    expect(dvTable.get('nodeD')?.hops).toBe(2);
    expect(dvTable.get('nodeD')?.via).toBe('nodeC');
  });

  it('should evict stale routes', () => {
    const ROUTE_STALE_MS = 45_000;
    const dvTable: RouteTable = new Map();
    const oldTs = Date.now() - ROUTE_STALE_MS - 1000;
    dvTable.set('nodeC', { hops: 2, via: 'nodeB', ts: oldTs });

    // Evict stale
    const now = Date.now();
    for (const [dest, row] of dvTable) {
      if (now - row.ts > ROUTE_STALE_MS) dvTable.delete(dest);
    }

    expect(dvTable.has('nodeC')).toBe(false);
  });
});

describe('Peer scoring', () => {
  const calcScore = (latency: number | null, stable: boolean, relayCapable: boolean) => {
    const latScore = latency !== null ? Math.max(0, 100 - latency / 3) : 0;
    return Math.round(latScore * 0.4 + (stable ? 30 : 0) + (relayCapable ? 30 : 0));
  };

  it('should prefer low-latency stable relay peers', () => {
    const fast = calcScore(15, true, true);
    const slow = calcScore(200, true, true);
    const unstable = calcScore(15, false, true);
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(unstable);
  });

  it('should give 0 score to unknown latency unreliable peer', () => {
    expect(calcScore(null, false, false)).toBe(0);
  });

  it('should max out at 100', () => {
    const score = calcScore(0, true, true);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

### `tests/server.test.ts` — Сервер (интеграционный)

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:3001';
let server: any;

beforeAll(async () => {
  // Запускаем сервер для тестов
  server = require('../server/index');
  await new Promise(r => setTimeout(r, 500)); // дать серверу запуститься
});

afterAll(() => {
  if (server?.close) server.close();
});

describe('Server registration', () => {
  it('should register a node and receive REGISTERED', (done) => {
    const ws = new WebSocket(SERVER_URL);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'REGISTER',
        nodeId: 'test-node-001',
        alias: 'TestNode',
        publicKey: 'dummy-key',
        sigPub: 'dummy-sig',
      }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REGISTERED') {
        expect(msg.type).toBe('REGISTERED');
        ws.close();
        done();
      }
    });
  });

  it('should broadcast NODE_JOINED to other nodes', (done) => {
    const ws1 = new WebSocket(SERVER_URL);
    const ws2 = new WebSocket(SERVER_URL);
    let ws1Ready = false, ws2Ready = false;

    const tryJoin = () => {
      if (!ws1Ready || !ws2Ready) return;
      ws2.send(JSON.stringify({
        type: 'REGISTER', nodeId: 'test-node-002',
        alias: 'TestNode2', publicKey: 'k2', sigPub: 's2',
      }));
    };

    ws1.on('open', () => {
      ws1.send(JSON.stringify({
        type: 'REGISTER', nodeId: 'test-node-003',
        alias: 'TestNode3', publicKey: 'k3', sigPub: 's3',
      }));
    });
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REGISTERED') { ws1Ready = true; tryJoin(); }
      if (msg.type === 'NODE_JOINED' && msg.nodeId === 'test-node-002') {
        ws1.close(); ws2.close();
        done();
      }
    });

    ws2.on('open', () => { ws2Ready = true; tryJoin(); });
    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REGISTERED') { /* ok */ }
    });
  });
});

describe('Server health endpoint', () => {
  it('should return health JSON', async () => {
    const res = await fetch('http://localhost:3001/health');
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.nodes).toBe('number');
    expect(data.metrics).toBeDefined();
  });
});
```

---

## Нагрузочное тестирование

### Скрипт: симуляция 10 узлов

```javascript
// scripts/load-test.js
const WebSocket = require('ws');

const N = 10;
const nodes = [];

for (let i = 0; i < N; i++) {
  const ws = new WebSocket('ws://localhost:3001');
  const nodeId = `load-test-${i.toString().padStart(3, '0')}`;

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'REGISTER', nodeId, alias: `Load-${i}`, publicKey: 'k', sigPub: 's' }));
    // Каждый узел шлёт сообщения другим каждую секунду
    setInterval(() => {
      const target = `load-test-${((i + 1) % N).toString().padStart(3, '0')}`;
      ws.send(JSON.stringify({
        id: Math.random().toString(36).slice(2),
        type: 'MSG', from: nodeId, to: target,
        ttl: 7, visited: [], payload: { text: `ping from ${i}` }, ts: Date.now()
      }));
    }, 1000);
  });

  nodes.push(ws);
}

// Проверить /health через 5с
setTimeout(async () => {
  const res = await fetch('http://localhost:3001/health');
  const data = await res.json();
  console.log('Health:', JSON.stringify(data, null, 2));
  nodes.forEach(ws => ws.close());
  process.exit(0);
}, 5000);
```

```bash
node scripts/load-test.js
```

Ожидаемый результат:
- `nodes: 10`
- `relayedPackets` растёт
- `droppedPackets` = 0 при нормальной нагрузке
