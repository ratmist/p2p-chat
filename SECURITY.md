# SECURITY.md — Безопасность MeshLink

## Модель угроз

### От чего защищаемся

| Угроза | Вектор | Защита |
|---|---|---|
| Пассивный перехват трафика | Снифер в Wi-Fi сети | TLS (WSS) + E2E AES-GCM-256 |
| MITM (подмена сообщений) | Атакующий в сети подменяет пакеты | ECDSA P-256 подпись контрол-пакетов |
| Impersonation (кража идентичности) | Атакующий выдаёт себя за другой узел | Key pinning + предупреждение при смене ключа |
| Replay-атака | Повтор перехваченных пакетов | Уникальный UUID `packet.id` + дедупликация |
| Петли маршрутизации | Некорректный relay | `visited[]` + TTL ≤ 7 |
| Flood / DoS | Спам пакетами | Rate limiting на клиенте и сервере |
| Подмена FILE_META | Изменить имя/размер файла в transit | SHA-256 контроль целостности файла |
| Перегрузка relay-узла | Массовая отправка файлов через один узел | Relay backpressure + rate limiting |

### От чего не защищаемся (out of scope)

- **Физический доступ к устройству** — ключи в localStorage не защищены от локального злоумышленника
- **Traffic analysis** — размер и время пакетов не скрываются
- **Квантовые атаки** — P-256 уязвим к квантовым компьютерам

---

## Реализация

### E2E шифрование сообщений

**Web (SubtleCrypto API):**

```
1. При первом контакте: обмен ECDH_HELLO
   - Каждый узел генерирует ephemeral ECDH P-256 keypair
   - Публичный ключ отправляется в ECDH_HELLO (подписан ECDSA)
   - Обе стороны вычисляют shared secret через ECDH

2. Из shared secret:
   AES-GCM-256 key = ECDH.deriveKey(P-256, {name: "AES-GCM", length: 256})

3. Шифрование сообщения:
   IV = random 12 bytes
   ciphertext = AES-GCM-256.encrypt(IV, plaintext, key)
   payload = base64(IV || ciphertext)

4. Дешифрование:
   IV = payload[:12]
   plaintext = AES-GCM-256.decrypt(IV, payload[12:], key)
```

**Native (Hermes JS engine — нет SubtleCrypto):**

```
AES-128-CTR + HMAC-SHA256 (pure JS)
keyMaterial → sha256(keyMaterial + ":enc") → encKey
keyMaterial → sha256(keyMaterial + ":mac") → macKey
Encrypt: AES-128-CTR(encKey, plaintext)
MAC: HMAC-SHA256(macKey, ciphertext)
```

### Подпись пакетов

Подписываются: `ECDH_HELLO`, `CALL_OFFER`, `CALL_ANSWER`, `CALL_END`, `CALL_REJECT`

```
1. Генерация ECDSA P-256 keypair при старте
   Хранится в localStorage как JWK

2. Подпись:
   data = JSON.stringify(packet без sig)
   sig = ECDSA-P256-SHA256.sign(privateKey, data)
   packet.sig = base64(sig)

3. Верификация:
   peerKey = _peerSigKeys.get(packet.from)   // ключ из NODE_LIST/PEER_HELLO
   ok = ECDSA-P256-SHA256.verify(peerKey, JSON.stringify(packet без sig), base64decode(packet.sig))
   if (!ok) → drop с предупреждением "[SECURITY] ECDSA verification failed"
```

### Key Pinning

```
При первом контакте с узлом:
  fingerprint = hex(SHA-256(publicKey))[:32]
  Сохранить: localStorage["hexmesh-pin-{nodeId}"] = fingerprint
  UI: "New peer ✓"

При повторном контакте:
  Загрузить сохранённый fingerprint
  Если совпадает → OK
  Если отличается → UI: "⚠️ Key changed for {alias}!"
    Пользователь должен вручную подтвердить
```

### Rate Limiting

**На сервере:**
```
MSG-пакеты:        60 пакетов/сек на узел (sliding window 1с)
FILE-пакеты:       600 пакетов/сек на узел
Размер пакета:     MAX 50 MB
```

**На клиенте (исходящие):**
```
Текстовые сообщения: MAX 10/сек
Размер текста:       MAX 64 KB
Размер файла:        MAX 256 MB
```

**Relay конгестия:**
```
per-peer relay:  MAX 512 KB/сек
total relay:     MAX 2 MB/сек
DC backpressure: пауза если bufferedAmount > 256 KB
```

---

## Транспортная безопасность

```
Клиент ↔ Сервер:
  HTTP/WS  — порт 3001 (без шифрования, для отладки)
  HTTPS/WSS — порт 3002 с TLS (самоподписанный сертификат)

Клиент ↔ Клиент (WebRTC):
  DataChannel использует DTLS (автоматически WebRTC стандарт)
  Media streams: SRTP/DTLS
```

> Для продакшн-использования рекомендуется заменить самоподписанный сертификат на Let's Encrypt.

---

## Что улучшить (future work)

1. **Forward Secrecy** — сейчас ECDH ключ сессии статичен. Добавить периодическую ротацию (Double Ratchet как в Signal).
2. **Sealed sender** — скрыть поле `from` от сервера-relay.
3. **Key verification** — голосовое или QR-сравнение fingerprint между пользователями.
4. **Encrypted metadata** — поля `to`, `from`, `type` сейчас видны relay-узлам.
5. **Persistent storage protection** — шифрование ключей в localStorage через passphrase.
