export async function encryptString(plain: string, passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain)
  );

  const combined = new Uint8Array(salt.byteLength + iv.byteLength + cipherBuf.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(cipherBuf), salt.byteLength + iv.byteLength);

  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

export async function decryptString(payloadB64: string, passphrase: string): Promise<string> {
  const dec = new TextDecoder();
  let binary = atob(payloadB64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const cipher = bytes.slice(28);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return dec.decode(plainBuf);
}