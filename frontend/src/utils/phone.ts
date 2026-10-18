/** Kenyan numbers are stored E.164 (+254712345678) and read locally.
 *
 * Display only: never send this back to the server. The stored form is the
 * dialable one, and the `tel:` href uses it too.
 */
export function formatPhoneLocal(e164: string | null | undefined): string {
  if (!e164) return '';
  const match = /^\+254(\d{9})$/.exec(e164.trim());
  if (!match) return e164;              // landline, or something we didn't write
  const [, national] = match;
  return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}
