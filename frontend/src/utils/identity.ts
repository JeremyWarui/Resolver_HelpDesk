/**
 * The email address is the identity — preview side.
 *
 * The rule lives in `backend/apps/accounts/identity.py` and the server is
 * authoritative; this only shows what it is about to derive, while the address
 * is still being typed, so nobody discovers the name their account was given
 * after the account exists. Change one, change the other.
 */

export interface DerivedIdentity {
  /** The email's local part — what the account's username will be. */
  username: string;
  /** How the person will be displayed: "jeremy.mwangi" → "Jeremy Mwangi". */
  name: string;
}

export function deriveIdentity(email: string): DerivedIdentity | null {
  if (!email.includes('@')) return null;
  const local = email.split('@')[0]?.trim().toLowerCase() ?? '';
  const parts = local.split('.').filter(Boolean);
  if (parts.length === 0) return null;
  return {
    username: local,
    name: parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
  };
}
