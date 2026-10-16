"""
Django settings for the resolver project.
"""

import os
import dj_database_url
from datetime import timedelta
from dotenv import load_dotenv

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set.")

DEBUG = os.getenv("DEBUG", "False") == "True"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if h.strip()
]

# Django's CSRF Origin check compares against this explicitly, not against
# ALLOWED_HOSTS: without it, POSTs to /admin/login/ fail behind an HTTPS proxy.
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

# The proxy terminates TLS and forwards plain HTTP; without this,
# request.is_secure() is False and secure cookies and CSRF checks misbehave.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.common",
    "apps.accounts",
    "apps.org",
    "apps.sla",
    "apps.facilities",
    "apps.tickets",
    "apps.analytics",
    "apps.notifications",
    "apps.system_feedback",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "whitenoise.runserver_nostatic",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Views name a pagination class only to deviate from this.
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPagination",
    "PAGE_SIZE": 20,
    # How many proxies sit in front of Django. The rate limits read the client's
    # address from X-Forwarded-For only this many hops back, so a client cannot
    # pick its own address by sending the header. 0 for runserver; 1 behind IIS
    # or nginx.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "0")),
    # Only views that name a scope are limited.
    "DEFAULT_THROTTLE_RATES": {
        "system_feedback": "10/hour",
        # Per address, so one inbox cannot be flooded; per IP, so one campus
        # behind one address can still reset as many as it needs.
        "password_reset_email": "3/hour",
        "password_reset_ip": "20/hour",
        "password_reset_confirm": "20/hour",
    },
}


AUTH_USER_MODEL = "accounts.CustomUser"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # Must come before CommonMiddleware.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "resolver.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "resolver.wsgi.application"


if os.getenv("DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.config(
            default=os.getenv("DATABASE_URL"),
            conn_max_age=0,
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME"),
            "USER": os.getenv("DB_USER"),
            "PASSWORD": os.getenv("DB_PASSWORD"),
            "HOST": os.getenv("DB_HOST"),
            "PORT": os.getenv("DB_PORT"),
            # The app runs against local PostgreSQL and the tests never touch it:
            # resolver/test_settings.py replaces DATABASES with in-memory SQLite.
            "CONN_MAX_AGE": 0,
            "CONN_HEALTH_CHECKS": True,
        }
    }


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

# How often the escalation check is scheduled to run, in minutes. The task on
# the server runs `manage.py process_auto_escalations` this often; the SLA Rules
# page reads it to say when a run is overdue.
ESCALATION_INTERVAL_MINUTES = int(os.environ.get("ESCALATION_INTERVAL_MINUTES", "15"))

# Mail goes out over SMTP once EMAIL_HOST is set; until then each message is
# printed to the console, and the admin's dashboard says email is not set up.
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
# Without a host, development prints each message; production sends nothing,
# so a reset link never lands in a server log.
EMAIL_DELIVERY_BACKEND = os.environ.get("EMAIL_BACKEND") or (
    "django.core.mail.backends.smtp.EmailBackend" if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend" if DEBUG
    else "django.core.mail.backends.dummy.EmailBackend"
)
# Set to one address and every email goes there instead of to the people it
# names, so a test system holding real-looking addresses mails nobody else.
EMAIL_SEND_ONLY_TO = os.environ.get("EMAIL_SEND_ONLY_TO", "")
EMAIL_BACKEND = "apps.common.mail.SendOnlyToBackend" if EMAIL_SEND_ONLY_TO else EMAIL_DELIVERY_BACKEND
# Where the file backend writes each message, when EMAIL_BACKEND names it.
EMAIL_FILE_PATH = os.environ.get("EMAIL_FILE_PATH", str(BASE_DIR / "sent_mail"))
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "true").lower() == "true"
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL", f"Resolver <{EMAIL_HOST_USER or 'resolver@localhost'}>"
)

# The web app's address, for links in emails.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
# How long a password reset link works, in seconds.
PASSWORD_RESET_TIMEOUT = 60 * 60

USE_I18N = True

USE_TZ = True


STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STATICFILES_FINDERS = [
    "django.contrib.staticfiles.finders.FileSystemFinder",
    "django.contrib.staticfiles.finders.AppDirectoriesFinder",
]

STATICFILES_DIRS = []

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

WHITENOISE_AUTOREFRESH = DEBUG
WHITENOISE_USE_FINDERS = DEBUG
WHITENOISE_MANIFEST_STRICT = False
WHITENOISE_SKIP_COMPRESS_EXTENSIONS = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "zip",
    "gz",
    "tgz",
    "bz2",
    "tbz",
    "xz",
    "br",
]
WHITENOISE_MIMETYPES = {
    ".js": "application/javascript",
    ".css": "text/css",
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Deployment origins belong in the CORS_ALLOWED_ORIGINS env var, not here: a
# hard-coded hostname makes local and deployed builds diverge silently.

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        # 5173 = vite dev, 4173 = vite preview (PWA/phone testing)
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if o.strip()
]

CORS_ALLOW_CREDENTIALS = True

# The report downloads name their file here; a browser hides it otherwise.
CORS_EXPOSE_HEADERS = ["Content-Disposition"]

SIMPLE_JWT = {
    # Short-lived on purpose: jwt_refresh() re-derives role and scope claims from
    # the DB, so this bounds how long a stale role can be acted on.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    # Each token carries a hash of the password, so changing it ends every
    # session at once, access tokens included.
    "CHECK_REVOKE_TOKEN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "sub",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "TOKEN_TYPE_CLAIM": "token_type",
    "JTI_CLAIM": "jti",
}
