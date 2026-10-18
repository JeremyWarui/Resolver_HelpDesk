"""Test settings on the PostgreSQL in DATABASE_URL, for the concurrency tests.

Django runs them in its own `test_<name>` database, created and dropped around
the run, so the working database is never touched.
"""

from .settings import *  # noqa: F401, F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
