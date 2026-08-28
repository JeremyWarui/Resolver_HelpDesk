"""Kenyan phone numbers: the single definition of what a number is.

A ticket carries the number the technician should call (`Ticket.contact_phone`),
which is the only place the system accepts one. Stored in E.164
(`+254712345678`), so a number is dialable as written.

Kenyan numbering plan, national significant number (what follows +254):
  mobile    9 digits beginning 7 or 1   → 0712 345 678, 0110 123 456
  landline  8-9 digits beginning 2-6    → 020 271 1000 (Nairobi), 041 …

Both are accepted: an office worker's contactable number is a desk extension.
"""

import re

COUNTRY_CODE = "254"

CONTACT_PHONE_HELP = "Optional — just in case the technician needs to call you."

# Length is what separates them: a mobile is exactly 9, a landline 8 or 9.
VALID_LENGTHS = {"7": (9,), "1": (9,)} | {d: (8, 9) for d in "23456"}

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

    Punctuation, spacing and any leading 0 or +254 are stripped; what is left
    is checked against `VALID_LENGTHS`. Raises InvalidPhoneNumber otherwise.
    """
    if not (value or "").strip():
        return ""

    digits = re.sub(r"\D", "", value)
    # 0712…, +254 712…, 254712… and +254 (0) 712… all mean the same digits.
    digits = digits.removeprefix(COUNTRY_CODE).lstrip("0")

    if len(digits) not in VALID_LENGTHS.get(digits[:1], ()):
        raise InvalidPhoneNumber()

    return f"+{COUNTRY_CODE}{digits}"
