import CryptoJS from "crypto-js";

export function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null),
      );
    });
  });
}

const DID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789";

export function generateDid(length = 24): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += DID_CHARS.charAt(Math.floor(Math.random() * DID_CHARS.length));
  }
  return result;
}

export function md5(input: string): string {
  return CryptoJS.MD5(input).toString();
}

function aesDecrypt(data: string, key: string, iv: string): string {
  const keyBytes = CryptoJS.enc.Utf8.parse(key);
  const ivBytes = CryptoJS.enc.Utf8.parse(iv);
  const decrypted = CryptoJS.AES.decrypt(data, keyBytes, {
    iv: ivBytes,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

export function decryptResponse(data: string, ts: number, did: string): string {
  const inner = md5(`${did}${ts}`);
  const outer = md5(`${inner}OQlM9JBJgLWsgffb`);
  const key = outer.substring(0, 16);
  const iv = outer.substring(16, 32);
  return aesDecrypt(data, key, iv);
}

export function decryptImageUrl(url: string, did: string): string {
  const inner = md5(did);
  const outer = md5(`${inner}9tv86uBwmOYs7QZ0`);
  const key = outer.substring(0, 16);
  const iv = outer.substring(16, 32);
  return aesDecrypt(url, key, iv);
}
