// Every nav item must name a section its layout renders, and every section
// must be reachable from the nav.
//
// `tsc` cannot check this: both sides are string keys in object literals, and
// a mismatch leaves a sidebar entry whose click does nothing.
//
// Run: node scripts/check-nav.mjs

import fs from 'node:fs';

const NAV = 'src/constants/roleNav.ts';
const LAYOUTS = {
  user: 'src/features/user/UserLayout.tsx',
  technician: 'src/features/technician/TechnicianLayout.tsx',
  // Both supervising roles render the same layout: their nav lists are
  // identical, so one section literal is checked against both.
  hos: 'src/features/shared/SupervisorLayout.tsx',
  hod: 'src/features/shared/SupervisorLayout.tsx',
  manager: 'src/features/manager/ManagerLayout.tsx',
  admin: 'src/features/admin/AdminLayout.tsx',
};

const read = (p) => fs.readFileSync(p, 'utf8');

/** Nav item ids per role, from the ROLE_NAV literal. */
function navIds() {
  const src = read(NAV);
  const body = src.slice(src.indexOf('export const ROLE_NAV'));
  const out = {};
  for (const role of Object.keys(LAYOUTS)) {
    const at = body.indexOf(`\n  ${role}: {`);
    if (at === -1) { out[role] = null; continue; }
    const next = Object.keys(LAYOUTS)
      .map((r) => body.indexOf(`\n  ${r}: {`))
      .filter((i) => i > at)
      .sort((a, b) => a - b)[0] ?? body.length;
    let chunk = body.slice(at, next);
    // `items: SOME_LIST` names a list declared elsewhere in the file: read that.
    const named = chunk.match(/\bitems:\s*([A-Z_]+)\b/);
    if (named) {
      const start = src.indexOf(`const ${named[1]}`);
      chunk = start === -1 ? '' : src.slice(start, src.indexOf('];', start));
    }
    out[role] = [...chunk.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  }
  return out;
}

/** Section keys from a layout's `sections={...}` object literal. */
function sectionKeys(path) {
  const src = read(path);
  const at = src.indexOf('sections={(');
  if (at === -1) return null;
  const open = src.indexOf('=> ({', at);
  if (open === -1) return null;
  let depth = 0, i = open + 4, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 5, end);
  // A section's value is always a JSX element. Layouts indent them differently
  // (some align the values into a column), so the shallowest indentation in the
  // literal is what counts as top level rather than a fixed column.
  const entries = [...body.matchAll(/^([ 	]+)'?([A-Za-z][\w-]*)'?:\s*</gm)]
    .map((m) => ({ indent: m[1].length, key: m[2] }));
  if (entries.length === 0) return [];
  const top = Math.min(...entries.map((e) => e.indent));
  return entries.filter((e) => e.indent === top).map((e) => e.key);
}

const ids = navIds();
const problems = [];

for (const [role, layout] of Object.entries(LAYOUTS)) {
  const nav = ids[role];
  const sections = sectionKeys(layout);
  if (!nav) { problems.push(`${role}: no ROLE_NAV entry`); continue; }
  if (!sections) { problems.push(`${role}: could not read sections from ${layout}`); continue; }

  // A nav item that opens the wizard is an action, not a section.
  const src = read(NAV);
  const wizardIds = [...src.matchAll(/id:\s*'([^']+)'[^\n]*opensWizard/g)].map((m) => m[1]);
  const routed = nav.filter((id) => !wizardIds.includes(id));

  for (const id of routed) {
    if (!sections.includes(id)) {
      problems.push(`${role}: nav item '${id}' has no section in ${layout} — the click does nothing`);
    }
  }
  for (const key of sections) {
    if (!nav.includes(key)) {
      problems.push(`${role}: section '${key}' in ${layout} is not in ROLE_NAV — nothing links to it`);
    }
  }
  console.log(`${role.padEnd(11)} ${routed.length} nav sections, all rendered`);
}

if (problems.length) {
  console.error('\nnav check FAILED:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('\nnav check passed');
