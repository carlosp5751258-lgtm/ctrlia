// comprobador-settings.js — Ctrl+IA (copia de web/repos-nuevos/ctrlia-comprobador-settings/comprobador.js; misma lógica, interfaz de ctrlia.dev). Analiza un .claude/settings.json en tu navegador; no se envía nada a ningún servidor.
'use strict';

const DOC = 'https://code.claude.com/docs/en/';
// Programas que ejecutan lo que va detrás: permitirlos con * equivale a permitir Bash entero.
const EJECUTORES = /^(sudo|env|bash|sh|zsh|fish|dash|python3?|python\d\.\d+|node|deno|bun|bunx|ruby|perl|php|lua|npx|uvx|pnpx|pnpm dlx|yarn dlx|npm exec|uv run|poetry run|pipx run|docker (exec|run)|podman (exec|run)|kubectl exec|ssh|eval|exec|xargs|make|just|direnv exec|devbox run|mise exec|nix-shell|nix run|git|watch|setsid|flock|find)$/;
// Lo que va detrás del programa queda libre si es solo * o una opción seguida de * (-c *, -m *, --eval *).
const RESTO_LIBRE = /^(\*|--?[\w-]+ \*)$/; // shortcut: heurística sobre el texto de la regla, no un parser de shell

const reglaBash = (r) => { const m = /^Bash\((.*)\)$/s.exec(r); return m ? m[1].replace(/:\*$/, ' *') : null; };

// texto: contenido pegado. ambito: 'usuario' | 'proyecto' | 'local'. Devuelve {error} o {hallazgos:[{id,nivel,texto,doc}]}.
function analizar(texto, ambito) {
  let s;
  try { s = JSON.parse(texto); } catch (e) { return { error: 'No es JSON válido: ' + e.message + '. Ojo: settings.json no admite comentarios ni comas finales.' }; }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: 'El archivo debe ser un objeto JSON { … }.' };
  const p = (s.permissions && typeof s.permissions === 'object') ? s.permissions : {};
  const lista = (k) => (Array.isArray(p[k]) ? p[k].filter((x) => typeof x === 'string') : []);
  const allow = lista('allow'), deny = lista('deny'), ask = lista('ask');
  const h = [];
  const add = (id, nivel, texto, doc) => h.push({ id, nivel, texto, doc: DOC + doc });
  const compartido = ambito === 'proyecto';

  // R01-R02 bypassPermissions
  if (p.defaultMode === 'bypassPermissions') {
    if (ambito === 'usuario') add('R01', 'crítico', 'defaultMode «bypassPermissions»: todas tus sesiones arrancan sin ninguna comprobación de permisos. La doc lo limita a contenedores o máquinas virtuales aisladas.', 'permission-modes');
    else add('R01', 'info', 'defaultMode «bypassPermissions» en settings de proyecto o local no tiene efecto: la sesión arranca en modo Manual. Quítalo para no confundir.', 'permission-modes');
  }
  if (p.defaultMode === 'auto' && ambito !== 'usuario') add('R02', 'info', 'defaultMode «auto» en .claude/settings(.local).json se ignora; ponlo en ~/.claude/settings.json si lo quieres.', 'permission-modes');
  if (s.skipDangerousModePermissionPrompt === true) add('R03', 'alto', 'skipDangerousModePermissionPrompt: true quita la confirmación antes de entrar en bypassPermissions.', 'settings-reference');
  if (!p.disableBypassPermissionsMode && ambito === 'usuario') add('R04', 'info', 'Puedes impedir bypassPermissions del todo con "permissions": { "disableBypassPermissionsMode": "disable" }.', 'settings-reference');

  // R05-R08 reglas allow de Bash
  for (const r of allow) {
    if (r === 'Bash' || r === 'Bash(*)') { add('R05', 'crítico', '«' + r + '» en allow aprueba cualquier comando de shell sin preguntar.', 'permissions'); continue; }
    const b = reglaBash(r);
    if (b === null) continue;
    const i = b.indexOf(' ');
    const prog = i < 0 ? b.replace(/\*$/, '') : b.slice(0, i);
    const prog2 = b.split(/\s+/).slice(0, 2).join(' ');
    const resto = i < 0 ? (b.endsWith('*') ? '*' : '') : b.slice(i + 1);
    const resto2 = b.split(/\s+/).slice(2).join(' ');
    if ((EJECUTORES.test(prog) && RESTO_LIBRE.test(resto)) || (EJECUTORES.test(prog2) && RESTO_LIBRE.test(resto2)))
      add('R06', 'alto', '«' + r + '» equivale a ejecutar código arbitrario: ' + prog + ' ejecuta lo que va detrás. Escribe el comando exacto (p. ej. Bash(python3 -m pytest *)).', 'permissions');
    if (/^\*/.test(b) || /^\S+ \*\s+\S/.test(b)) add('R07', 'medio', '«' + r + '» tiene un * antes del subcomando: también aprueba opciones como git -c, que ejecutan programas. Pon el * al final.', 'permissions');
    if (/^\S+\*$/.test(b) || /^\S+ \S+\*$/.test(b)) add('R08', 'bajo', '«' + r + '» no tiene espacio antes del *: Bash(ls*) también aprueba lsof. Usa «' + b.replace(/\*$/, ' *') + '».', 'permissions');
  }
  // R09 secretos
  const cubre = (re) => deny.some((r) => re.test(r));
  if (!cubre(/^Read\((\.\/)?(\*\*\/)?\.env(\*|\.\*)?\)$/)) add('R09', 'alto', 'No hay deny para .env: añade "Read(.env)" y "Read(.env.*)" (un nombre suelto cubre cualquier profundidad). Bloquea las herramientas de Claude y cat/head/sed, no un script que abra el archivo: para eso, el sandbox.', 'permissions');
  else if (!cubre(/^Read\(.*\.env\.\*\)$/) && !cubre(/^Read\(.*\.env\*\)$/)) add('R10', 'bajo', 'Tienes deny para .env pero no para .env.local, .env.production…: añade "Read(.env.*)".', 'permissions');
  // R11 deny de red como frontera
  for (const r of deny.concat(ask)) {
    const b = reglaBash(r);
    if (b && /^(curl|wget)\b/.test(b)) { add('R11', 'medio', '«' + r + '» no es un bloqueo de red: no para /usr/bin/curl, sh -c "curl …" ni otros programas. Para bloquear red de verdad, activa el sandbox con su lista de dominios.', 'sandboxing'); break; }
  }
  // R12 reglas que nunca coinciden
  for (const r of allow.concat(deny, ask)) if (/^(Write|NotebookEdit|Glob|MultiEdit)\(.+\)$/.test(r)) add('R12', 'medio', '«' + r + '» nunca coincide: las rutas solo se comprueban con Edit(...) y Read(...). Si era un deny, no te protege.', 'permissions');
  // R13-R15 MCP y web
  if (s.enableAllProjectMcpServers === true) add('R13', 'alto', 'enableAllProjectMcpServers: true aprueba sin preguntar todos los servidores de .mcp.json' + (ambito === 'usuario' ? ' de cualquier repositorio que abras.' : ' (en el archivo de proyecto, una vez aceptas confiar en la carpeta).'), 'settings-reference');
  for (const r of allow) {
    if (r === 'mcp__*' || r === 'mcp__*__*') add('R14', 'alto', '«' + r + '» aprueba todas las herramientas de todos los servidores MCP.', 'permissions');
    if (r === 'WebFetch' || r === 'WebFetch(domain:*)') add('R15', 'medio', '«' + r + '» permite descargar cualquier URL sin preguntar: puerta para instrucciones inyectadas. Limita a dominios concretos.', 'permissions');
  }
  // R16 directorios demasiado amplios
  for (const d of (Array.isArray(p.additionalDirectories) ? p.additionalDirectories : []))
    if (typeof d === 'string' && /^(\/|~\/?|\$HOME\/?|\/home\/[^/]+\/?|C:\\?\\?)$/i.test(d.trim())) add('R16', 'alto', 'additionalDirectories «' + d + '» da acceso de archivos a todo el disco o a todo tu home.', 'permissions');
  // R17 secretos en env
  const env = (s.env && typeof s.env === 'object') ? s.env : {};
  for (const [k, v] of Object.entries(env))
    if (/(KEY|TOKEN|SECRET|PASSWORD|PASS)$/i.test(k) && typeof v === 'string' && v.length >= 8)
      add('R17', compartido ? 'crítico' : 'alto', 'env.' + k + ' tiene un valor que parece un secreto' + (compartido ? ' en un archivo que se sube a git' : '') + '. Usa variables del sistema o apiKeyHelper.', 'settings-reference');
  // R18 hooks y helpers del repositorio
  if (compartido && (s.hooks || s.apiKeyHelper || s.statusLine)) add('R18', 'info', 'Este archivo ejecuta comandos (hooks, apiKeyHelper o statusLine). Los hooks y helpers de un repositorio se ejecutan incluso con claude -p en una carpeta no confiada: revísalos antes de clonar y ejecutar.', 'permissions');
  // R19 sandbox
  const sb = s.sandbox || {};
  if (sb.enabled !== true) add('R19', 'info', 'Sandbox desactivado. Es lo único que bloquea lectura de archivos y red para cualquier proceso, no solo para las herramientas de Claude (/sandbox).', 'sandboxing');
  else if (sb.allowUnsandboxedCommands !== false) add('R20', 'bajo', 'Con el sandbox activo, Claude puede reintentar fuera de él (allowUnsandboxedCommands es true por defecto). Ponlo en false para el modo estricto.', 'settings-reference');
  if (compartido && allow.length) add('R21', 'info', 'Las reglas allow de este archivo solo se aplican cuando aceptas confiar en la carpeta; deny y ask se aplican siempre.', 'permissions');
  return { hallazgos: h };
}

if (typeof module !== 'undefined') module.exports = { analizar };

// ---------- Interfaz (solo en el navegador; la carga solo la página del comprobador) ----------
if (typeof document !== 'undefined' && document.getElementById('cs-analizar')) {
  const en = document.documentElement.lang === 'en';
  const area = document.getElementById('cs-texto');
  const ambito = document.getElementById('cs-ambito');
  const salida = document.getElementById('cs-resultado');
  const estado = document.getElementById('cs-estado');
  const orden = { 'crítico': 0, alto: 1, medio: 2, bajo: 3, info: 4 };
  document.getElementById('cs-analizar').addEventListener('click', () => {
    const r = analizar(area.value, ambito.value);
    if (r.error) { salida.replaceChildren(); estado.textContent = r.error; area.focus(); return; }
    if (!r.hallazgos.length) {
      salida.replaceChildren();
      estado.textContent = 'Sin hallazgos con estas reglas. No es una garantía: revisa también hooks y servidores MCP.';
      return;
    }
    const n = (k) => r.hallazgos.filter((x) => x.nivel === k).length;
    estado.textContent = (en ? r.hallazgos.length + ' finding(s): ' : r.hallazgos.length + ' hallazgo(s): ')
      + Object.keys(orden).filter(n).map((k) => n(k) + ' ' + k).join(', ') + '.';
    salida.replaceChildren(...r.hallazgos.sort((a, b) => orden[a.nivel] - orden[b.nivel]).map((x) => {
      const li = document.createElement('li');
      li.className = 'aviso-' + x.nivel.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      li.append(Object.assign(document.createElement('strong'), { textContent: x.id + ' · ' + x.nivel + ': ' }), x.texto + ' ',
        Object.assign(document.createElement('a'), { href: x.doc, textContent: en ? 'Docs' : 'Documentación', rel: 'noopener' }));
      return li;
    }));
  });
}
