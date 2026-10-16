"""Resetting a forgotten password by an emailed link.

The link carries Django's reset token, which is built from the password hash,
so it works once: it stops when the password changes, and after
`PASSWORD_RESET_TIMEOUT` whatever happens. A deactivated account cannot use it.
"""

import logging
import threading

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator as tokens
from django.core.mail import EmailMessage, get_connection
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.accounts.identity import display_name

logger = logging.getLogger(__name__)
User = get_user_model()

SUBJECT = "Reset your Resolver password"

BODY = """Hello {name},

Someone asked to reset the password for your Resolver account ({email}).
If it was you, open this link within {minutes} minutes to choose a new one:

{link}

If it was not you, ignore this email. Your password stays as it is.

Resolver
Kenya School of Government, Maintenance Helpdesk
"""


class ResetRefused(ValueError):
    """The link is wrong, used or expired."""


def normalise(email):
    """The one form an address is matched and rate-limited by; empty for anything not plain ASCII text."""
    if not isinstance(email, str):
        return ""
    email = email.strip().lower()
    return email if email.isascii() else ""


def send_reset_link(email):
    """Email a reset link to every active account using `email`. Says nothing about whether one exists.

    The messages are built here and sent on another thread, so the request
    takes as long for an unknown address as for a known one, and a slow mail
    server holds up nobody.
    """
    email = normalise(email)
    if not email:
        return
    messages = [
        EmailMessage(
            SUBJECT,
            BODY.format(
                name=user.first_name or display_name(user),
                email=user.email,
                minutes=settings.PASSWORD_RESET_TIMEOUT // 60,
                link=reset_link(user),
            ),
            to=[user.email],
        )
        for user in User.objects.filter(email__iexact=email, is_active=True)
        if user.has_usable_password()
    ]
    if messages:
        in_background(_deliver, messages)


def in_background(fn, *args):
    threading.Thread(target=fn, args=args, daemon=True).start()


def _deliver(messages):
    """Send, and log rather than raise: nobody is waiting on the answer."""
    try:
        get_connection().send_messages(messages)
    except Exception:
        logger.exception("Sending %d password reset link(s) failed", len(messages))
    else:
        logger.info("Password reset link sent to %d account(s)", len(messages))


def reset_link(user):
    """The frontend page that takes the new password, with this user's id and token."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    return f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={tokens.make_token(user)}"


def reset_password(uid, token, password):
    """Set a new password from a link, and sign the account out everywhere.

    Raises `ResetRefused` for a bad, used or expired link, and Django's
    `ValidationError` for a password the validators reject.
    """
    if not all(isinstance(v, str) for v in (uid, token, password)):
        raise ResetRefused
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        raise ResetRefused from None
    if not tokens.check_token(user, token):
        raise ResetRefused

    validate_password(password, user)
    user.set_password(password)
    user.save(update_fields=["password"])
    # Access tokens die with the old password hash (CHECK_REVOKE_TOKEN); refresh
    # tokens are blacklisted, so no session outlives the reset.
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)
    logger.info("Password reset for user %s", user.pk)
    return user
