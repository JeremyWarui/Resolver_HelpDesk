"""Account routes, included by resolver/api_urls.py under /api/v1/.

Paths, not a router: none of these is table CRUD. Identity derives from the
email and role writes go through `posts.assign_role`.
"""

from django.urls import path

from apps.accounts.views import (
    CampusRosterView,
    MeView,
    ScopedTechnicianRosterView,
    UserActiveView,
    UserDetailView,
    UserListCreateView,
    UserRoleAssignmentView,
    jwt_login,
    jwt_logout,
    jwt_refresh,
    jwt_register,
    password_reset_confirm,
    password_reset_request,
    public_campus_list,
)

urlpatterns = [
    path("auth/login/", jwt_login, name="auth-login"),
    path("auth/register/", jwt_register, name="auth-register"),
    path("auth/campuses/", public_campus_list, name="auth-campuses"),
    path("auth/refresh/", jwt_refresh, name="auth-refresh"),
    path("auth/logout/", jwt_logout, name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/password-reset/", password_reset_request, name="auth-password-reset"),
    path("auth/password-reset/confirm/", password_reset_confirm, name="auth-password-reset-confirm"),
    # `org` serves the campus; the posts behind it are read here.
    path("campus-roster/", CampusRosterView.as_view(), name="campus-roster"),
    path("users/", UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("users/<int:pk>/deactivate/", UserActiveView.as_view(active=False), name="user-deactivate"),
    path("users/<int:pk>/reactivate/", UserActiveView.as_view(active=True), name="user-reactivate"),
    path(
        "users/<int:pk>/role-assignments/",
        UserRoleAssignmentView.as_view(),
        name="user-role-assignments",
    ),
    # Read only: `accounts.posts.assign_role` is the only writer of a trade link.
    path(
        "technicians/",
        ScopedTechnicianRosterView.as_view(),
        name="technician-list",
    ),
]
