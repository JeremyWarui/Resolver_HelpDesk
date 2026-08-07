import { toast } from 'sonner';
import type { FieldValues, UseFormSetError, Path } from 'react-hook-form';

interface HandleDRFErrorOptions<T extends FieldValues> {
  setError?: UseFormSetError<T>;
  fallbackMessage?: string;
}

/**
 * Handles DRF (Django REST Framework) error responses.
 * Parses error.response.data and calls toast.error() for non-field errors
 * and optionally calls setError() for field-specific errors in forms.
 */
export function handleDRFError<T extends FieldValues>(
  error: unknown,
  options: HandleDRFErrorOptions<T> = {}
): void {
  const { setError, fallbackMessage = 'An error occurred' } = options;

  try {
    const err = error as { response?: { data?: Record<string, unknown> } };

    if (!err?.response?.data) {
      toast.error(fallbackMessage);
      return;
    }

    const data = err.response.data;
    let foundField = false;

    Object.keys(data).forEach((key) => {
      const val = data[key];
      const message = Array.isArray(val) ? val.join(' ') : String(val);

      // Non-field errors show as toast
      if (key === 'non_field_errors' || key === 'detail') {
        toast.error(message);
      } else if (setError) {
        // Field errors set on form if setError provided
        try {
          setError(key as Path<T>, { type: 'server', message });
          foundField = true;
        } catch {
          // Silently ignore if field doesn't exist in form
        }
      }
    });

    // Show fallback if no errors were processed
    if (!foundField && setError) {
      toast.error(fallbackMessage);
    }
  } catch {
    toast.error(fallbackMessage);
  }
}
