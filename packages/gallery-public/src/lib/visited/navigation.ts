/** Only Gallery map routes may be used as a photo viewer's return destination. */
export function mapReturnPath(value: string | null): string | null {
  return value && /^\/visited\/(?:[A-Z]{2}|regions\/[A-Z]{2}(?:-[A-Z0-9]{1,3})?)(?:\?[^#\r\n]*)?$/.test(value)
    ? value : null;
}
