import { webcrypto } from 'node:crypto';

Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});

Object.defineProperty(globalThis, 'btoa', {
  value: (str: string) => Buffer.from(str, 'binary').toString('base64'),
  configurable: true,
});

Object.defineProperty(globalThis, 'atob', {
  value: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
  configurable: true,
});

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(_url: string) {
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

class MockRTCDataChannel {
  readyState: 'open' | 'closed' = 'open';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
}

class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: { candidate: any }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: any }) => void) | null = null;
  ontrack: ((event: any) => void) | null = null;
  dc = new MockRTCDataChannel();

  constructor(_config?: RTCConfiguration) {}
  createDataChannel(_label: string, _opts?: RTCDataChannelInit) { return this.dc as any; }
  async createOffer() { return { type: 'offer', sdp: 'offer-sdp' } as RTCSessionDescriptionInit; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' } as RTCSessionDescriptionInit; }
  async setLocalDescription(desc: RTCSessionDescriptionInit) { this.localDescription = desc; }
  async setRemoteDescription(desc: RTCSessionDescriptionInit) { this.remoteDescription = desc; }
  async addIceCandidate(_candidate: RTCIceCandidateInit) {}
  addTrack(_track: MediaStreamTrack, _stream: MediaStream) {}
  close() { this.connectionState = 'closed'; }
}

Object.defineProperty(globalThis, 'WebSocket', { value: MockWebSocket, configurable: true });
Object.defineProperty(globalThis, 'RTCPeerConnection', { value: MockRTCPeerConnection, configurable: true });
Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }],
      }),
    },
  },
  configurable: true,
});
