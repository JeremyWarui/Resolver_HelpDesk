"""The database comes from DATABASE_URL and nothing else."""

import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _settings_database(**env):
    script = (
        "import json, resolver.settings as s; "
        "print(json.dumps(s.DATABASES['default'], default=str))"
    )
    run = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND,
        env={**os.environ, "SECRET_KEY": "test", **env},
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(run.stdout.strip().splitlines()[-1])


def test_the_url_names_the_database_and_a_percent_encoded_password_decodes():
    db = _settings_database(
        DATABASE_URL="postgres://resolver:p%40ss%3Aword@db.example:6543/helpdesk",
        DB_NAME="ignored",
        DB_HOST="ignored",
    )

    assert db["ENGINE"] == "django.db.backends.postgresql"
    assert db["NAME"] == "helpdesk"
    assert db["USER"] == "resolver"
    assert db["PASSWORD"] == "p@ss:word"
    assert db["HOST"] == "db.example"
    assert db["PORT"] == 6543
    assert db["CONN_HEALTH_CHECKS"] is True


def test_settings_refuse_to_load_without_a_database_url():
    run = subprocess.run(
        [sys.executable, "-c", "import resolver.settings"],
        cwd=BACKEND,
        env={**os.environ, "SECRET_KEY": "test", "DATABASE_URL": ""},
        capture_output=True,
        text=True,
    )

    assert run.returncode != 0
    assert "DATABASE_URL environment variable is not set" in run.stderr
