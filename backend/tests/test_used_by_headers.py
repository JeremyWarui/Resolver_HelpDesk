"""Every module's `Used by:` header must name importers that really exist.

A header that lists a module which no longer imports it is worse than no
header: it is a claim a reader will trust. This reads the AST rather than the
comments, so the check cannot be satisfied by prose.
"""

import ast
import pathlib
import re

import pytest

APPS = pathlib.Path(__file__).resolve().parent.parent / "apps"


def _modules():
    for p in sorted(APPS.rglob("*.py")):
        if "migrations" in p.parts or "__pycache__" in p.parts:
            continue
        if p.name == "__init__.py":
            continue
        yield p


def _modname(path):
    rel = path.relative_to(APPS).with_suffix("")
    return ".".join(rel.parts)


def _imports(path, me):
    """The app modules `path` imports from, resolving relative imports."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    pkg = me.rsplit(".", 1)[0] if "." in me else me
    out = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level:
            if node.module:
                out.add(f"{pkg}.{node.module}")
            else:
                out.update(f"{pkg}.{a.name}" for a in node.names)
        elif node.module and node.module.startswith("apps."):
            out.add(node.module[len("apps."):])
    return {m for m in out if m != me}


# module -> set of modules it imports, built once
IMPORT_GRAPH = {_modname(p): _imports(p, _modname(p)) for p in _modules()}

# module -> the importers its own docstring claims
CLAIMED = {}
for _p in _modules():
    _me = _modname(_p)
    _doc = ast.get_docstring(ast.parse(_p.read_text(encoding="utf-8")), clean=False)
    if not _doc or "Used by:" not in _doc:
        continue
    _tail = _doc.split("Used by:", 1)[1]
    _names = set()
    for _line in _tail.split("\n"):
        _m = re.match(r"\s{4}([a-z_][a-z0-9_.]*)\s", _line)
        if _m:
            _names.add(_m.group(1))
    CLAIMED[_me] = _names


def test_some_modules_declare_their_consumers():
    """Guard against the check silently passing because it parsed nothing."""
    assert len(CLAIMED) >= 25, f"only {len(CLAIMED)} modules carry a Used by header"


@pytest.mark.parametrize("module", sorted(CLAIMED))
def test_every_claimed_importer_really_imports_it(module):
    """No `Used by:` entry may name a module that does not import this one."""
    for claimed in sorted(CLAIMED[module]):
        assert claimed in IMPORT_GRAPH, (
            f"{module} lists '{claimed}', which is not a module in apps/"
        )
        assert module in IMPORT_GRAPH[claimed], (
            f"{module} claims '{claimed}' imports it, but {claimed} does not. "
            f"Update the Used by header."
        )


@pytest.mark.parametrize("module", sorted(CLAIMED))
def test_no_real_importer_is_missing_from_the_header(module):
    """A module that imports this one must appear in its `Used by:` list."""
    actual = {
        importer
        for importer, targets in IMPORT_GRAPH.items()
        if module in targets
    }
    missing = actual - CLAIMED[module]
    assert not missing, (
        f"{module} is imported by {sorted(missing)}, which its Used by header "
        f"does not list."
    )
