"""Account routes, included by resolver/api_urls.py under /api/v1/.

Auth (public except me and logout): login, register, campuses, refresh, logout,
me. Admin only: /users/ (list, create), /users/<pk>/ (edit, delete), and
/users/<pk>/role-assignments/ — GET reads the one role, POST replaces it.
"""

from django.urls import path

from .views import (
    MeView,
    UserRoleAssignmentView,
    UserListCreateView,
    UserDetailView,
    jwt_login,
    jwt_register,
    jwt_refresh,
    jwt_logout,
    public_campus_list,
)

urlpatterns = [
    path("auth/login/", jwt_login, name="auth-login"),
    path("auth/register/", jwt_register, name="auth-register"),
    path("auth/campuses/", public_campus_list, name="auth-campuses"),
    path("auth/refresh/", jwt_refresh, name="auth-refresh"),
    path("auth/logout/", jwt_logout, name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("users/", UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path(
        "users/<int:user_pk>/role-assignments/",
        UserRoleAssignmentView.as_view(),
        name="user-role-assignments",
    ),
]
