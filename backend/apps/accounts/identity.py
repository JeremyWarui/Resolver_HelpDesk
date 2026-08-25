"""Identity derived from the email address.

The email is the login credential and the only source of a user's username and
display name: `jeremy.mwangi@ksg.ac.ke` becomes username `jeremy.mwangi`, shown
as "Jeremy Mwangi". Nothing else invents a username, so the address someone
types once at registration is what they are known by everywhere.
"""

from django.contrib.auth import get_user_model

USERNAME_MAX_LENGTH = 150  # AbstractUser.username


def local_part(email):
    """The part before the '@', lower-cased — '' when there isn't one."""
    return (email or "").strip().split("@")[0].strip().lower()


def identity_from_email(email, exclude_pk=None):
    """(username, first_name, last_name) — the whole of who an account is.

    This is the only place any of the three is decided. A caller that lets a
    client pass one in instead is a second answer to the same question, which
    is what the email rule exists to remove.

    The name is the dot-separated local part, title-cased. A local part with no
    dot has no surname to give, so the last name comes back empty rather than
    guessed; three or more parts fold everything after the first into the last
    name, because dropping the tail would silently rename people.

    The username is that same local part, numbered on collision. Emails are
    unique per account but local parts are not (the same jeremy.mwangi at two
    domains), so the numeric suffix is what keeps the second registration from
    failing on a username clash. `exclude_pk` is the account being re-derived
    after an email change: without it a person moving domain would collide with
    their own old username and be renamed to `jeremy.mwangi1`.
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

    Falls back to the username because a name is not guaranteed:
    `identity_from_email` leaves the surname empty for a dotless local part, and
    `createsuperuser` bypasses the email rule entirely. Without the fallback a
    UI row renders an anonymous gap, or the literal string "undefined undefined".

    Takes the three columns rather than a user so a `.values()` row can call it:
    an aggregate over thousands of tickets has no model instance per row, and
    re-fetching one is the N+1 this signature exists to avoid. Callers holding a
    real user want `display_name` below instead.
    """
    return f"{first_name or ''} {last_name or ''}".strip() or (username or "")


def display_name(user):
    """`display_name_parts` for the common case: a user object — '' if no user."""
    if user is None:
        return ""
    return display_name_parts(user.first_name, user.last_name, user.username)
