export function isASCIIDigit(c: number) {
  return c >= 0x30 && c <= 0x39;
}

export function isASCIIAlpha(c: number) {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

export function isASCIIAlphanumeric(c: number) {
  return isASCIIAlpha(c) || isASCIIDigit(c);
}

export function isASCIIHex(c: number) {
  return (
    isASCIIDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)
  );
}
