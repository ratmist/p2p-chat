import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshClient } from '../src/lib/MeshClient';

function getPrivate<T extends object, K extends keyof any>(obj: T, key: K): any {
  return (obj as any)[key as any];
}

describe('MeshClient messaging and transfer protocol', () => {
  let client: MeshClient;

  beforeEach(async () => {
    client = new MeshClient('ws://localhost:3001', 'alice');
    await client.init();
  });

  it('queues outgoing message until ACK arrives', async () => {
    const id = await client.sendMessage('peer-1', 'hello');
    const queue = getPrivate(client, 'messageQueue');
    expect(queue.has(id)).toBe(true);

    getPrivate(client, 'handleAppPacket').call(client, {
      id: 'ack-1',
      type: 'ACK',
      from: 'peer-1',
      to: client.getNodeId(),
      ttl: 7,
      visited: [],
      payload: id,
      ts: Date.now(),
    });

    expect(queue.has(id)).toBe(false);
  });

  it('retries a message if ACK is missing', async () => {
    vi.useFakeTimers();
    const deliverSpy = vi.spyOn(client as any, 'deliverPacket').mockResolvedValue(undefined);

    await client.sendMessage('peer-2', 'retry-me');
    expect(deliverSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(deliverSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  });

  it('drops forwarded packets with ttl <= 0', () => {
    const metricsBefore = client.getMetrics().packetsDropped;
    const result = getPrivate(client, 'forwardPacket').call(client, {
      id: 'pkt-1',
      type: 'MSG',
      from: 'peer-a',
      to: 'peer-b',
      ttl: 0,
      visited: [],
      payload: { text: 'x' },
      ts: Date.now(),
    });

    expect(result).toBe(true);
    expect(client.getMetrics().packetsDropped).toBe(metricsBefore + 1);
  });

  it('marks corrupted assembled file as failed', async () => {
    getPrivate(client, 'fileTransfers').set('t1', {
      transferId: 't1',
      fileName: 'bad.bin',
      fileSize: 3,
      totalChunks: 1,
      receivedChunks: new Map([[0, new Uint8Array([1, 2, 3])]]),
      sha256: 'deadbeef',
      status: 'transferring',
      progress: 100,
    });

    const failSpy = vi.fn();
    client.on('file:integrity:fail', failSpy);

    await getPrivate(client, 'assembleFile').call(client, 't1');
    expect(failSpy).toHaveBeenCalledWith('t1');
    expect(client.getFileTransfer('t1')?.status).toBe('failed');
  });
});
