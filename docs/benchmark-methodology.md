# Методика замеров

## 1. Что измеряем

### Для сообщений
- latency one-way / RTT;
- delivery success rate;
- retry count;
- message completion time.

### Для звонков
- call setup time;
- RTT;
- packet loss;
- jitter;
- субъективное качество речи;
- UI responsiveness.

### Для файлов
- throughput;
- completion time;
- retry count per chunk;
- integrity success rate;
- resume success rate.

## 2. Стенд
- 3 устройства в одной Wi‑Fi сети;
- 1 устройство как relay;
- 1 signaling server;
- опционально второй signaling server для federation.

## 3. Сценарии

### Сценарий A: идеальная сеть
- один hop;
- стабильный Wi‑Fi;
- проверяем baseline.

### Сценарий B: мультихоп
- A не имеет прямого канала до C;
- B выступает relay;
- измеряем рост задержки и потерю качества.

### Сценарий C: потери
Искусственно добавить:
- 5% packet loss;
- 10% packet loss;
- 100–200 ms additional latency.

### Сценарий D: отказ узла
- выключить relay-узел во время обмена;
- зафиксировать время деградации и восстановления.

## 4. Как измерять

### Сообщения
- timestamp на отправке;
- timestamp на ACK;
- считать полный RTT;
- логировать retry count.

### Звонки
- использовать `getStats()` WebRTC:
  - jitter;
  - packetsLost;
  - roundTripTime;
  - bytesSent/Received.

### Файлы
- логировать:
  - начало передачи;
  - подтверждение каждого чанка;
  - время завершения;
  - число retry;
  - факт совпадения `SHA-256`.

## 5. Формула отчета

В таблицу для защиты удобно вынести:
- сценарий;
- средний RTT сообщений;
- call setup time;
- jitter median/p95;
- packet loss;
- file throughput;
- число повторов;
- итог: success/fail.

## 6. Что говорить на защите

1. Мы измеряли не только “работает / не работает”, а конкретные сетевые метрики.
2. При росте потерь текстовые сообщения сохраняют доставку за счет ACK/retry.
3. Файл сохраняет целостность за счет chunk ACK + SHA-256.
4. Для real-time трафика приоритет — не абсолютная доставка каждого пакета, а низкая задержка и приемлемый jitter.
5. При потере прямой связи система переходит на fallback или деградирует контролируемо.
