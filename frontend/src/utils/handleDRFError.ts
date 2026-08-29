import { toast } from 'sonner';

/**
 * Turn a DRF error response into a toast.
 *
 * DRF answers a bad write with `{field: ["message"], ...}`, sometimes under
 * `non_field_errors` or `detail`. Every message in the body is shown, so a
 * serializer that rejects two fields does not silently report one.
 *
 * Toasts only: a form that wants field-level errors calls `form.setError`
 * itself, where it knows its own field names.
 */
export function handleDRFError(
  error: unknown,
  options: { fallbackMessage?: string } = {},
): void {
  const { fallbackMessage = 'An error occurred' } = options;
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;

  if (!data || typeof data !== 'object') {
    toast.error(fallbackMessage);
    return;
  }

  const messages = Object.values(data)
    .map((val) => (Array.isArray(val) ? val.join(' ') : String(val)))
    .filter(Boolean);

  if (messages.length === 0) toast.error(fallbackMessage);
  else messages.forEach((message) => toast.error(message));
}
