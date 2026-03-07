# PROTOCOL.md — Спецификация протокола HexMesh

## Базовый формат пакета

Все пакеты передаются как JSON-строки через WebSocket или WebRTC DataChannel.

```typescript
interface Packet {
  id:       string;    // UUIDv4 — дедупликация + ACK reference
  type:     string;    // тип пакета (см. ниже)
  from:     string;    // nodeId отправителя
  to?:      string;    // nodeId получателя (отсутствует у broadcast)
  ttl:      number;    // Time-To-Live, max 7, декремент на каждом хопе
  visited:  string[];  // пройденные nodeId — защита от петель
  payload:  unknown;   // данные (зависит от типа)
  sig?:     string;    // ECDSA P-256 base64 подпись (только контрол-пакеты)
  priority?: number;   // QoS: 1=VOICE, 2=TEXT, 3=SIGNALING, 4=FILE
  ts:       number;    // Unix timestamp мс
}
```

---

## Типы пакетов

### Управление сессией

| Тип | Направление | Payload | Описание |
|---|---|---|---|
| `REGISTER` | Client→Server | `{nodeId, alias, publicKey, sigPub}` | Регистрация в сети |
| `GET_NODES` | Client→Server | — | Запрос списка узлов |
| `REGISTERED` | Server→Client | — | Подтверждение регистрации |
| `NODE_LIST` | Server→Client | `{nodes: NodeInfo[]}` | Текущий список узлов |
| `NODE_JOINED` | Server→All | `{nodeId, alias, publicKey, sigPub}` | Новый узел |
| `NODE_LEFT` | Server→All | `{nodeId}` | Узел отключился |
| `ERROR` | Server→Client | `{code}` | Ошибка (RATE_LIMITED, NODE_ID_TAKEN, ...) |

### P2P сигналинг (WebRTC DataChannel)

| Тип | Payload | Описание |
|---|---|---|
| `DC_OFFER` | `{sdp}` | WebRTC offer для DataChannel |
| `DC_ANSWER` | `{sdp}` | WebRTC answer |
| `DC_ICE` | `{candidate}` | ICE кандидат |

Эти пакеты передаются через WS-сервер как relay до установки DataChannel.

### Обнаружение и маршрутизация

| Тип | Payload | Описание |
|---|---|---|
| `PEER_HELLO` | `{peers: NodeInfo[], alias, sigPub}` | Обмен известными пирами при открытии DC |
| `ROUTE_AD` | `{routes: RouteEntry[]}` | Реклама маршрутов (DV) каждые 15с |
| `PING` | `{ts}` | Heartbeat, измерение RTT |
| `PONG` | `{ts, replyTo}` | Ответ на PING |

```typescript
interface RouteEntry {
  dest: string;   // nodeId назначения
  hops: number;   // количество хопов
}
```

### Сообщения

| Тип | Payload | Описание |
|---|---|---|
| `MSG` | `{text, groupMsg?, encrypted?}` | Текстовое сообщение |
| `ACK` | `{msgId}` | Подтверждение доставки |
| `TYPING` | — | Индикатор печати |

Если `encrypted=true` — `text` содержит AES-GCM base64 ciphertext. Если `groupMsg=true` — принимается как групповое сообщение.

**Retry schedule (отправитель):**
```
[0мс] → отправить
[2000мс] → retry #1 (если нет ACK)
[4000мс] → retry #2
[8000мс] → retry #3
[16000мс] → retry #4
[32000мс] → retry #5 → статус "failed"
+ ±20% jitter на каждом интервале
```

### Передача файлов

| Тип | Payload | Описание |
|---|---|---|
| `FILE_META` | `{transferId, name, size, mimeType, totalChunks, sha256}` | Метаданные файла |
| `FILE_CHUNK` | `{transferId, index, data, totalChunks, encrypted}` | Чанк файла (base64) |
| `FILE_ACK` | `{transferId, index}` | Подтверждение чанка |
| `FILE_META_REQ` | `{transferId}` | Запрос повторной отправки FILE_META |
| `FILE_INTEGRITY_FAIL` | `{transferId}` | SHA-256 проверка не прошла |

`FILE_META` отправляется 3 раза: при старте (t=0), через 500мс, через 2000мс и ещё раз после последнего чанка.

### Звонки (WebRTC Media)

| Тип | Payload | Подпись | Описание |
|---|---|---|---|
| `CALL_OFFER` | `{sdp, video}` | ✓ ECDSA | WebRTC offer для звонка |
| `CALL_ANSWER` | `{sdp}` | ✓ ECDSA | WebRTC answer |
| `CALL_ICE` | `{candidate}` | — | ICE кандидат |
| `CALL_END` | — | ✓ ECDSA | Завершение звонка |
| `CALL_REJECT` | — | ✓ ECDSA | Отклонение звонка |

### E2E ключ обмен

| Тип | Payload | Подпись | Описание |
|---|---|---|---|
| `ECDH_HELLO` | `{publicKey}` | ✓ ECDSA | Публичный ECDH P-256 ключ |

---

## Маршрутизация пакетов

### Алгоритм `sendPacket(destId, packet)`

```
1. Пакет помечается: visited += [nodeId], ttl -= 1
   Если ttl ≤ 0 → drop

2. Прямой DataChannel к destId?
   → отправить, выйти

3. dvTable.get(destId) → via?
   → отправить через dc[via], выйти

4. Flood: отправить через все open DC кроме visited[]

5. Best relay (peerScore max, relayCapable && stable)?
   → отправить через него

6. WS fallback → отправить через сервер
```

### Дедупликация

Каждый узел хранит `Set<string> seenMessages`. При получении пакета:
- Если `id` в `seenMessages` → drop (дубликат)
- Иначе → добавить `id` в `seenMessages`, обработать

Пакеты предназначенные другому узлу (`packet.to !== nodeId`) и с `type` в `ROUTABLE_TYPES` → пересылаются, не обрабатываются.

### ROUTABLE_TYPES

```
MSG, ACK, FILE_META, FILE_CHUNK, FILE_ACK, FILE_META_REQ,
FILE_INTEGRITY_FAIL, CALL_OFFER, CALL_ANSWER, CALL_ICE,
CALL_END, CALL_REJECT, ECDH_HELLO, ROUTE_AD, PEER_HELLO
```

---

## Структуры данных

```typescript
interface NodeInfo {
  nodeId:    string;
  alias:     string;
  publicKey: string;   // ECDH P-256 public (SPKI base64)
  sigPub?:   string;   // ECDSA P-256 public (SPKI base64)
}

interface PeerScore {
  nodeId:       string;
  latency:      number | null;   // последний RTT мс
  uptime:       number;          // мс онлайн
  relayCapable: boolean;         // объявил себя relay
  stable:       boolean;         // false если нет PONG >12с
  lastPong:     number;          // timestamp последнего PONG
  score:        number;          // 0-100
}

interface OutboundTransfer {
  transferId:   string;
  to:           string;
  totalChunks:  number;
  sha256:       string;
  meta:         { name: string; size: number; mimeType: string };
  pendingAcks:  Set<number>;
  retryTimers:  Map<number, NodeJS.Timeout>;
  paused:       boolean;
  done:         boolean;
  getChunk:     (i: number) => string;   // base64 slice
  msgId:        string;
}

interface InboundTransfer {
  transferId:    string;
  from:          string;
  name:          string;
  size:          number;
  mimeType:      string;
  totalChunks:   number;
  sha256:        string;
  receivedChunks: Map<number, string>;
  assembledData?: string;   // если чанки пришли до FILE_META
}
```

---

## Серверные коды ошибок

| Код | Причина |
|---|---|
| `NODE_ID_TAKEN` | nodeId уже зарегистрирован другим WS |
| `MISSING_FIELDS` | REGISTER без nodeId или alias |
| `RATE_LIMITED` | > 60 MSG/сек от узла |
| `FILE_RATE_LIMITED` | > 600 FILE-пакетов/сек от узла |
| `PACKET_TOO_LARGE` | пакет > 50 MB |

---

## Федерация серверов (mDNS)

Серверы в одной LAN обнаруживают друг друга через UDP multicast:

```
Group: 224.0.0.251
Port:  5354
Announce interval: 5с
Peer timeout: 30с
```

Payload объявления: `{"service":"hexmesh-signal-v1","port":3001,"httpsPort":3002}`

После обнаружения серверы соединяются по WebSocket и обмениваются:

| Тип | Описание |
|---|---|
| `FED_NODE_LIST` | Синхронизация полного списка узлов |
| `FED_NODE_JOINED` | Новый узел на удалённом сервере |
| `FED_NODE_LEFT` | Узел ушёл с удалённого сервера |
| `FED_RELAY` | Relay пакета через федерацию |
