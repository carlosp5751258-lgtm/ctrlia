// comprobador-settings.en.js — Ctrl+IA, English page (logic copied from web/repos-nuevos/ctrlia-comprobador-settings/en/checker.js; site interface). Nothing leaves your browser.
'use strict';

const DOC = 'https://code.claude.com/docs/en/';
// Programs that run whatever comes after them: allowing them with * is the same as allowing all of Bash.
const RUNNERS = /^(sudo|env|bash|sh|zsh|fish|dash|python3?|python\d\.\d+|node|deno|bun|bunx|ruby|perl|php|lua|npx|uvx|pnpx|pnpm dlx|yarn dlx|npm exec|uv run|poetry run|pipx run|docker (exec|run)|podman (exec|run)|kubectl exec|ssh|eval|exec|xargs|make|just|direnv exec|devbox run|mise exec|nix-shell|nix run|git|watch|setsid|flock|find)$/;
// What comes after the program is open if it's just * or an option followed by * (-c *, -m *, --eval *).
const OPEN_REST = /^(\*|--?[\w-]+ \*)$/; // shortcut: heuristic on the rule text, not a shell parser

const bashRule = (r) => { const m = /^Bash\((.*)\)$/s.exec(r); return m ? m[1].replace(/:\*$/, ' *') : null; };

// text: pasted content. scope: 'user' | 'project' | 'local'. Returns {error} or {findings:[{id,level,text,doc}]}.
function analyze(text, scope) {
  let s;
  try { s = JSON.parse(text); } catch (e) { return { error: 'Not valid JSON: ' + e.message + '. Note: settings.json does not allow comments or trailing commas.' }; }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: 'The file must be a JSON object { … }.' };
  const p = (s.permissions && typeof s.permissions === 'object') ? s.permissions : {};
  const list = (k) => (Array.isArray(p[k]) ? p[k].filter((x) => typeof x === 'string') : []);
  const allow = list('allow'), deny = list('deny'), ask = list('ask');
  const h = [];
  const add = (id, level, text, doc) => h.push({ id, level, text, doc: DOC + doc });
  const shared = scope === 'project';

  // R01-R02 bypassPermissions
  if (p.defaultMode === 'bypassPermissions') {
    if (scope === 'user') add('R01', 'critical', 'defaultMode "bypassPermissions": all your sessions start with no permission checks at all. The docs limit it to isolated containers or virtual machines.', 'permission-modes');
    else add('R01', 'info', 'defaultMode "bypassPermissions" in project or local settings has no effect: the session starts in Manual mode. Remove it to avoid confusion.', 'permission-modes');
  }
  if (p.defaultMode === 'auto' && scope !== 'user') add('R02', 'info', 'defaultMode "auto" in .claude/settings(.local).json is ignored; put it in ~/.claude/settings.json if you want it.', 'permission-modes');
  if (s.skipDangerousModePermissionPrompt === true) add('R03', 'high', 'skipDangerousModePermissionPrompt: true removes the confirmation before entering bypassPermissions.', 'settings-reference');
  if (!p.disableBypassPermissionsMode && scope === 'user') add('R04', 'info', 'You can block bypassPermissions entirely with "permissions": { "disableBypassPermissionsMode": "disable" }.', 'settings-reference');

  // R05-R08 Bash allow rules
  for (const r of allow) {
    if (r === 'Bash' || r === 'Bash(*)') { add('R05', 'critical', '"' + r + '" in allow approves any shell command without asking.', 'permissions'); continue; }
    const b = bashRule(r);
    if (b === null) continue;
    const i = b.indexOf(' ');
    const prog = i < 0 ? b.replace(/\*$/, '') : b.slice(0, i);
    const prog2 = b.split(/\s+/).slice(0, 2).join(' ');
    const rest = i < 0 ? (b.endsWith('*') ? '*' : '') : b.slice(i + 1);
    const rest2 = b.split(/\s+/).slice(2).join(' ');
    if ((RUNNERS.test(prog) && OPEN_REST.test(rest)) || (RUNNERS.test(prog2) && OPEN_REST.test(rest2)))
      add('R06', 'high', '"' + r + '" amounts to running arbitrary code: ' + prog + ' runs whatever comes after it. Write the exact command (e.g. Bash(python3 -m pytest *)).', 'permissions');
    if (/^\*/.test(b) || /^\S+ \*\s+\S/.test(b)) add('R07', 'medium', '"' + r + '" has a * before the subcommand: it also approves options like git -c, which run programs. Put the * at the end.', 'permissions');
    if (/^\S+\*$/.test(b) || /^\S+ \S+\*$/.test(b)) add('R08', 'low', '"' + r + '" has no space before the *: Bash(ls*) also approves lsof. Use "' + b.replace(/\*$/, ' *') + '".', 'permissions');
  }
  // R09 secrets
  const covers = (re) => deny.some((r) => re.test(r));
  if (!covers(/^Read\((\.\/)?(\*\*\/)?\.env(\*|\.\*)?\)$/)) add('R09', 'high', 'No deny for .env: add "Read(.env)" and "Read(.env.*)" (a bare name covers any depth). It blocks Claude\'s tools and cat/head/sed, not a script that opens the file: for that, use the sandbox.', 'permissions');
  else if (!covers(/^Read\(.*\.env\.\*\)$/) && !covers(/^Read\(.*\.env\*\)$/)) add('R10', 'low', 'You have a deny for .env but not for .env.local, .env.production…: add "Read(.env.*)".', 'permissions');
  // R11 network deny used as a boundary
  for (const r of deny.concat(ask)) {
    const b = bashRule(r);
    if (b && /^(curl|wget)\b/.test(b)) { add('R11', 'medium', '"' + r + '" is not a network block: it does not stop /usr/bin/curl, sh -c "curl …" or other programs. To really block the network, turn on the sandbox with its domain list.', 'sandboxing'); break; }
  }
  // R12 rules that never match
  for (const r of allow.concat(deny, ask)) if (/^(Write|NotebookEdit|Glob|MultiEdit)\(.+\)$/.test(r)) add('R12', 'medium', '"' + r + '" never matches: paths are only checked with Edit(...) and Read(...). If it was a deny, it does not protect you.', 'permissions');
  // R13-R15 MCP and web
  if (s.enableAllProjectMcpServers === true) add('R13', 'high', 'enableAllProjectMcpServers: true approves without asking every server in .mcp.json' + (scope === 'user' ? ' of any repository you open.' : ' (in the project file, once you accept to trust the folder).'), 'settings-reference');
  for (const r of allow) {
    if (r === 'mcp__*' || r === 'mcp__*__*') add('R14', 'high', '"' + r + '" approves every tool of every MCP server.', 'permissions');
    if (r === 'WebFetch' || r === 'WebFetch(domain:*)') add('R15', 'medium', '"' + r + '" lets it download any URL without asking: a door for injected instructions. Limit it to specific domains.', 'permissions');
  }
  // R16 directories that are too broad
  for (const d of (Array.isArray(p.additionalDirectories) ? p.additionalDirectories : []))
    if (typeof d === 'string' && /^(\/|~\/?|\$HOME\/?|\/home\/[^/]+\/?|C:\\?\\?)$/i.test(d.trim())) add('R16', 'high', 'additionalDirectories "' + d + '" gives file access to the whole disk or your whole home.', 'permissions');
  // R17 secrets in env
  const env = (s.env && typeof s.env === 'object') ? s.env : {};
  for (const [k, v] of Object.entries(env))
    if (/(KEY|TOKEN|SECRET|PASSWORD|PASS)$/i.test(k) && typeof v === 'string' && v.length >= 8)
      add('R17', shared ? 'critical' : 'high', 'env.' + k + ' has a value that looks like a secret' + (shared ? ' in a file that is committed to git' : '') + '. Use system environment variables or apiKeyHelper.', 'settings-reference');
  // R18 hooks and helpers from the repository
  if (shared && (s.hooks || s.apiKeyHelper || s.statusLine)) add('R18', 'info', 'This file runs commands (hooks, apiKeyHelper or statusLine). A repository\'s hooks and helpers run even with claude -p in an untrusted folder: review them before you clone and run.', 'permissions');
  // R19 sandbox
  const sb = s.sandbox || {};
  if (sb.enabled !== true) add('R19', 'info', 'Sandbox turned off. It is the only thing that blocks file reads and network for every process, not just for Claude\'s tools (/sandbox).', 'sandboxing');
  else if (sb.allowUnsandboxedCommands !== false) add('R20', 'low', 'With the sandbox on, Claude can retry outside it (allowUnsandboxedCommands is true by default). Set it to false for strict mode.', 'settings-reference');
  if (shared && allow.length) add('R21', 'info', 'The allow rules in this file only apply once you accept to trust the folder; deny and ask always apply.', 'permissions');
  return { findings: h };
}

if (typeof module !== 'undefined') module.exports = { analyze };

// ---------- Interface (browser only; loaded only on the checker page) ----------
if (typeof document !== 'undefined' && document.getElementById('cs-analizar')) {
  const SCOPES = { proyecto: 'project', usuario: 'user', local: 'local' };
  const area = document.getElementById('cs-texto');
  const scope = document.getElementById('cs-ambito');
  const out = document.getElementById('cs-resultado');
  const status = document.getElementById('cs-estado');
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  document.getElementById('cs-analizar').addEventListener('click', () => {
    const r = analyze(area.value, SCOPES[scope.value] || scope.value);
    if (r.error) { out.replaceChildren(); status.textContent = r.error; area.focus(); return; }
    if (!r.findings.length) {
      out.replaceChildren();
      status.textContent = 'No findings with these rules. Not a guarantee: also review hooks and MCP servers.';
      return;
    }
    const n = (k) => r.findings.filter((x) => x.level === k).length;
    status.textContent = r.findings.length + ' finding(s): ' + Object.keys(order).filter(n).map((k) => n(k) + ' ' + k).join(', ') + '.';
    out.replaceChildren(...r.findings.sort((a, b) => order[a.level] - order[b.level]).map((x) => {
      const li = document.createElement('li');
      li.className = 'aviso-' + ({ critical: 'critico', high: 'alto', medium: 'medio', low: 'bajo' }[x.level] || x.level);   // site CSS classes
      li.append(Object.assign(document.createElement('strong'), { textContent: x.id + ' · ' + x.level + ': ' }), x.text + ' ',
        Object.assign(document.createElement('a'), { href: x.doc, textContent: 'Docs', rel: 'noopener' }));
      return li;
    }));
  });
}
