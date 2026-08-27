"""Break-glass admin registration for every domain model.

The React app is where an administrator configures the system; this is for
what that app cannot reach.
"""

from django.contrib import admin

from apps.accounts.models import (
    CustomUser,
    RoleAssignment,
    TechnicianTrade,
)
from apps.facilities.models import Facility, FacilityType
from apps.org.models import Campus, ServiceItem, SubSection
from apps.sla.models import Priority
from apps.tickets.models import (
    Ticket,
    TicketComment,
    TicketFeedback,
    TicketLocation,
)

admin.site.register(
    [
        CustomUser,
        RoleAssignment,
        Campus,
        TechnicianTrade,
        SubSection,
        ServiceItem,
        FacilityType,
        Facility,
        Priority,
        Ticket,
        TicketLocation,
        TicketComment,
        TicketFeedback,
    ]
)

admin.site.site_header = "Resolver — Service Desk"
admin.site.site_title = "Resolver Admin"
admin.site.index_title = "Service Desk Management"
