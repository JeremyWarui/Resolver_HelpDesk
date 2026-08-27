"""
Username and display name, derived from the local part of an email address:
`john.doe@ksg.ac.ke` gives username `john.doe` and display name `John Doe`.
"""

from django.contrib.auth import get_user_model

USERNAME_MAX_LENGTH = 150


def local_part(email):
    """Return the normalized part of an email address before '@'."""
    return (email or "").strip().split("@", 1)[0].lower()


def identity_from_email(email, exclude_pk=None):
    """Return a unique username, first name, and last name derived from email."""
    base = local_part(email)
    parts = [part for part in base.split(".") if part]

    first_name = parts[0].title() if parts else ""
    last_name = " ".join(part.title() for part in parts[1:])

    User = get_user_model()
    users = User.objects.all()

    # Regenerating after an email change must not collide with the old username.
    if exclude_pk is not None:
        users = users.exclude(pk=exclude_pk)

    base = base[:USERNAME_MAX_LENGTH]
    username = base
    # Emails are unique but local parts are not, so two people can derive one.
    number = 1

    while users.filter(username__iexact=username).exists():
        suffix = str(number)
        username = f"{base[:USERNAME_MAX_LENGTH - len(suffix)]}{suffix}"
        number += 1

    return username, first_name, last_name


def display_name_parts(first_name, last_name, username):
    """Return a display name, falling back to the username."""
    name = f"{first_name or ''} {last_name or ''}".strip()
    return name or (username or "")


def display_name(user):
    """Return a user's display name, or an empty string if no user is provided."""
    if user is None:
        return ""

    return display_name_parts(user.first_name, user.last_name, user.username)
