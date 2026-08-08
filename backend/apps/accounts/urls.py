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
    # Auth endpoints
    path("auth/login/", jwt_login, name="auth-login"),
    path("auth/register/", jwt_register, name="auth-register"),
    path("auth/campuses/", public_campus_list, name="auth-campuses"),
    path("auth/refresh/", jwt_refresh, name="auth-refresh"),
    path("auth/logout/", jwt_logout, name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    # User management (admin only)
    path("users/", UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    # Role assignment — admin only, one role per user (GET reads it, POST replaces it)
    path(
        "users/<int:user_pk>/role-assignments/",
        UserRoleAssignmentView.as_view(),
        name="user-role-assignments",
    ),
]
