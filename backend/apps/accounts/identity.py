"""Username and display name, both derived from the email address.

`jeremy.mwangi@ksg.ac.ke` becomes username `jeremy.mwangi`, shown as
"Jeremy Mwangi". Nothing else invents a username.
"""

from django.contrib.auth import get_user_model

USERNAME_MAX_LENGTH = 150  # AbstractUser.username


def local_part(email):
    """The part before the '@', lower-cased — '' when there isn't one."""
    return (email or "").strip().split("@")[0].strip().lower()


def identity_from_email(email, exclude_pk=None):
    """(username, first_name, last_name) — the only place any of the three is decided.

    Dots separate the names; a dotless local part has no surname to give, and a
    third part folds into the last name rather than being dropped. Local parts
    are not unique the way emails are, so a taken username gets a numeric
    suffix. `exclude_pk` is the account being re-derived after an email change,
    which would otherwise collide with its own old username.
    """
    base = local_part(email)
    parts = [p for p in base.split(".") if p]
    first_name = parts[0].title() if parts else ""
    last_name = " ".join(p.title() for p in parts[1:])

    User = get_user_model()
    taken = User.objects.all()
    if exclude_pk is not None:
        taken = taken.exclude(pk=exclude_pk)
    base = base[:USERNAME_MAX_LENGTH]
    username = base
    n = 1
    while taken.filter(username__iexact=username).exists():
        suffix = str(n)
        username = f"{base[:USERNAME_MAX_LENGTH - len(suffix)]}{suffix}"
        n += 1

    return username, first_name, last_name


def display_name_parts(first_name, last_name, username):
    """The one definition of how a person's name is rendered. Never blank.

    A name is not guaranteed — dotless emails have no surname and
    `createsuperuser` skips the email rule — so the username is the fallback.
    Takes columns rather than a user so a `.values()` row can call it without
    re-fetching the model; callers holding a user want `display_name`.
    """
    return f"{first_name or ''} {last_name or ''}".strip() or (username or "")


def display_name(user):
    """`display_name_parts` for a user object — '' if no user."""
    if user is None:
        return ""
    return display_name_parts(user.first_name, user.last_name, user.username)
