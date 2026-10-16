"""A mail backend that sends every message to one address, for testing against real mail.

With `EMAIL_SEND_ONLY_TO` set, no message reaches the people it names: a copy
goes to that address instead, saying who it was meant for, and is delivered by
`EMAIL_DELIVERY_BACKEND`.
"""

import copy

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend

_ADDRESS_HEADERS = {"to", "cc", "bcc", "reply-to"}


class SendOnlyToBackend(BaseEmailBackend):
    """Readdresses a copy of each message to `EMAIL_SEND_ONLY_TO` and hands it to the real backend."""

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently)
        if settings.EMAIL_DELIVERY_BACKEND.endswith("SendOnlyToBackend"):
            raise ImproperlyConfigured("EMAIL_BACKEND must name the real backend, not SendOnlyToBackend.")
        self.delivery = get_connection(settings.EMAIL_DELIVERY_BACKEND, fail_silently=fail_silently, **kwargs)

    def send_messages(self, email_messages):
        return self.delivery.send_messages([self._readdressed(m) for m in email_messages])

    @staticmethod
    def _readdressed(message):
        meant_for = ", ".join([*message.to, *message.cc, *message.bcc])
        message = copy.copy(message)
        message.to, message.cc, message.bcc, message.reply_to = [settings.EMAIL_SEND_ONLY_TO], [], [], []
        message.extra_headers = {k: v for k, v in message.extra_headers.items() if k.lower() not in _ADDRESS_HEADERS}
        message.subject = f"{message.subject} [for {meant_for}]"
        message.body = f"(Test copy. This email was meant for {meant_for}.)\n\n{message.body}"
        return message
