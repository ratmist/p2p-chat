# MeshLink — Децентрализованная система связи

> Текстовые сообщения · Передача файлов · Голос/видео · Работает без интернета

[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android-blue)](#)
[![E2E](https://img.shields.io/badge/E2E-ECDH%20P--256%20%2B%20AES--GCM--256-green)](#)
[![Transport](https://img.shields.io/badge/transport-WebRTC%20DataChannel-cyan)](#)

---

## Что это

MeshLink — P2P mesh-сеть для обмена сообщениями, файлами и звонками в локальной Wi-Fi сети. Работает **без интернета** и **без облаков**: единственный компонент инфраструктуры — лёгкий WebSocket-сервер для первоначального обнаружения узлов, который запускается прямо на устройстве в сети.

После обнаружения все данные передаются напрямую между устройствами по WebRTC DataChannel. Если прямой P2P невозможен — используется мультихоп через другие узлы сети.

---

## Быстрый старт

### Требования

- Node.js ≥ 18
- Все устройства в одной Wi-Fi сети

### 1. Запустить сервер

```bash
cd server
node index.js
```

Сервер поднимается на двух портах:
- `ws://0.0.0.0:3001` — WebSocket (HTTP)
- `wss://0.0.0.0:3002` — WebSocket + TLS (нужен для микрофона/камеры в Safari)

### 2. Открыть клиент

```bash
npm install
npx expo start --web
```

На любом устройстве в сети открыть в браузере:
```
http://192.168.x.x:8081        # разработка
https://192.168.x.x:3002       # для микрофона на iOS Safari
```


> **Safari / iOS:** микрофон и камера требуют HTTPS. Используйте порт 3002 с сертификатом из `server/.certs/`.

---

## Структура проекта

```
server/
  index.js                     # Signaling + relay сервер (Node.js + ws)
  .certs/                      # TLS сертификаты для HTTPS/WSS

src/
  MeshContext.tsx               # Весь mesh-стек: WebRTC, routing, crypto, файлы, звонки
  lib/
    crypto.ts                  # ECDH, Ed25519, AES-GCM примитивы
    MeshClient.ts              # Низкоуровневый клиент
    INTEGRATION.ts             # Гайд по подключению к UI
  components/
    ChatScreen.web.tsx          # Чат
    CallScreen.web.tsx          # Звонки
    DeviceDiscoveryScreen.web.tsx
    FileTransferScreen.web.tsx
    GroupChatScreen.web.tsx
    SettingsScreen.web.tsx
  hooks/
    useMesh.ts                 # React hooks для подключения к mesh
```

---

## Ключевые характеристики

| Параметр | Значение |
|---|---|
| Задержка P2P (LAN) | 5–30 мс |
| Задержка через relay | 30–80 мс |
| Макс. TTL (хопы) | 7 |
| Размер чанка файла | 48 KB |
| Параллельных чанков | 4 |
| Макс. размер файла | 256 MB |
| Пропускная способность файлов | до 2 MB/s |
| Шифрование | AES-GCM-256 (E2E) |
| Подпись пакетов | ECDSA P-256 + SHA-256 |
| Аудиокодек | Opus + in-band FEC |
| ICE timeout | 15 сек (с TURN fallback) |

---

## Обнаружение узлов

Используется двухуровневый механизм:

1. **WebSocket регистрация** — клиент подключается к известному IP сервера, отправляет `REGISTER`, получает `NODE_LIST`. Подходит для случаев когда адрес сервера известен.

2. **mDNS UDP multicast** — сервер рассылает объявления на `224.0.0.251:5354`. Несколько серверов в одной сети автоматически формируют федерацию и обмениваются списками узлов.

После получения `NODE_LIST` каждый клиент сразу инициирует WebRTC DataChannel (`DC_OFFER`) со всеми известными узлами — формируется полносвязная mesh.

---

## P2P соединение

Используется WebRTC DataChannel с ordered/reliable доставкой. Конфигурация ICE:

```
STUN: stun.l.google.com:19302, stun1.l.google.com:19302, stun.cloudflare.com:3478
TURN: openrelay.metered.ca (UDP/TCP/TLS), a.relay.metered.ca (UDP/TCP/TLS)
```

`bundlePolicy: "max-bundle"` — объединяет DataChannel и медиа-треки в один ICE компонент. Критично для iOS Safari, где раздельные ICE компоненты могут зависать.

При `ICE_TIMEOUT = 15 сек` без установки соединения — автоматический рестарт с `iceTransportPolicy: "relay"` (только TURN).

---

## Маршрутизация

Приоритет при отправке пакета:

1. **Прямой DataChannel** — если открыт
2. **Distance-vector таблица** — известный следующий хоп через `dvTable`
3. **Flood через mesh** — рассылка по всем открытым DC кроме `visited[]`
4. **Best relay** — пир с наивысшим `score` и `relayCapable=true`
5. **WS-сервер** — fallback

Маршрутные объявления (`ROUTE_AD`) рассылаются каждые 15 сек, устаревают через 45 сек. Используется split-horizon для предотвращения петель. Поля `ttl` и `visited[]` в каждом пакете ограничивают глубину распространения.

---

## Безопасность

| Механизм | Реализация |
|---|---|
| E2E шифрование | ECDH P-256 → AES-GCM-256, уникальный IV на каждое сообщение |
| Подпись пакетов | ECDSA P-256 + SHA-256 для CALL_OFFER/ANSWER/END/ECDH_HELLO |
| Key pinning | Отпечаток публичного ключа сохраняется при первом контакте |
| Предупреждение | Если ключ пира изменился — UI показывает «⚠️ Key changed!» |
| Rate limiting | 10 сообщений/сек от узла, 60/сек на сервере, 600 file-пакетов/сек |
| Anti-spam | Дедупликация по `packet.id`, TTL, `visited[]` |
| Транспорт | TLS (WSS) между клиентом и сервером |

---

## Мониторинг

**Сервер `GET /health`:**

```json
{
  "status": "ok",
  "nodes": 4,
  "uptime": 3600,
  "metrics": {
    "totalConnections": 28,
    "relayedPackets": 12500,
    "droppedPackets": 3,
    "messagesRouted": 4200
  }
}
```

**Сервер `GET /nodes`** — список активных узлов.

**Клиент:** в консоли браузера доступны логи с префиксами `[ICE]`, `[RELAY]`, `[SECURITY]`, `[QoS]`, `[SIZE]`, `[FILE]`.

---

## Документация

- [ARCHITECTURE.md](./ARCHITECTURE.md) — подробная архитектурная схема и описание всех подсистем
- [PROTOCOL.md](./PROTOCOL.md) — спецификация пакетного протокола
- [SECURITY.md](./SECURITY.md) — модель угроз и реализация защиты
- [COMPARISON.md](./COMPARISON.md) — сравнение с аналогами (Signal, Briar, Meshtastic, WebRTC-реализации)
- [TESTS.md](./TESTS.md) — методология тестирования, сценарии отказов, замеры
