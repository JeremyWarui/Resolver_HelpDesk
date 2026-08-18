"""Kenyan phone numbers — one definition, used wherever a number is accepted.

Stored in E.164 (`+254712345678`) so a number is unambiguous and dialable
as-is. People write the same number half a dozen ways — `0712 345 678`,
`+254 712 345678`, `254712345678`, `0712-345-678` — and all of them mean one
number that a technician needs to be able to tap and call.

Kenyan numbering plan, national significant number (what follows +254):
  mobile    9 digits beginning 7 or 1   → 0712 345 678, 0110 123 456
  landline  8-9 digits beginning 2-6    → 020 271 1000 (Nairobi), 041 …
"""

import re

COUNTRY_CODE = "254"

# Shown beside the field in the ticket wizard. Lives here so the API's
# help_text and the UI copy cannot drift apart.
CONTACT_PHONE_HELP = "Optional — just in case the technician needs to call you."

MOBILE_PREFIXES = ("7", "1")
LANDLINE_PREFIXES = ("2", "3", "4", "5", "6")

INVALID_MESSAGE = (
    "Enter a Kenyan phone number the technician can dial — "
    "e.g. 0712 345 678 or +254 712 345 678."
)


class InvalidPhoneNumber(ValueError):
    """Raised for anything that is not a dialable Kenyan number."""

    def __init__(self, message=INVALID_MESSAGE):
        super().__init__(message)


def normalise_phone(value):
    """Return `value` as an E.164 Kenyan number, or "" if it is blank.

    Permissive about how the number is written and strict about what it is:
    punctuation and spacing are stripped rather than rejected, because turning
    away a real number for being typed with spaces helps nobody. Length and
    prefix are enforced, because a number that cannot be dialled is worse than
    no number at all — the technician would waste a trip discovering it.

    Raises InvalidPhoneNumber for anything that is not a Kenyan number.
    """
    if not (value or "").strip():
        return ""

    cleaned = re.sub(r"[^\d+]", "", value)
    if not cleaned:
        # Something was typed, but none of it was a number. Treating this as
        # "left blank" would silently fall back to the requester's own number,
        # so a mistyped caretaker's number would send the technician to the
        # wrong person with nobody any the wiser.
        raise InvalidPhoneNumber()

    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if not digits.startswith(COUNTRY_CODE):
            # A foreign number is almost always a typo here, and silently
            # keeping one would strand the technician mid-callout.
            raise InvalidPhoneNumber(
                "Only Kenyan numbers are supported — start with 0 or +254."
            )
        national = digits[len(COUNTRY_CODE) :]
    elif cleaned.startswith(COUNTRY_CODE) and len(cleaned) > len(COUNTRY_CODE) + 6:
        national = cleaned[len(COUNTRY_CODE) :]
    else:
        national = cleaned

    # Drop the trunk prefix: 0712… and +254 (0) 712… both mean 712….
    national = national.lstrip("0")

    if not national.isdigit():
        raise InvalidPhoneNumber()

    prefix = national[0]
    if prefix in MOBILE_PREFIXES:
        if len(national) != 9:
            raise InvalidPhoneNumber(
                "A Kenyan mobile number has 10 digits — e.g. 0712 345 678."
            )
    elif prefix in LANDLINE_PREFIXES:
        if len(national) not in (8, 9):
            raise InvalidPhoneNumber()
    else:
        raise InvalidPhoneNumber()

    return f"+{COUNTRY_CODE}{national}"
