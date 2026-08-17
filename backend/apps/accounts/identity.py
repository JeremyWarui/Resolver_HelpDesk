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


def names_from_email(email):
    """('Jeremy', 'Mwangi') for jeremy.mwangi@… — dot-separated, title-cased.

    A local part with no dot has no surname to give, so the last name comes
    back empty rather than guessed. Three or more parts fold everything after
    the first into the last name; dropping the tail would silently rename
    people.
    """
    parts = [p for p in local_part(email).split(".") if p]
    if not parts:
        return "", ""
    return parts[0].title(), " ".join(p.title() for p in parts[1:])


def allocate_username(email, exclude_pk=None):
    """A free username for this email — the local part, numbered on collision.

    Emails are unique per account but local parts are not (the same
    jeremy.mwangi at two domains), so the numeric suffix is what keeps the
    second registration from failing on a username clash.

    `exclude_pk` is the account being re-derived after an email change: without
    it a person moving domain would collide with their own old username and be
    renamed to `jeremy.mwangi1`.
    """
    User = get_user_model()
    taken = User.objects.all()
    if exclude_pk is not None:
        taken = taken.exclude(pk=exclude_pk)
    base = local_part(email)[:USERNAME_MAX_LENGTH]
    username = base
    n = 1
    while taken.filter(username__iexact=username).exists():
        suffix = str(n)
        username = f"{base[:USERNAME_MAX_LENGTH - len(suffix)]}{suffix}"
        n += 1
    return username


def identity_from_email(email, exclude_pk=None):
    """(username, first_name, last_name) — the whole of who an account is.

    This is the only place any of the three is decided. A caller that lets a
    client pass one in instead is a second answer to the same question, which
    is what the email rule exists to remove.
    """
    first_name, last_name = names_from_email(email)
    return allocate_username(email, exclude_pk=exclude_pk), first_name, last_name
