"""
The email address is the identity.

Username and display name derive from the local part: `john.doe@ksg.ac.ke`
gives username `john.doe` and display name `John Doe`.
"""

from django.contrib.auth import get_user_model

# Django's own limit on AbstractUser.username.
USERNAME_MAX_LENGTH = 150


def local_part(email):
    return (email or "").strip().split("@", 1)[0].lower()


def identity_from_email(email, exclude_pk=None):
    """A unique username, first name and last name, all derived from the email."""
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
    number = 1

    # Emails are unique but local parts are not, so two people can derive one.
    # The suffix eats into the base rather than pushing the name past the limit.
    while users.filter(username__iexact=username).exists():
        suffix = str(number)
        username = f"{base[:USERNAME_MAX_LENGTH - len(suffix)]}{suffix}"
        number += 1

    return username, first_name, last_name


def display_name_parts(first_name, last_name, username):
    """Falls back to the username, so this is never blank."""
    name = f"{first_name or ''} {last_name or ''}".strip()
    return name or (username or "")


def display_name(user):
    """Empty when there is no user, so callers need no None check."""
    if user is None:
        return ""

    return display_name_parts(user.first_name, user.last_name, user.username)
