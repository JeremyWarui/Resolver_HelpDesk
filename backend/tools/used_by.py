"""Generate a 'Used by' block for every app module, from real imports.

Reads the AST of every module under apps/, records which app modules import
which symbols from which other app module, and rewrites each module docstring
so it ends with an accurate 'Used by:' list.

    python tools/used_by.py . report   # print, change nothing
    python tools/used_by.py . apply    # add a block where there is none
    python tools/used_by.py . force    # replace every block, stale ones included

`tests/test_used_by_headers.py` is the gate: it fails when a header names a
module that no longer imports it, or omits one that does. When it fails, run
`force` rather than editing the block by hand.

A module with no docstring needs a one-line summary in `summaries.py` first;
the run reports which ones are missing one.
"""
import ast
import collections

from summaries import SUMMARIES
import pathlib
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
MODE = sys.argv[2] if len(sys.argv) > 2 else "report"

APPS = ROOT / "apps"


def modname(path):
    """apps/tickets/lifecycle.py -> tickets.lifecycle"""
    rel = path.relative_to(APPS).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


files = [
    p
    for p in APPS.rglob("*.py")
    if "migrations" not in p.parts
    and "__pycache__" not in p.parts
    and p.name != "__init__.py"
]
files.sort()

# importer module -> {imported module -> [symbols]}
edges = collections.defaultdict(lambda: collections.defaultdict(list))

for p in files:
    src = p.read_text(encoding="utf-8")
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        print("SYNTAX", p, e)
        continue
    me = modname(p)
    pkg = me.rsplit(".", 1)[0] if "." in me else me
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level:
            # relative: `from . import views` / `from .views import X`
            base = pkg
            if node.module:
                target = f"{base}.{node.module}"
                names = [a.name for a in node.names]
            else:
                # `from . import views, urls` — each name IS a module
                for a in node.names:
                    t = f"{base}.{a.name}"
                    if t != me:
                        edges[me][t].append("(module)")
                continue
        elif node.module and node.module.startswith("apps."):
            target = node.module[len("apps."):]
            names = [a.name for a in node.names]
        else:
            continue
        if target == me:
            continue
        edges[me][target].extend(names)

# invert: module -> {importer -> symbols}
used_by = collections.defaultdict(dict)
for importer, targets in edges.items():
    for target, names in targets.items():
        seen, ordered = set(), []
        for n in names:
            if n not in seen:
                seen.add(n)
                ordered.append(n)
        used_by[target][importer] = ordered


def block_for(mod):
    consumers = used_by.get(mod)
    if not consumers:
        return None
    width = max(len(k) for k in consumers) + 2
    lines = ["Used by:"]
    for importer in sorted(consumers):
        syms = consumers[importer]
        shown = ", ".join(syms[:4]) + (", …" if len(syms) > 4 else "")
        lines.append(f"    {importer.ljust(width)}{shown}")
    return "\n".join(lines)


changed, skipped, no_consumers = [], [], []

for p in files:
    mod = modname(p)
    block = block_for(mod)
    if block is None:
        no_consumers.append(mod)
        continue

    src = p.read_text(encoding="utf-8")
    tree = ast.parse(src)
    doc = ast.get_docstring(tree, clean=False)

    if "Used by:" in (doc or "") and MODE != "force":
        skipped.append((mod, "already has one"))
        continue

    if "Used by:" in (doc or ""):
        # force: drop the stale block, then fall through and regenerate.
        node = tree.body[0]
        lines = src.split("\n")
        start, end = node.lineno - 1, node.end_lineno - 1
        cut = next(i for i in range(start, end + 1) if lines[i].strip() == "Used by:")
        while cut > start and lines[cut - 1].strip() == "":
            cut -= 1
        quote = '"""' if '"""' in lines[end] else "'''"
        lines[cut:end] = []
        lines[cut] = quote
        src = "\n".join(lines)
        p.write_text(src, encoding="utf-8")
        tree = ast.parse(src)
        doc = ast.get_docstring(tree, clean=False)

    if doc is None:
        summary = SUMMARIES.get(mod)
        if summary is None:
            skipped.append((mod, "no docstring and no summary written"))
            continue
        # Prepend a fresh docstring above the first statement.
        lines = src.split("\n")
        insert_at = 0
        header = ['"""' + summary.split("\n")[0]]
        header += summary.split("\n")[1:]
        header += ["", *block.split("\n"), '"""', ""]
        lines[insert_at:insert_at] = header
        if MODE in ("apply", "force"):
            p.write_text("\n".join(lines), encoding="utf-8")
        changed.append(mod + "  (new docstring)")
        continue

    node = tree.body[0]
    lines = src.split("\n")
    # docstring occupies lines node.lineno .. node.end_lineno (1-indexed)
    start, end = node.lineno - 1, node.end_lineno - 1
    closing = lines[end]
    quote = '"""' if '"""' in closing else "'''"

    if closing.strip() == quote:
        # multi-line docstring: insert before the closing quotes
        lines[end:end] = ["", *block.split("\n")]
    else:
        # single-line docstring: expand it
        text = closing.rstrip()
        assert text.endswith(quote), text
        lines[end] = text[: -len(quote)].rstrip()
        lines[end + 1: end + 1] = ["", *block.split("\n"), quote]

    if MODE in ("apply", "force"):
        p.write_text("\n".join(lines), encoding="utf-8")
    changed.append(mod)

print(f"=== would rewrite {len(changed)} modules ===")
for m in changed:
    print(" ", m)
print(f"\n=== skipped {len(skipped)} ===")
for m, why in skipped:
    print(f"  {m}: {why}")
print(f"\n=== {len(no_consumers)} modules nothing in apps/ imports (leaf: views, urls, commands) ===")
print(" ", ", ".join(no_consumers))
print(f"\nmode={MODE}")
