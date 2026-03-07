/**
 * HexMesh Crypto
 * Ed25519 keypair for node identity, ECDH for E2E message encryption
 */

// ─── Key generation ──────────────────────────────────────────────────────────

export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );

  const publicKeyExported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyExported)));

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyB64,
  };
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importKey(b64: string): Promise<CryptoKey> {
  const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    binary,
    { name: 'Ed25519' },
    true,
    ['verify'],
  );
}

// ─── Sign / Verify ───────────────────────────────────────────────────────────

export async function sign(privateKey: CryptoKey, data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign('Ed25519', privateKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verify(
  publicKey: CryptoKey,
  data: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const encoded = new TextEncoder().encode(data);
    const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    return await crypto.subtle.verify('Ed25519', publicKey, signature, encoded);
  } catch {
    return false;
  }
}

// ─── E2E: ECDH + AES-GCM ────────────────────────────────────────────────────

export async function generateECDHKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKeyB64: string,
): Promise<CryptoKey> {
  const peerPublicKey = await importECDHPublicKey(peerPublicKeyB64);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importECDHPublicKey(b64: string): Promise<CryptoKey> {
  const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    binary,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...result));
}

export async function decryptMessage(key: CryptoKey, b64: string): Promise<string> {
  const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
