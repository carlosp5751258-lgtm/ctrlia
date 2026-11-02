// generador-claude-md.en.js — Ctrl+IA, English page (logic copied from web/repos-nuevos/ctrlia-generador-claude-md/en/generator.js; site interface). Nothing leaves your browser.
// Pure logic (generate, validate) + interface. No dependencies. CSP: served as its own file, no inline code.
'use strict';

const LINE_LIMIT = 200; // official recommendation: fewer than 200 lines per file
const VAGUE = [/good code/i, /clean code/i, /best practices/i, /format (it |things )?(well|properly|nicely)/i,
  /be careful/i, /keep (it |things |the code )?(tidy|organi[sz]ed|clean)/i, /write tests?$/i];
const SECRETS = [/sk-ant-[\w-]{10,}/, /sk-[A-Za-z0-9]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(password|passwd|token|secret)\s*[:=]\s*\S{6,}/i];

const lines = (txt) => (txt || '').split('\n').map((l) => l.trim()).filter(Boolean);
const command = (c) => (c ? '`' + c.replace(/`/g, '') + '`' : '');

function section(title, items) {
  return items.length ? ['', '## ' + title, ...items.map((i) => '- ' + i)] : [];
}

// d: object with the form fields. Returns the Markdown text of AGENTS.md or CLAUDE.md.
function body(d) {
  const cmds = [
    ['Install', d.install], ['Dev server', d.dev], ['All tests', d.test],
    ['Single test', d.oneTest], ['Lint', d.lint], ['Types', d.types], ['Build', d.build],
  ].filter(([, c]) => c && c.trim()).map(([n, c]) => n + ': ' + command(c.trim()));
  const done = lines(d.done);
  if (!done.length && d.test) done.push('Passes ' + command(d.test.trim()) + ' with no errors.');
  const git = [];
  if (d.branches) git.push('Branches: ' + d.branches.trim());
  if (d.commits) git.push('Commits: ' + d.commits.trim());
  const out = ['# Project: ' + d.name.trim() + (d.stack ? ' (' + d.stack.trim() + ')' : '')];
  if (d.description) out.push('', d.description.trim());
  out.push(...section('Commands', cmds), ...section('Definition of done', done),
    ...section('Conventions (what you can\'t see in the code)', lines(d.conventions)),
    ...section('Do not touch', lines(d.doNotTouch).map((r) => command(r) + ' (ask before changing it)')),
    ...section('Known gotchas', lines(d.gotchas)), ...section('Git', git));
  if (d.language) out.push('', '## Language', '- Reply and write comments in ' + d.language.trim() + '.');
  return out.join('\n') + '\n';
}

// output: 'claude' | 'agents' | 'both'. Returns [{name, text}].
function generate(d) {
  const base = body(d);
  const extra = lines(d.claudeOnly);
  if (d.output === 'agents') return [{ name: 'AGENTS.md', text: base }];
  if (d.output === 'both') {
    const claude = ['@AGENTS.md', ...section('Claude Code', extra)].join('\n') + '\n';
    return [{ name: 'AGENTS.md', text: base }, { name: 'CLAUDE.md', text: claude }];
  }
  return [{ name: 'CLAUDE.md', text: extra.length ? base + section('Claude Code', extra).join('\n') + '\n' : base }];
}

// Returns [{level:'error'|'warning', text}]. With errors, the download is not offered.
function validate(d, files) {
  const r = [];
  if (!d.name || !d.name.trim()) r.push({ level: 'error', text: 'The project name is missing.' });
  if (!d.test || !d.test.trim()) r.push({ level: 'warning', text: 'Without a test command, Claude doesn\'t know how to check its work. It\'s the most useful part of the file.' });
  const all = Object.values(d).filter((v) => typeof v === 'string').join('\n');
  if (SECRETS.some((re) => re.test(all))) r.push({ level: 'error', text: 'It looks like you pasted a key or password. Remove it: this file gets committed to git.' });
  for (const l of lines(d.conventions).concat(lines(d.done))) {
    if (VAGUE.some((re) => re.test(l))) r.push({ level: 'warning', text: 'Vague rule: "' + l + '". Write something verifiable ("2-space indentation", "run npm test").' });
  }
  for (const l of lines(d.conventions)) {
    if (/\b(never|forbidden)\b/i.test(l)) r.push({ level: 'warning', text: 'No-exceptions prohibitions work better as permissions or hooks than in this file: "' + l + '".' });
    const imp = l.match(/(^|\s)@(\S+)/);
    if (imp && /["']/.test(imp[2])) r.push({ level: 'warning', text: 'An @path import in quotes is not imported. For spaces use "\\ ".' });
    if (imp && d.output !== 'claude') r.push({ level: 'warning', text: 'Claude Code expands "@' + imp[2] + '" inside AGENTS.md, but other tools may read it as plain text: copy the essentials into the file.' });
  }
  for (const a of files) {
    const n = a.text.split('\n').length;
    if (n > LINE_LIMIT) r.push({ level: 'warning', text: a.name + ' has ' + n + ' lines; the official recommendation is fewer than ' + LINE_LIMIT + '.' });
  }
  if (d.output === 'both' && d.local) r.push({ level: 'warning', text: 'Remember: a CLAUDE.local.md makes Claude stop reading AGENTS.md on its own; with the @AGENTS.md in the generated CLAUDE.md nothing changes.' });
  return r;
}

if (typeof module !== 'undefined') module.exports = { generate, validate, body };

// ---------- Interface (browser only; loaded only on the generator page). The site form keeps its field names: map them. ----------
if (typeof document !== 'undefined' && document.getElementById('gen-form')) {
  const NAMES = { nombre: 'name', descripcion: 'description', instalar: 'install', unTest: 'oneTest', tipos: 'types', terminado: 'done',
    convenciones: 'conventions', noTocar: 'doNotTouch', trampas: 'gotchas', ramas: 'branches', idioma: 'language', salida: 'output', soloClaude: 'claudeOnly' };
  const form = document.getElementById('gen-form');
  const preview = document.getElementById('gen-vista');
  const warnings = document.getElementById('gen-avisos');
  const status = document.getElementById('gen-estado');
  const buttons = document.getElementById('gen-descargas');
  const data = () => {
    const d = {};
    for (const [k, v] of new FormData(form).entries()) d[NAMES[k] || k] = v;
    if (d.output === 'ambos') d.output = 'both';
    return d;
  };
  let summary = '';
  function render() {
    const d = data();
    const files = generate(d);
    const res = validate(d, files);
    const errors = res.filter((x) => x.level === 'error').length;
    warnings.replaceChildren(...res.map((x) => Object.assign(document.createElement('li'), {
      textContent: (x.level === 'error' ? 'Error: ' : 'Warning: ') + x.text, className: 'aviso-' + (x.level === 'error' ? 'error' : 'aviso') })));
    preview.textContent = files.map((a) => '===== ' + a.name + ' =====\n' + a.text).join('\n');
    const now = errors ? errors + ' error(s): fix them to download.'
      : 'Ready: ' + files.map((a) => a.name).join(' + ') + (res.length ? ' (' + res.length + ' warning(s))' : '');
    if (now !== summary) status.textContent = summary = now;   // announce only when it changes
    buttons.replaceChildren(...files.map((a) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'boton boton-oscuro boton-chico',
        textContent: 'Download ' + a.name, disabled: errors > 0 });
      b.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([a.text], { type: 'text/markdown;charset=utf-8' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: a.name });
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      return b;
    }));
  }
  form.addEventListener('input', render);
  form.addEventListener('submit', (ev) => ev.preventDefault());
  render();
}
