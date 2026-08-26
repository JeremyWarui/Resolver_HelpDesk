"""Every module's `Contents:` index must match what the module actually defines.

The index is the first thing a reader trusts, so a name that has been renamed
or deleted is worse than no index at all. Like `Used by:`, this reads the AST
rather than the prose, so the check cannot be satisfied by writing more of it.

Only modules that carry a `Contents:` header are checked, so apps convert one at
a time without breaking the suite.
"""

import ast
import pathlib
import re

import pytest

APPS = pathlib.Path(__file__).resolve().parent.parent / "apps"

# Entries are indented four spaces: "    name    purpose". Deeper indents are
# continuation lines and sub-entries ("      .clean()"), which carry no name to
# check. A dotted entry ("CustomUser.role") names a member of a class.
ENTRY = re.compile(r"^ {4}([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s")


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


def _listed(doc):
    """The names the `Contents:` block claims, in order."""
    tail = doc.split("Contents:", 1)[1]
    names = []
    for line in tail.split("\n"):
        if line.strip() and not line.startswith("    "):
            break  # the block ended — "Used by:" or a following paragraph
        m = ENTRY.match(line)
        if m:
            names.append(m.group(1))
    return names


def _defined(tree):
    """Top-level names, plus `Class.member` for every class body member."""
    names = set()
    classes = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            names.add(node.name)
        elif isinstance(node, ast.ClassDef):
            names.add(node.name)
            classes.add(node.name)
            for child in node.body:
                if isinstance(
                    child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
                ):
                    names.add(f"{node.name}.{child.name}")
                elif isinstance(child, ast.Assign):
                    for target in child.targets:
                        if isinstance(target, ast.Name):
                            names.add(f"{node.name}.{target.id}")
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names, classes


# module -> (names its Contents header claims, names it defines)
INDEXED = {}
for _p in _modules():
    _tree = ast.parse(_p.read_text(encoding="utf-8"))
    _doc = ast.get_docstring(_tree, clean=False)
    if not _doc or "Contents:" not in _doc:
        continue
    INDEXED[_modname(_p)] = (_listed(_doc), _defined(_tree))


def test_some_modules_carry_a_contents_index():
    """Guard against the check silently passing because it parsed nothing."""
    assert len(INDEXED) >= 5, f"only {len(INDEXED)} modules carry a Contents index"


@pytest.mark.parametrize("module", sorted(INDEXED))
def test_every_indexed_name_exists(module):
    """No `Contents:` entry may name something the module does not define."""
    listed, (defined, _) = INDEXED[module]
    for name in listed:
        assert name in defined, (
            f"{module} indexes '{name}', which it does not define. "
            f"Update the Contents header."
        )


@pytest.mark.parametrize("module", sorted(INDEXED))
def test_no_definition_is_missing_from_the_index(module):
    """Every top-level function and class must appear in the index.

    Constants and class members are optional — list them where they earn a line.
    """
    listed, (defined, classes) = INDEXED[module]
    tree = ast.parse((APPS / pathlib.Path(*module.split("."))).with_suffix(".py").read_text(encoding="utf-8"))
    top = {
        node.name
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    missing = top - {name.split(".")[0] for name in listed}
    assert not missing, (
        f"{module} defines {sorted(missing)}, which its Contents index does not "
        f"list."
    )
