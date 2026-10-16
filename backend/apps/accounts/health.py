"""
What is wrong with an account that can still sign in.

An account can be valid enough to save and still not work: one with no home
campus cannot raise a ticket, and a technician holding no trade matches no
ticket. The Users page lists these, and the admin's dashboard counts them.
"""

from apps.accounts.models import CustomUser

# code: (what is wrong, what it does to them)
PROBLEMS = {
    "no_home_campus": ("No home campus", "A ticket they raise has no campus to route to."),
    "technician_without_trade": ("Technician with no trade", "They match no tickets, so their queue stays empty."),
}


def problems(user, role, trades_held):
    """The problem codes for one account, in PROBLEMS order."""
    found = []
    if user.campus_id is None:
        found.append("no_home_campus")
    if role == "technician" and not trades_held:
        found.append("technician_without_trade")
    return found


def accounts_to_fix():
    """Every active account with a problem, as (user, codes), by name."""
    users = (
        CustomUser.objects.filter(is_active=True)
        .select_related("role_assignment")
        .prefetch_related("technician_trades")
        .order_by("first_name", "last_name", "username")
    )
    rows = []
    for user in users:
        role = getattr(getattr(user, "role_assignment", None), "role", None)
        codes = problems(user, role, len(user.technician_trades.all()))
        if codes:
            rows.append((user, codes))
    return rows
