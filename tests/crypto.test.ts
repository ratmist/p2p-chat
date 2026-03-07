import { describe, expect, it } from 'vitest';
import {
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
  exportKey,
  generateECDHKeyPair,
  generateKeyPair,
  importKey,
  sign,
  verify,
} from '../src/lib/crypto';

async function exportEcdhPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('spki', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

describe('crypto primitives', () => {
  it('signs and verifies payloads', async () => {
    const kp = await generateKeyPair();
    const payload = JSON.stringify({ hello: 'world', ts: 1 });
    const sig = await sign(kp.privateKey, payload);
    const ok = await verify(kp.publicKey, payload, sig);
    expect(ok).toBe(true);
  });

  it('exports and imports public keys', async () => {
    const kp = await generateKeyPair();
    const b64 = await exportKey(kp.publicKey);
    const imported = await importKey(b64);
    const payload = 'mesh-payload';
    const sig = await sign(kp.privateKey, payload);
    const ok = await verify(imported, payload, sig);
    expect(ok).toBe(true);
  });

  it('derives shared secret for ECDH peers and decrypts ciphertext', async () => {
    const alice = await generateECDHKeyPair();
    const bob = await generateECDHKeyPair();

    const aliceShared = await deriveSharedKey(alice.privateKey, await exportEcdhPublicKey(bob.publicKey));
    const bobShared = await deriveSharedKey(bob.privateKey, await exportEcdhPublicKey(alice.publicKey));

    const encrypted = await encryptMessage(aliceShared, 'hello-mesh');
    const decrypted = await decryptMessage(bobShared, encrypted);

    expect(decrypted).toBe('hello-mesh');
  });
});
