import nacl from "tweetnacl";
import * as naclutil from "tweetnacl-util";
import * as Crypto from "expo-crypto";

// tweetnacl needs a CSPRNG; React Native has none built in, so wire it to
// expo-crypto's hardware RNG once.
let prngReady = false;
function ensurePRNG(): void {
  if (prngReady) return;
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const b = Crypto.getRandomBytes(n);
    for (let i = 0; i < n; i++) x[i] = b[i];
  });
  prngReady = true;
}

export interface Sealed {
  epk: string;
  nonce: string;
  box: string;
}

/**
 * Seal a message to the device's NaCl box public key (base64). Uses an
 * ephemeral keypair so the ciphertext is decryptable only by the device's
 * secret key (crypto_box / curve25519xsalsa20poly1305) — interoperates with the
 * firmware's tweetnacl crypto_box_open. Protects the Wi-Fi password + token
 * from passive sniffing on the setup hotspot.
 */
export function sealToDevice(devicePkB64: string, message: string): Sealed {
  ensurePRNG();
  const devicePk = naclutil.decodeBase64(devicePkB64);
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const boxed = nacl.box(naclutil.decodeUTF8(message), nonce, devicePk, eph.secretKey);
  return {
    epk: naclutil.encodeBase64(eph.publicKey),
    nonce: naclutil.encodeBase64(nonce),
    box: naclutil.encodeBase64(boxed),
  };
}
