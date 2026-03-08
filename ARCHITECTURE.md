# ARCHITECTURE.md — Архитектура HexMesh

## Обзор системы

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MeshLinkMesh Network                         │
│                                                                     │
│  ┌──────────┐     DataChannel (P2P)      ┌──────────┐               │
│  │  Node A  │◄──────────────────────────▶│  Node B │               │
│  │ (laptop) │                            │ (phone)  │               │
│  └────┬─────┘                            └────┬─────┘               │
│       │  WebSocket (signaling+relay)          │                     │
│       │         ┌──────────────┐              │                     │
│       └────────▶│ MeshLink      │◄─────────────┘                    │
│                 │ Server       │                                    │
│                 └──────┬───────┘                                    │
│                        │ DataChannel (mesh relay)                   │
│                  ┌─────▼─────┐                                      │
│                  │  Node C   │                                      │
│                  │ (tablet)  │◄────── Node D (phone, no direct P2P) │
│                  └───────────┘                                      │
│                                                                     │
│  Приоритет доставки пакета:                                         │
│  1 → Прямой DataChannel (P2P)                                       │
│  2 → Distance-vector следующий хоп                                  │
│  3 → Flood по mesh                                                  │
│  4 → Best relay (по score)                                          │
│  5 → WS fallback через сервер                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Компоненты

### MeshLink Server (`server/index.js`)

Лёгкий Node.js WebSocket сервер. Выполняет три функции:

1. **Регистрация узлов** — принимает `REGISTER`, рассылает `NODE_JOINED` всем
2. **Relay** — пересылает пакеты когда прямой P2P недоступен
3. **Федерация** — несколько серверов в сети обнаруживают друг друга через UDP multicast `224.0.0.251:5354` и синхронизируют списки узлов

```
Конфиги сервера:
  PORT=3001            WebSocket (HTTP)
  HTTPS_PORT=3002      WebSocket + TLS
  MAX_PACKET_SIZE=50MB
  MSG_RATE_MAX=60/сек
  FILE_RATE_MAX=600/сек
  HEARTBEAT_INTERVAL=15с
  NODE_TIMEOUT=45с
```

### MeshContext (`src/MeshContext.tsx`)

Главный React Context, содержащий весь mesh-стек. Подсистемы:

| Подсистема | Ответственность |
|---|---|
| **WebSocket layer** | Подключение к серверу, авто-реконнект |
| **WebRTC / DataChannel** | P2P соединения, DC lifecycle |
| **Routing engine** | DV-таблица, flood, relay selection |
| **Message queue** | Retry, ACK, exponential backoff |
| **File transfer** | Chunking, SHA-256, pause/resume, meta retry |
| **Call engine** | WebRTC PeerConnection, Opus FEC, QoS stats |
| **Crypto layer** | ECDH, AES-GCM, ECDSA sign/verify, key pinning |
| **Group chat** | Broadcast MSG с `groupMsg: true` ко всем узлам |

---

## Жизненный цикл узла

```
Старт
  │
  ├─ Генерация ECDH keypair (P-256) → publicKey
  ├─ Генерация ECDSA keypair (P-256) → sigPub
  │
  ├─ WebSocket connect → REGISTER {nodeId, alias, publicKey, sigPub}
  │
  ├─ Получить NODE_LIST
  │     └─ для каждого известного пира:
  │           ├─ DC_OFFER (WebRTC DataChannel handshake через WS)
  │           └─ ECDH_HELLO (обмен ключами для E2E)
  │
  ├─ NODE_JOINED (новый пир появился)
  │     └─ то же: DC_OFFER + ECDH_HELLO
  │
  ├─ DataChannel open
  │     ├─ PEER_HELLO (обмен списками известных пиров — peer exchange)
  │     └─ PING loop каждые 5с → RTT measurement → peerScore update
  │
  │   [активная фаза]
  │     ├─ ROUTE_AD каждые 15с → distance-vector таблица
  │     ├─ стабильность: если нет PONG >12с → пир помечается unstable
  │     └─ DC close → авто-реконнект через 2с
  │
  └─ NODE_LEFT / WS close
        ├─ удалить из routing table
        ├─ удалить из peerScores
        └─ перенаправить очередь сообщений через другие пути
```

---

## Routing

### Distance-Vector

Каждый узел поддерживает таблицу `dvTable: Map<destId, {hops, via, ts}>`.

```
Узел A знает:
  B → {hops: 1, via: B}   (прямой сосед)
  C → {hops: 2, via: B}   (через B)
  D → {hops: 3, via: B}   (через B, который знает C)
```

`ROUTE_AD` рассылается каждые 15 сек. Split-horizon: не анонсировать маршрут обратно тому, от кого он узнан.

### Peer Score

При выборе relay-узла используется `peerScore`:

```
score = latency_score * 0.4 + stable * 30 + relayCapable * 30

latency_score = max(0, 100 - rttMs / 3)
```

Выбирается пир с наивысшим `score` среди `relayCapable && stable`.

### Flood

Если маршрут неизвестен — пакет рассылается по всем открытым DataChannel кроме тех, кто уже в `visited[]`. TTL декрементируется на каждом хопе. При TTL=0 пакет дропается.

### QoS Priority

```typescript
QOS_PRIORITY = { VOICE: 1, TEXT: 2, SIGNALING: 3, FILE: 4 }
```

Пакеты с низким приоритетом (FILE) пропускаются в последнюю очередь при backpressure.

---

## DataChannel Flow

```
Node A                          Node B
  │                               │
  │── DC_OFFER (via WebSocket) ──▶│
  │◀─ DC_ANSWER ──────────────────│
  │── DC_ICE ────────────────────▶│  (кандидаты)
  │◀─ DC_ICE ─────────────────────│
  │                               │
  │  [ICE gathering + connectivity checks]
  │  [если не подключились за 15с → TURN-only restart]
  │                               │
  │═══════ DataChannel OPEN ══════│
  │                               │
  │── PEER_HELLO ────────────────▶│  (обмен списками пиров)
  │── PING ─────────────────────▶│
  │◀─ PONG ───────────────────────│
```

Backpressure: если `dc.bufferedAmount > 256 KB` — `_dcSend()` возвращает `false`, пакет дропается. Relay при конгестии: `RELAY_RATE_LIMIT_BPS = 512 KB/s` на пир, `RELAY_TOTAL_LIMIT_BPS = 2 MB/s` суммарно.

---

## Передача файлов

```
Sender                                  Receiver
  │                                         │
  │── FILE_META ──────────────────────────▶│  t=0
  │── FILE_META ──────────────────────────▶│  t=500ms (retry)
  │── FILE_META ──────────────────────────▶│  t=2000ms (retry)
  │                                         │
  │── CHUNK[0] ──────────────────────────▶│
  │◀─ ACK[0] ──────────────────────────────│
  │── CHUNK[1] ──────────────────────────▶│
  │── CHUNK[2] ──────────────────────────▶│  (параллельно, max 4)
  │── CHUNK[3] ──────────────────────────▶│
  │◀─ ACK[1] ──────────────────────────────│
  │◀─ ACK[2] ──────────────────────────────│
  │── CHUNK[4] ──────────────────────────▶│
  │  [если нет ACK через 4с]               │
  │── CHUNK[X] retry #1 ─────────────────▶│  (exponential: 4с, 6с, 9с...)
  │                                         │
  │── CHUNK[N-1] ────────────────────────▶│
  │── FILE_META ──────────────────────────▶│  финальный повтор
  │                                         │
  │                                   SHA-256 verify
  │                                         │
  │  [если FILE_META потерян до сборки]     │
  │◀─ FILE_META_REQ ───────────────────────│
  │── FILE_META ──────────────────────────▶│
  │                                    finalize → msg
```

**Параметры:**

| Параметр | Значение |
|---|---|
| `CHUNK_SIZE_BYTES` | 48 KB |
| `MAX_PARALLEL_CHUNKS` | 4 |
| `CHUNK_RETRY_MS` | 4000 × 1.5^attempt |
| `MAX_CHUNK_RETRIES` | 8 |
| `BW_LIMIT` (default) | 2 MB/s |
| `BW_LIMIT` (low mode) | 100 KB/s |
| `DC_BACKPRESSURE` | 256 KB |

**Персистентность:** на iOS/Android чанки сохраняются в файловую систему (`expo-file-system`). На Web — только в памяти (localStorage лимит 5 MB непригоден для больших файлов).

---

## Звонки

```
Caller                              Callee
  │── CALL_OFFER (signed) ─────────▶│
  │◀─ CALL_ANSWER (signed) ──────────│
  │── CALL_ICE ─────────────────────▶│
  │◀─ CALL_ICE ──────────────────────│
  │                                   │
  │═══════ Media stream OPEN ═════════│
  │                                   │
  │  [каждую секунду: getStats()]     │
  │  RTT, jitter, loss → quality     │
  │  quality=poor → снизить битрейт   │
  │  quality=poor + video → отключить видео
```

**SDP патчинг:**
- `useinbandfec=1` — in-band FEC для Opus
- `usedtx=1` — DTX (тишина не передаётся)
- `jitterBufferTarget = 100ms`

**Адаптивный битрейт:**

| Качество | Порог | Макс. битрейт видео |
|---|---|---|
| good | RTT < 150мс, loss < 1%, jitter < 20мс | 800 Kbps |
| fair | RTT < 300мс, loss < 5% | 400 Kbps |
| poor | иначе | 150 Kbps + отключить видео |

---

## Безопасность

### Crypto Layer

```
Идентификация узла:
  ECDSA P-256 keypair — генерируется при старте, хранится в localStorage (JWK)
  sigPub анонсируется в REGISTER и PEER_HELLO
  Подписываются: ECDH_HELLO, CALL_OFFER, CALL_ANSWER, CALL_END, CALL_REJECT

E2E шифрование (Web — SubtleCrypto):
  ECDH P-256 ephemeral keypair per session
  Shared secret → AES-GCM-256 key
  Каждое сообщение: random 12-byte IV + AES-GCM ciphertext

E2E шифрование (Native — Hermes без SubtleCrypto):
  AES-128-CTR + HMAC-SHA256 (pure JS реализация)

Файловые чанки:
  Шифруются тем же AES-GCM ключом сессии

Key pinning:
  fingerprint = первые 32 символа hex(SHA-256(publicKey))
  Сохраняется в localStorage при первом контакте
  Если ключ изменился → UI: "⚠️ Key changed!"
```

### Rate Limiting

```
Клиент → сервер:
  MSG:           max 60 пакетов/сек (window 1с)
  FILE_CHUNK:    max 600 пакетов/сек (window 1с)
  Пакет > 50MB:  reject

Клиент (отправка):
  Текст: max 10 сообщений/сек
  Текст: max 64 KB на сообщение

Relay конгестия:
  per-peer: max 512 KB/s relay traffic
  total:    max 2 MB/s relay load
```

---

## Поведение при отказах

| Отказ | Поведение |
|---|---|
| DataChannel закрылся | Авто-реконнект через 2с, очередь сообщений перенаправляется |
| WebSocket закрылся | Авто-реконнект с exponential backoff, повтор всех pending сообщений |
| ICE не установился за 15с | Restart с TURN-only |
| Relay-узел ушёл | DV-таблица очищается, следующий лучший путь |
| FILE_META потерян | Receiver запрашивает `FILE_META_REQ`, sender отвечает |
| Чанк потерян | Retry через 4с × 1.5^attempt, max 8 попыток |
| SHA-256 fail | `FILE_INTEGRITY_FAIL`, передача прерывается |
| Peer не отвечает 12с | Помечается unstable, не используется как relay |
| Peer ушёл с сервера | `NODE_LEFT` → удаление из всех таблиц |
