// generador-claude-md.js — Ctrl+IA (copia de web/repos-nuevos/ctrlia-generador-claude-md/generador.js; misma lógica, interfaz de ctrlia.dev). Todo ocurre en tu navegador: no se envía nada a ningún servidor.
// Lógica pura (generar, validar) + interfaz. Sin dependencias. CSP: se sirve como archivo propio, sin código en línea.
'use strict';

const LIMITE_LINEAS = 200; // recomendación oficial: menos de 200 líneas por archivo
const VAGAS = [/buen c[oó]digo/i, /c[oó]digo limpio/i, /buenas pr[aá]cticas/i, /best practices/i,
  /formatea bien/i, /s[eé] cuidadoso/i, /mant[eé]n (el )?orden/i, /escribe tests?$/i];
const SECRETOS = [/sk-ant-[\w-]{10,}/, /sk-[A-Za-z0-9]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(password|contrase[nñ]a|token|secret)\s*[:=]\s*\S{6,}/i];

const lineas = (txt) => (txt || '').split('\n').map((l) => l.trim()).filter(Boolean);
const comando = (c) => (c ? '`' + c.replace(/`/g, '') + '`' : '');

function seccion(titulo, items) {
  return items.length ? ['', '## ' + titulo, ...items.map((i) => '- ' + i)] : [];
}

// d: objeto con los campos del formulario. Devuelve el texto Markdown de AGENTS.md o CLAUDE.md.
function cuerpo(d) {
  const cmds = [
    ['Instalar', d.instalar], ['Servidor de desarrollo', d.dev], ['Todos los tests', d.test],
    ['Un solo test', d.unTest], ['Lint', d.lint], ['Tipos', d.tipos], ['Compilar', d.build],
  ].filter(([, c]) => c && c.trim()).map(([n, c]) => n + ': ' + comando(c.trim()));
  const fin = lineas(d.terminado);
  if (!fin.length && d.test) fin.push('Pasa ' + comando(d.test.trim()) + ' sin errores.');
  const git = [];
  if (d.ramas) git.push('Ramas: ' + d.ramas.trim());
  if (d.commits) git.push('Commits: ' + d.commits.trim());
  const out = ['# Proyecto: ' + d.nombre.trim() + (d.stack ? ' (' + d.stack.trim() + ')' : '')];
  if (d.descripcion) out.push('', d.descripcion.trim());
  out.push(...seccion('Comandos', cmds), ...seccion('Cómo dar algo por terminado', fin),
    ...seccion('Convenciones (lo que no se ve en el código)', lineas(d.convenciones)),
    ...seccion('No tocar', lineas(d.noTocar).map((r) => comando(r) + ' (pregunta antes de cambiarlo)')),
    ...seccion('Trampas conocidas', lineas(d.trampas)), ...seccion('Git', git));
  if (d.idioma) out.push('', '## Idioma', '- Responde y escribe comentarios en ' + d.idioma.trim() + '.');
  return out.join('\n') + '\n';
}

// salida: 'claude' | 'agents' | 'ambos'. Devuelve [{nombre, texto}].
function generar(d) {
  const base = cuerpo(d);
  const extra = lineas(d.soloClaude);
  if (d.salida === 'agents') return [{ nombre: 'AGENTS.md', texto: base }];
  if (d.salida === 'ambos') {
    const claude = ['@AGENTS.md', ...seccion('Claude Code', extra)].join('\n') + '\n';
    return [{ nombre: 'AGENTS.md', texto: base }, { nombre: 'CLAUDE.md', texto: claude }];
  }
  return [{ nombre: 'CLAUDE.md', texto: extra.length ? base + seccion('Claude Code', extra).join('\n') + '\n' : base }];
}

// Devuelve [{nivel:'error'|'aviso', texto}]. Con errores no se ofrece la descarga.
function validar(d, archivos) {
  const r = [];
  if (!d.nombre || !d.nombre.trim()) r.push({ nivel: 'error', texto: 'Falta el nombre del proyecto.' });
  if (!d.test || !d.test.trim()) r.push({ nivel: 'aviso', texto: 'Sin comando de tests, Claude no sabe cómo comprobar su trabajo. Es lo más útil del archivo.' });
  const todo = Object.values(d).filter((v) => typeof v === 'string').join('\n');
  if (SECRETOS.some((re) => re.test(todo))) r.push({ nivel: 'error', texto: 'Parece que has pegado una clave o contraseña. Quítala: este archivo se sube a git.' });
  for (const l of lineas(d.convenciones).concat(lineas(d.terminado))) {
    if (VAGAS.some((re) => re.test(l))) r.push({ nivel: 'aviso', texto: 'Regla vaga: «' + l + '». Escribe algo comprobable («indentación de 2 espacios», «ejecuta npm test»).' });
  }
  for (const l of lineas(d.convenciones)) {
    if (/\b(nunca|jam[aá]s|prohibido)\b/i.test(l)) r.push({ nivel: 'aviso', texto: 'Las prohibiciones sin excepción van mejor en permisos o hooks que en este archivo: «' + l + '».' });
    const imp = l.match(/(^|\s)@(\S+)/);
    if (imp && /["']/.test(imp[2])) r.push({ nivel: 'aviso', texto: 'Un import @ruta entre comillas no se importa. Para espacios usa «\\ ».' });
    if (imp && d.salida !== 'claude') r.push({ nivel: 'aviso', texto: 'Claude Code expande «@' + imp[2] + '» dentro de AGENTS.md, pero otras herramientas pueden leerlo como texto: copia lo esencial en el archivo.' });
  }
  for (const a of archivos) {
    const n = a.texto.split('\n').length;
    if (n > LIMITE_LINEAS) r.push({ nivel: 'aviso', texto: a.nombre + ' tiene ' + n + ' líneas; la recomendación oficial es menos de ' + LIMITE_LINEAS + '.' });
  }
  if (d.salida === 'ambos' && d.local) r.push({ nivel: 'aviso', texto: 'Recuerda: un CLAUDE.local.md hace que Claude deje de leer AGENTS.md por su cuenta; con el @AGENTS.md del CLAUDE.md generado no pasa nada.' });
  return r;
}

if (typeof module !== 'undefined') module.exports = { generar, validar, cuerpo };

// ---------- Interfaz (solo en el navegador; la carga solo la página del generador) ----------
if (typeof document !== 'undefined' && document.getElementById('gen-form')) {
  const en = document.documentElement.lang === 'en';
  const form = document.getElementById('gen-form');
  const vista = document.getElementById('gen-vista');
  const avisos = document.getElementById('gen-avisos');
  const estado = document.getElementById('gen-estado');
  const botones = document.getElementById('gen-descargas');
  const datos = () => Object.fromEntries(new FormData(form).entries());
  let resumen = '';

  function pintar() {
    const d = datos();
    const archivos = generar(d);
    const res = validar(d, archivos);
    const errores = res.filter((x) => x.nivel === 'error').length;
    avisos.replaceChildren(...res.map((x) => Object.assign(document.createElement('li'), {
      textContent: (x.nivel === 'error' ? 'Error: ' : (en ? 'Warning: ' : 'Aviso: ')) + x.texto, className: 'aviso-' + x.nivel })));
    vista.textContent = archivos.map((a) => '===== ' + a.nombre + ' =====\n' + a.texto).join('\n');
    const nuevo = errores ? (en ? errores + ' error(s): fix them to download.' : errores + ' error(es): corrígelos para descargar.')
      : (en ? 'Ready: ' : 'Listo: ') + archivos.map((a) => a.nombre).join(' + ') + (res.length ? (en ? ' (' + res.length + ' warning(s))' : ' (' + res.length + ' aviso(s))') : '');
    if (nuevo !== resumen) estado.textContent = resumen = nuevo;     // solo se anuncia cuando cambia
    botones.replaceChildren(...archivos.map((a) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'boton boton-oscuro boton-chico',
        textContent: (en ? 'Download ' : 'Descargar ') + a.nombre, disabled: errores > 0 });
      b.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([a.texto], { type: 'text/markdown;charset=utf-8' }));
        const enlace = Object.assign(document.createElement('a'), { href: url, download: a.nombre });
        document.body.append(enlace); enlace.click(); enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      return b;
    }));
  }
  form.addEventListener('input', pintar);
  form.addEventListener('submit', (ev) => ev.preventDefault());
  pintar();
}
