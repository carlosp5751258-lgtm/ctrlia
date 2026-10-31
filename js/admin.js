// Ctrl+IA · administración en línea (fase 3, ADM-01 a 10). Solo se carga en admin.html, después de cuentas.js.
// Reutiliza window.CtrlIA (sesión, api, el, tx). Nada de innerHTML: todo se pinta con textContent.
// La seguridad la da Supabase (RLS + es_admin() con aal2); esta página solo es la interfaz.
"use strict";
(() => {
  const raiz = document.querySelector(".pagina-admin");
  if (!raiz) return;
  const caja = raiz.querySelector(".admin-contenido");
  const estado = raiz.querySelector(".admin-estado");               // role=status visible
  let C, tx, el, api;

  const decir = (msg, error = false) => { estado.textContent = msg; estado.classList.toggle("error", error); };
  const rpc = (nombre, cuerpo = {}) => api(`/rest/v1/rpc/${nombre}`, { metodo: "POST", cuerpo });
  const aal = (t) => { try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal; } catch { return null; } };
  const fecha = (f) => (f ? new Date(f).toLocaleString(tx("es", "en"), { dateStyle: "short", timeStyle: "short" }) : "—");

  document.addEventListener("ctrlia:listo", (ev) => {
    C = window.CtrlIA; ({ tx, el, api } = C);
    if (ev.detail?.error) return decir(tx("No se pudo conectar con las cuentas: ", "Could not reach accounts: ") + ev.detail.error, true);
    iniciar().catch((e) => decir(e.message, true));
  });

  async function iniciar() {
    raiz.querySelector(".sin-sesion").hidden = !!C.usuario();
    if (!C.usuario()) return decir("");
    if (aal(await C.token()) !== "aal2") { decir(""); return dosPasos(); }
    if (!(await rpc("es_admin"))) return decir(tx("Esta cuenta no es de administración.", "This account is not an admin account."), true);
    decir("");
    panel();
  }

  // Supabase devuelve el QR como SVG en texto (a veces ya como data:); <img> necesita un data: URI.
  const qrUri = (q) => (q.startsWith("data:") ? q : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(q));

  // ── Dos pasos (ADM-01): TOTP de Supabase Auth por REST ─────────────────────────────────────────────
  async function dosPasos() {
    const u = await api("/auth/v1/user");
    const totp = (u.factors || []).filter((f) => f.factor_type === "totp");
    let factor = totp.find((f) => f.status === "verified");
    const mfa = el("div", { className: "admin-mfa" });
    if (!factor) {
      // El factor se crea solo al pulsar: así una visita cualquiera no da de alta nada.
      const activar = el("button", { type: "button", className: "boton boton-oscuro", textContent: tx("Activar la verificación en dos pasos", "Turn on two-step verification") });
      activar.addEventListener("click", async () => {
        activar.disabled = true;
        try {
          for (const f of totp) await api(`/auth/v1/factors/${f.id}`, { metodo: "DELETE" });   // sin verificar: no acumular
          factor = await api("/auth/v1/factors", { metodo: "POST", cuerpo: { factor_type: "totp", friendly_name: "Ctrl+IA admin" } });
        } catch (e) { activar.disabled = false; return decir(e.message, true); }
        activar.replaceWith(el("p", { textContent: tx("Escanea este código con tu app de autenticación (Google Authenticator, Aegis, 1Password…) y escribe el código que te muestre.",
                                                      "Scan this code with your authenticator app (Google Authenticator, Aegis, 1Password…) and type the code it shows.") }),
          el("img", { className: "admin-qr", src: qrUri(factor.totp.qr_code), width: 200, height: 200, alt: tx("Código QR para la app de autenticación", "QR code for the authenticator app") }),
          el("p", {}, tx("¿No puedes escanear? Escribe esta clave: ", "Can't scan? Type this key: "), el("code", { textContent: factor.totp.secret })));
        f.hidden = false; campo.focus();
      });
      mfa.append(el("h2", { textContent: tx("Verificación en dos pasos", "Two-step verification") }),
        el("p", { textContent: tx("La administración exige un segundo paso con una app de autenticación.", "Admin access requires a second step with an authenticator app.") }), activar);
    } else {
      mfa.append(el("h2", { textContent: tx("Verificación en dos pasos", "Two-step verification") }),
        el("p", { textContent: tx("Escribe el código de 6 dígitos de tu app de autenticación.", "Type the 6-digit code from your authenticator app.") }));
    }
    const campo = el("input", { name: "codigo", inputMode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", maxLength: 6, required: true });
    const boton = el("button", { className: "boton boton-oscuro boton-chico", textContent: tx("Verificar", "Verify") });
    const f = el("form", { className: "fila-form", hidden: !factor }, el("label", {}, tx("Código", "Code"), campo), boton);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); boton.disabled = true;
      try {
        const reto = await api(`/auth/v1/factors/${factor.id}/challenge`, { metodo: "POST", cuerpo: {} });
        const s = await api(`/auth/v1/factors/${factor.id}/verify`, { metodo: "POST", cuerpo: { challenge_id: reto.id, code: campo.value.trim() } });
        C.guardar({ access_token: s.access_token, refresh_token: s.refresh_token, expira: Date.now() + s.expires_in * 1000 });
        caja.replaceChildren(); decir(tx("Verificado.", "Verified."));
        await iniciar();
      } catch (e) {
        boton.disabled = false; decir(tx("Código no válido: ", "Invalid code: ") + e.message, true); campo.select(); campo.focus();
      }
    });
    mfa.append(f); caja.replaceChildren(mfa); (factor ? campo : mfa.querySelector("button")).focus();
  }

  // ── Utilidades de pintado ─────────────────────────────────────────────────────────────────────────
  const ETIQUETAS = {
    usuarios: ["Usuarios", "Users"], altas_semana: ["Altas por semana", "Sign-ups per week"], mas_guardados: ["Más guardados", "Most saved"],
    avisos_activos: ["Avisos activos", "Active alerts"], licencias: ["Licencias Pro", "Pro licenses"], correos_mes: ["Correos este mes", "Emails this month"],
    vistas: ["Vistas por página", "Views per page"], clics: ["Clics por evento", "Clicks per event"], recursos: ["Recursos más vistos", "Most viewed resources"],
    origenes: ["Orígenes", "Sources"], ventas: ["Ventas", "Sales"], total: ["Total", "Total"],
    vistas_por_ruta: ["Vistas por página", "Views per page"], clics_por_evento: ["Clics por evento", "Clicks per event"],
    recursos_mas_vistos: ["Recursos más vistos", "Most viewed resources"], por_producto: ["Por producto", "By product"],
    total_usd: ["Total (USD)", "Total (USD)"], ultimas: ["Últimas ventas", "Latest sales"], dias: ["Días", "Days"], desde: ["Desde", "Since"],
    incompleto: ["Incompleto", "Incomplete"], error: ["Error", "Error"], semana: ["Semana", "Week"], recurso: ["Recurso", "Resource"],
    ruta: ["Página", "Page"], evento: ["Evento", "Event"], origen: ["Origen", "Source"], producto: ["Producto", "Product"],
  };
  const nombre = (k) => (ETIQUETAS[k] ? tx(...ETIQUETAS[k]) : k.replace(/_/g, " "));
  const texto = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

  function tabla(cabeceras, filas) {
    const t = el("table", { className: "admin-tabla" },
      el("thead", {}, el("tr", {}, ...cabeceras.map((c) => el("th", { scope: "col", textContent: c })))),
      el("tbody", {}, ...filas.map((f) => el("tr", {}, ...f.map((v) => el("td", {}, v instanceof Node ? v : texto(v)))))));
    return el("div", { className: "admin-scroll" }, t);
  }
  // Pinta cualquier jsonb de las RPC: números/textos como lista y listas de objetos como tabla (no depende de nombres exactos).
  function pintarJson(datos) {
    if (Array.isArray(datos)) return datos.length ? tabla(Object.keys(datos[0]).map(nombre), datos.map((f) => Object.values(f))) : el("p", { className: "suave", textContent: tx("Sin datos.", "No data.") });
    if (!datos || typeof datos !== "object") return el("p", { textContent: texto(datos) });
    const dl = el("dl", { className: "admin-cifras" }), resto = [];
    for (const [k, v] of Object.entries(datos)) {
      if (v && typeof v === "object") resto.push(el("h3", { textContent: nombre(k) }), pintarJson(v));
      else dl.append(el("div", {}, el("dt", { textContent: nombre(k) }), el("dd", { textContent: texto(v) })));
    }
    return el("div", {}, dl.children.length ? dl : "", ...resto);
  }

  // Cada sección: título, mensaje visible propio y su contenido; un fallo no tumba las demás.
  function seccion(id, titulo, cargar) {
    const cont = el("div"), msg = el("p", { className: "admin-msg" });
    msg.setAttribute("role", "status");
    const s = el("section", { id, "aria-labelledby": `t-${id}` }, el("h2", { id: `t-${id}`, textContent: titulo }), msg, cont);
    const avisar = (m, error = false) => { msg.textContent = m; msg.classList.toggle("error", error); };
    const recargar = () => cargar(cont, avisar).catch((e) => avisar(tx("No se pudo cargar: ", "Could not load: ") + e.message, true));
    recargar();
    return [s, titulo];
  }

  function panel() {
    const partes = [
      seccion("resumen", tx("Resumen", "Summary"), async (c) => c.replaceChildren(pintarJson(await rpc("admin_resumen")))),
      seccion("estadisticas", tx("Estadísticas", "Statistics"), estadisticas),
      seccion("recursos", tx("Recursos", "Resources"), recursos),
      seccion("peticiones", tx("Peticiones", "Requests"), peticiones),
      seccion("calendario", tx("Calendario de publicaciones", "Publishing calendar"), calendario),
      seccion("auditoria", tx("Auditoría", "Audit log"), auditoria),
      seccion("ventas", tx("Ventas", "Sales"), async (c) => {
        const v = await rpc("admin_ventas");
        c.replaceChildren(v?.configurado === false
          ? el("p", { className: "suave", textContent: tx("Sin configurar: falta el secreto gumroad_token en Vault.", "Not configured: the gumroad_token secret is missing from Vault.") })
          : pintarJson(v));
      }),
      seccion("avisos", tx("Avisos por correo", "Email alerts"), avisos),
    ];
    const nav = el("nav", { className: "admin-nav", "aria-label": tx("Secciones de administración", "Admin sections") },
      ...partes.map(([s, t]) => el("a", { href: `#${s.id}`, textContent: t })));
    caja.replaceChildren(nav, ...partes.map(([s]) => s));
  }

  // ── Estadísticas (ADM-02) ─────────────────────────────────────────────────────────────────────────
  async function estadisticas(c) {
    const datos = el("div"), elegir = el("select", { name: "dias" }, el("option", { value: "7", textContent: tx("Últimos 7 días", "Last 7 days") }),
                                                                    el("option", { value: "30", textContent: tx("Últimos 30 días", "Last 30 days") }));
    const pintar = async () => datos.replaceChildren(pintarJson(await rpc("admin_estadisticas", { dias: Number(elegir.value) })));
    elegir.addEventListener("change", () => pintar().catch((e) => datos.replaceChildren(el("p", { className: "error", textContent: e.message }))));
    c.replaceChildren(el("label", { className: "admin-periodo" }, tx("Periodo", "Period"), elegir), datos);
    await pintar();
  }

  // ── Recursos (ADM-03): la base en línea manda; la web se regenera sola ────────────────────────────
  const GRUPOS = ["Para Claude Code", "Para tu repositorio"];
  const EMOCIONES = ["normal", "feliz", "orgulloso", "pensando", "sorpresa", "alerta", "miedo", "enojado", "triste"];
  // [columna, etiqueta ES, etiqueta EN, tipo, límites]; las vacías opcionales se guardan como null
  const CAMPOS = [
    ["id", "Identificador (a-z, 0-9, -)", "Identifier (a-z, 0-9, -)", "text", { pattern: "[a-z0-9-]{2,40}", required: true }],
    ["nombre", "Nombre", "Name (Spanish)", "text", { minLength: 3, maxLength: 80, required: true }],
    ["nombre_en", "Nombre en inglés", "Name in English", "text", { minLength: 3, maxLength: 80 }],
    ["problema", "Problema (corto)", "Problem (short, Spanish)", "text", { minLength: 5, maxLength: 80, required: true }],
    ["problema_en", "Problema en inglés", "Problem in English", "text", { minLength: 5, maxLength: 80 }],
    ["problema_largo", "Problema largo", "Long problem (Spanish)", "area", { minLength: 150, maxLength: 600 }],
    ["problema_largo_en", "Problema largo en inglés", "Long problem in English", "area", { minLength: 150, maxLength: 600 }],
    ["frase", "Frase de Byte", "Byte's line", "text", { minLength: 10, maxLength: 200, required: true }],
    ["emocion", "Emoción de Byte", "Byte's emotion", EMOCIONES, { required: true }],
    ["grupo", "Grupo", "Group", GRUPOS, { required: true }],
    ["categoria_id", "Categoría", "Category", "categoria", { required: true }],
    ["precio_usd", "Precio Pro (USD)", "Pro price (USD)", "number", { min: 0, max: 100, required: true }],
    ["muestra_txt", "Texto de la muestra", "Sample text", "text", { minLength: 5, maxLength: 80, required: true }],
    ["muestra_url", "Enlace de la muestra (GitHub o dev.to)", "Sample link (GitHub or dev.to)", "url", { pattern: "https://(github\\.com|dev\\.to)/.+", required: true }],
    ["gumroad", "Producto de Gumroad (a-z, 0-9, -)", "Gumroad product (a-z, 0-9, -)", "text", { pattern: "[a-z0-9-]{2,60}", required: true }],
    ["portada_dir", "Carpeta de portada", "Cover folder", "text", { maxLength: 80, required: true }],
    ["alta", "Fecha de alta", "Release date", "date", {}],
  ];

  async function recursos(c, avisar) {
    const [prods, incluye, etiq, cats, etiquetas] = await Promise.all([
      api("/rest/v1/producto?select=*&order=orden"), api("/rest/v1/producto_incluye?select=*&order=producto_id,orden"),
      api("/rest/v1/producto_etiqueta?select=*"), api("/rest/v1/categoria?select=id,nombre&order=orden"), api("/rest/v1/etiqueta?select=id,nombre&order=orden")]);
    const recargar = async (m) => { await recursos(c, avisar); avisar(m); };
    const lista = el("ul", { className: "lista-recursos" });
    prods.forEach((p, i) => {
      const b = (txt, accion, desactivado = false) => {
        const x = el("button", { type: "button", className: "boton-texto", textContent: txt, disabled: desactivado });
        x.addEventListener("click", async () => { x.disabled = true; try { await accion(); } catch (e) { x.disabled = false; avisar(e.message, true); } });
        return x;
      };
      const mover = async (otro) => {          // orden es único: pasa por un valor libre antes de intercambiar
        const libre = Math.max(...prods.map((x) => x.orden)) + 1;
        await api(`/rest/v1/producto?id=eq.${encodeURIComponent(p.id)}`, { metodo: "PATCH", cuerpo: { orden: libre } });
        await api(`/rest/v1/producto?id=eq.${encodeURIComponent(otro.id)}`, { metodo: "PATCH", cuerpo: { orden: p.orden } });
        await api(`/rest/v1/producto?id=eq.${encodeURIComponent(p.id)}`, { metodo: "PATCH", cuerpo: { orden: otro.orden } });
        await recargar(tx("Orden cambiado.", "Order changed."));
      };
      lista.append(el("li", {}, el("strong", { textContent: p.nombre }), p.visible ? "" : el("span", { className: "insignia", textContent: tx("Oculto", "Hidden") }),
        b(tx("Editar", "Edit"), async () => formulario(p)),
        b(tx("Subir", "Move up"), () => mover(prods[i - 1]), i === 0),
        b(tx("Bajar", "Move down"), () => mover(prods[i + 1]), i === prods.length - 1),
        b(p.visible ? tx("Ocultar", "Hide") : tx("Mostrar", "Show"), async () => {
          await api(`/rest/v1/producto?id=eq.${encodeURIComponent(p.id)}`, { metodo: "PATCH", cuerpo: { visible: !p.visible } });
          await recargar(p.visible ? tx("Recurso oculto.", "Resource hidden.") : tx("Recurso visible.", "Resource visible."));
        })));
    });
    const nuevo = el("button", { type: "button", className: "boton boton-borde boton-chico", textContent: tx("Nuevo recurso", "New resource") });
    nuevo.addEventListener("click", () => formulario(null));
    const editor = el("div");
    c.replaceChildren(el("p", { className: "nota", textContent: tx("Los cambios llegan a la web en 30 minutos como mucho (la sincronización regenera y publica).",
                                                                   "Changes reach the website within 30 minutes (the sync regenerates and publishes it).") }),
                      lista, nuevo, editor);

    function formulario(p) {
      const f = el("form", { className: "admin-form" });
      f.append(el("h3", { textContent: p ? tx("Editar: ", "Edit: ") + p.nombre : tx("Nuevo recurso", "New resource") }));
      for (const [col, es, en, tipo, lim] of CAMPOS) {
        let campo;
        if (Array.isArray(tipo) || tipo === "categoria") {
          const ops = tipo === "categoria" ? cats.map((x) => [x.id, x.nombre]) : tipo.map((x) => [x, x]);
          campo = el("select", { name: col }, ...ops.map(([v, t]) => el("option", { value: v, textContent: t })));
        } else campo = el(tipo === "area" ? "textarea" : "input", tipo === "area" ? { name: col, rows: 4 } : { name: col, type: tipo });
        Object.assign(campo, lim);
        if (p) campo.value = p[col] ?? "";
        if (p && col === "id") campo.readOnly = true;          // el id es la clave: no se cambia
        f.append(el("label", {}, tx(es, en), campo));
      }
      const inc = incluye.filter((x) => p && x.producto_id === p.id).map((x) => x.texto).join("\n");
      f.append(el("label", {}, tx("Qué incluye (una línea por punto, máx. 10)", "What it includes (one line per item, max 10)"),
                  el("textarea", { name: "incluye", rows: 5, value: inc })));
      const suyas = new Set(etiq.filter((x) => p && x.producto_id === p.id).map((x) => x.etiqueta_id));
      f.append(el("fieldset", { className: "filtros" }, el("legend", { textContent: tx("Etiquetas", "Tags") }),
        ...etiquetas.map((x) => el("label", { className: "filtro" }, el("input", { type: "checkbox", name: "etiqueta", value: x.id, checked: suyas.has(x.id) }), " " + x.nombre))));
      f.append(el("label", { className: "fila" }, el("input", { type: "checkbox", name: "visible", checked: p ? p.visible : true }), " " + tx("Visible en la web", "Visible on the website")));
      const guardar = el("button", { className: "boton boton-oscuro boton-chico", textContent: tx("Guardar", "Save") });
      const cancelar = el("button", { type: "button", className: "boton boton-borde boton-chico", textContent: tx("Cancelar", "Cancel") });
      cancelar.addEventListener("click", () => { editor.replaceChildren(); nuevo.focus(); });
      f.append(el("p", { className: "cuenta-acciones" }, guardar, cancelar));
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const lineas = f.elements.incluye.value.split("\n").map((x) => x.trim()).filter(Boolean);
        const mal = lineas.find((x) => x.length < 3 || x.length > 120);
        if (lineas.length > 10 || mal) { avisar(tx("«Qué incluye»: hasta 10 líneas de 3 a 120 caracteres.", "“What it includes”: up to 10 lines of 3 to 120 characters."), true); f.elements.incluye.focus(); return; }
        const fila = { visible: f.elements.visible.checked };
        for (const [col, , , tipo] of CAMPOS) {
          const v = f.elements[col].value.trim();
          fila[col] = tipo === "number" ? Number(v) : v || null;
        }
        guardar.disabled = true;
        try {
          const id = fila.id;
          if (p) { delete fila.id; await api(`/rest/v1/producto?id=eq.${encodeURIComponent(id)}`, { metodo: "PATCH", cuerpo: fila }); }
          else await api("/rest/v1/producto", { metodo: "POST", cuerpo: { ...fila, orden: Math.max(-1, ...prods.map((x) => x.orden)) + 1 } });
          // shortcut: incluye y etiquetas se reemplazan con varias llamadas (no atómico); si falla a medias, volver a guardar lo arregla
          await api(`/rest/v1/producto_incluye?producto_id=eq.${encodeURIComponent(id)}`, { metodo: "DELETE" });
          if (lineas.length) await api("/rest/v1/producto_incluye", { metodo: "POST", cuerpo: lineas.map((texto, orden) => ({ producto_id: id, orden, texto })) });
          await api(`/rest/v1/producto_etiqueta?producto_id=eq.${encodeURIComponent(id)}`, { metodo: "DELETE" });
          const marcadas = [...f.querySelectorAll("input[name=etiqueta]:checked")].map((x) => ({ producto_id: id, etiqueta_id: x.value }));
          if (marcadas.length) await api("/rest/v1/producto_etiqueta", { metodo: "POST", cuerpo: marcadas });
          await recargar(tx("Recurso guardado.", "Resource saved."));
        } catch (e) { guardar.disabled = false; avisar(tx("No se guardó: ", "Not saved: ") + e.message, true); }
      });
      editor.replaceChildren(f);
      f.elements[p ? "nombre" : "id"].focus();
    }
  }

  // ── Peticiones (ADM-04) ───────────────────────────────────────────────────────────────────────────
  const ESTADOS = [["abierta", "Abierta", "Open"], ["en-curso", "En curso", "In progress"], ["hecha", "Hecha", "Done"], ["descartada", "Descartada", "Discarded"]];
  async function peticiones(c, avisar) {
    // El ranking da los votos (y oculta las descartadas); el select directo de admin añade las descartadas.
    const [ranking, todas] = await Promise.all([rpc("peticiones_ranking"), api("/rest/v1/peticiones?select=id,titulo,detalle,estado,respuesta,creado").catch(() => [])]);
    const filas = new Map(todas.map((p) => [p.id, { ...p, votos: 0 }]));
    for (const p of ranking) filas.set(p.id, { ...filas.get(p.id), ...p });
    const ol = el("ol", { className: "ranking" });
    if (!filas.size) ol.append(el("li", { className: "suave", textContent: tx("Aún no hay peticiones.", "No requests yet.") }));
    for (const p of [...filas.values()].sort((a, b) => b.votos - a.votos)) {
      const sel = el("select", { name: "estado" }, ...ESTADOS.map(([v, es, en]) => el("option", { value: v, textContent: tx(es, en), selected: p.estado === v })));
      const resp = el("textarea", { name: "respuesta", rows: 2, maxLength: 500, value: p.respuesta || "" });
      const f = el("form", { className: "admin-form" }, el("label", {}, tx("Estado", "Status"), sel), el("label", {}, tx("Respuesta pública (opcional)", "Public reply (optional)"), resp),
                   el("button", { className: "boton boton-borde boton-chico", textContent: tx("Guardar", "Save") }));
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const r = resp.value.trim() || null, cuerpo = { estado: sel.value, respuesta: r };
        if (r !== (p.respuesta || null)) cuerpo.respondida = r ? new Date().toISOString() : null;
        try { await api(`/rest/v1/peticiones?id=eq.${p.id}`, { metodo: "PATCH", cuerpo }); Object.assign(p, cuerpo); avisar(tx("Petición actualizada: ", "Request updated: ") + p.titulo); }
        catch (e) { avisar(tx("No se guardó: ", "Not saved: ") + e.message, true); }
      });
      ol.append(el("li", { className: "peticion" }, el("span", { className: "voto" }, el("span", { "aria-hidden": "true", textContent: "▲ " }), String(p.votos), el("span", { className: "solo-lector", textContent: tx(" votos", " votes") })),
        el("div", {}, el("strong", { textContent: p.titulo }), p.detalle ? el("p", { textContent: p.detalle }) : "", f)));
    }
    c.replaceChildren(ol);
  }

  // ── Calendario (ADM-05, solo lectura) ─────────────────────────────────────────────────────────────
  async function calendario(c) {
    const [pubs, piezas] = await Promise.all([api("/rest/v1/publicacion?select=*&order=fecha.asc.nullslast,red"), api("/rest/v1/pieza?select=id,tipo,producto_id")]);
    const tipo = new Map(piezas.map((p) => [p.id, p.tipo]));
    c.replaceChildren(tabla([tx("Fecha", "Date"), tx("Pieza", "Piece"), tx("Tipo", "Type"), tx("Red", "Network"), tx("Estado", "Status"), tx("Enlace", "Link")],
      pubs.map((p) => [p.fecha, p.pieza_id, tipo.get(p.pieza_id), p.red, p.estado, p.url ? el("a", { href: p.url, textContent: tx("Ver", "View"), rel: "noopener" }) : "—"])));
  }

  // ── Auditoría (ADM-06, últimas 100) ───────────────────────────────────────────────────────────────
  async function auditoria(c) {
    const filas = await api("/rest/v1/auditoria?select=*&order=fecha.desc&limit=100");
    const cambio = (a) => {
      if (a.operacion !== "UPDATE") return (a.despues || a.antes)?.id ?? "";
      return Object.keys(a.despues || {}).filter((k) => JSON.stringify(a.despues[k]) !== JSON.stringify(a.antes?.[k]) && !["version", "actualizado"].includes(k)).join(", ");
    };
    c.replaceChildren(tabla([tx("Fecha", "Date"), tx("Origen", "Source"), tx("Tabla", "Table"), tx("Operación", "Operation"), tx("Quién", "Who"), tx("Qué cambió", "What changed")],
      filas.map((a) => [fecha(a.fecha), a.origen, a.tabla, a.operacion, a.actor, cambio(a)])));
  }

  // ── Avisos por correo (ADM-10) ────────────────────────────────────────────────────────────────────
  async function avisos(c, avisar) {
    const prods = await api("/rest/v1/producto?select=id,nombre&order=orden");
    const salida = el("p", { className: "admin-salida" });
    salida.setAttribute("role", "status");
    const enviar = async (boton, cuerpo) => {
      boton.disabled = true; salida.textContent = tx("Enviando…", "Sending…");
      try { salida.textContent = texto(await rpc("admin_enviar_avisos", cuerpo)); avisar(""); }
      catch (e) { salida.textContent = ""; avisar(tx("No se pudo enviar: ", "Could not send: ") + e.message, true); }
      boton.disabled = false;
    };
    const todos = el("button", { type: "button", className: "boton boton-oscuro boton-chico", textContent: tx("Enviar avisos de recursos nuevos", "Send new-resource alerts") });
    todos.addEventListener("click", () => enviar(todos, {}));
    const recurso = el("select", { name: "prueba" }, ...prods.map((p) => el("option", { value: p.id, textContent: p.nombre })));
    const prueba = el("button", { className: "boton boton-borde boton-chico", textContent: tx("Enviar prueba", "Send test") });
    const f = el("form", { className: "fila-form" }, el("label", {}, tx("Correo de prueba con el recurso", "Test email with the resource"), recurso), prueba);
    f.addEventListener("submit", (ev) => { ev.preventDefault(); enviar(prueba, { prueba: recurso.value }); });
    c.replaceChildren(el("p", { className: "nota", textContent: tx("Envía a quien tenga avisos activos los recursos nuevos de sus categorías. La prueba te llega solo a ti.",
                                                                   "Emails new resources in their categories to everyone with alerts on. The test goes only to you.") }),
                      todos, f, salida);
  }
})();
