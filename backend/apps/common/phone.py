"""Kenyan phone numbers — one definition, used wherever a number is accepted.

Stored in E.164 (`+254712345678`), so a number is dialable as written.

Kenyan numbering plan, national significant number (what follows +254):
  mobile    9 digits beginning 7 or 1   → 0712 345 678, 0110 123 456
  landline  8-9 digits beginning 2-6    → 020 271 1000 (Nairobi), 041 …
"""

import re

COUNTRY_CODE = "254"

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
    punctuation and spacing are stripped, while length and prefix are enforced.

    Raises InvalidPhoneNumber for anything that is not a Kenyan number.
    """
    if not (value or "").strip():
        return ""

    cleaned = re.sub(r"[^\d+]", "", value)
    if not cleaned:
        # Not blank, so it must not fall back to the requester's own number.
        raise InvalidPhoneNumber()

    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if not digits.startswith(COUNTRY_CODE):
            # A foreign number here is almost always a typo.
            raise InvalidPhoneNumber(
                "Only Kenyan numbers are supported — start with 0 or +254."
            )
        national = digits[len(COUNTRY_CODE) :]
    elif cleaned.startswith(COUNTRY_CODE) and len(cleaned) > len(COUNTRY_CODE) + 6:
        national = cleaned[len(COUNTRY_CODE) :]
    else:
        national = cleaned

    # Trunk prefix: 0712… and +254 (0) 712… both mean 712….
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
