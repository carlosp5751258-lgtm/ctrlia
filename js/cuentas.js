// Ctrl+IA · cuentas opcionales (fase 2). Sin librerías: Supabase Auth + REST con fetch.
// Sin cuenta todo funciona igual (USU-06); si Supabase falla, solo se desactivan los botones de cuenta (RNF-08).
// Nada de innerHTML: todo lo que viene del usuario o de la API se pinta con textContent.
"use strict";
(() => {
  const meta = document.querySelector('meta[name="ctrlia-supabase"]')?.content.split("|");
  if (!meta) return;
  const [URL_SB, CLAVE] = meta;
  const EN = document.documentElement.lang === "en";
  const tx = (es, en) => (EN ? en : es);
  const GUARDADA = "ctrlia-sesion";

  // ── Sesión ────────────────────────────────────────────────────────────────────────────────────────────
  const leer = () => { try { return JSON.parse(localStorage.getItem(GUARDADA)); } catch { return null; } };
  const guardar = (s) => { try { s ? localStorage.setItem(GUARDADA, JSON.stringify(s)) : localStorage.removeItem(GUARDADA); } catch { /* sin almacenamiento */ } };

  // Vuelta del inicio de sesión: los tokens llegan en el fragmento (#access_token=…); se guardan y se borran de la URL.
  const frag = new URLSearchParams(location.hash.slice(1));
  if (frag.get("access_token")) {
    guardar({ access_token: frag.get("access_token"), refresh_token: frag.get("refresh_token"),
              expira: Date.now() + (Number(frag.get("expires_in")) || 3600) * 1000 });
    history.replaceState(null, "", location.pathname + location.search);
  } else if (frag.get("error")) {
    history.replaceState(null, "", location.pathname + location.search);
    console.warn("Inicio de sesión cancelado o fallido:", frag.get("error_description"));
  }

  async function token() {
    const s = leer();
    if (!s) return null;
    if (Date.now() < s.expira - 60000) return s.access_token;
    const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: CLAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r.ok) { guardar(null); return null; }
    const d = await r.json();
    guardar({ access_token: d.access_token, refresh_token: d.refresh_token, expira: Date.now() + d.expires_in * 1000 });
    return d.access_token;
  }

  // Llamada a la API REST. Lanza error con mensaje legible si falla.
  async function api(ruta, { metodo = "GET", cuerpo, prefer } = {}) {
    const t = await token();
    const h = { apikey: CLAVE, "Content-Type": "application/json" };
    if (t) h.Authorization = `Bearer ${t}`;
    if (prefer) h.Prefer = prefer;
    const r = await fetch(`${URL_SB}${ruta}`, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.statusText);
    return r.status === 204 ? null : r.json();
  }

  const entrar = (proveedor) => {
    const vuelta = location.href.split("#")[0];
    location.href = `${URL_SB}/auth/v1/authorize?provider=${proveedor}&redirect_to=${encodeURIComponent(vuelta)}`;
  };
  const salir = async () => {
    const t = await token().catch(() => null);
    if (t) fetch(`${URL_SB}/auth/v1/logout`, { method: "POST", headers: { apikey: CLAVE, Authorization: `Bearer ${t}` } }).catch(() => {});
    guardar(null); location.reload();
  };

  // ── Elementos comunes ─────────────────────────────────────────────────────────────────────────────────
  const el = (etiqueta, props = {}, ...hijos) => {
    const e = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(props)) k.includes("-") ? e.setAttribute(k, v) : (e[k] = v);   // aria-* van como atributo
    hijos.forEach((h) => e.append(h));
    return e;
  };
  const aviso = document.querySelector(".cuenta-estado");                     // región role=status para lectores de pantalla
  const anunciar = (msg) => { if (aviso) aviso.textContent = msg; };

  let usuario = null;                       // { id, email, nombre }
  let favoritos = new Map();                // recurso -> coleccion|null

  async function cargarUsuario() {
    const t = await token();
    if (!t) return null;
    const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: CLAVE, Authorization: `Bearer ${t}` } });
    if (!r.ok) { guardar(null); return null; }
    const u = await r.json();
    const m = u.user_metadata || {};
    return { id: u.id, email: u.email, nombre: m.full_name || m.name || m.user_name || u.email };
  }

  // Menú de la cabecera: «Entrar» (GitHub/Google) o la inicial del usuario con «Mi cuenta» y «Salir».
  function pintarCabecera() {
    const caja = document.querySelector(".cuenta");
    if (!caja) return;
    caja.hidden = false;
    const fuera = caja.querySelector(".cuenta-fuera"), dentro = caja.querySelector(".cuenta-dentro");
    fuera.hidden = !!usuario; dentro.hidden = !usuario;
    if (usuario) {
      caja.querySelector(".cuenta-inicial").textContent = (usuario.nombre || "?").trim().charAt(0).toUpperCase();
      caja.querySelector(".cuenta-nombre").textContent = usuario.nombre;
    }
  }

  function abrirMenu(boton) {
    const panel = document.getElementById(boton.getAttribute("aria-controls"));
    const abierto = boton.getAttribute("aria-expanded") === "true";
    document.querySelectorAll(".cuenta [aria-expanded='true']").forEach((b) => { b.setAttribute("aria-expanded", "false"); document.getElementById(b.getAttribute("aria-controls")).hidden = true; });
    if (!abierto) { boton.setAttribute("aria-expanded", "true"); panel.hidden = false; panel.querySelector("button, a")?.focus(); }
  }
  // Invita a entrar desde cualquier botón que lo necesite (favoritos, votar…): abre el menú de entrada.
  function invitar(texto) {
    const b = document.querySelector(".cuenta-fuera > button");
    if (!b) return;
    const nota = document.querySelector(".cuenta-invita");
    if (nota) nota.textContent = texto;
    if (b.getAttribute("aria-expanded") !== "true") abrirMenu(b);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Favoritos en tarjetas y fichas (USU-02) ──────────────────────────────────────────────────────────
  function pintarFavoritos() {
    document.querySelectorAll(".favorito[data-recurso]").forEach((b) => {
      b.hidden = false;
      const si = favoritos.has(b.dataset.recurso);
      b.setAttribute("aria-pressed", String(si));
      b.querySelector(".favorito-texto").textContent = si ? tx("Guardado", "Saved") : tx("Guardar", "Save");
    });
  }
  async function alternarFavorito(b) {
    if (!usuario) return invitar(tx("Guarda este recurso: entra con GitHub o Google.", "Save this resource: sign in with GitHub or Google."));
    const r = b.dataset.recurso;
    b.disabled = true;
    try {
      if (favoritos.has(r)) { await api(`/rest/v1/favoritos?recurso=eq.${encodeURIComponent(r)}`, { metodo: "DELETE" }); favoritos.delete(r); anunciar(tx("Quitado de Mis recursos", "Removed from My resources")); }
      else { await api("/rest/v1/favoritos", { metodo: "POST", cuerpo: { recurso: r } }); favoritos.set(r, null); anunciar(tx("Guardado en Mis recursos", "Saved to My resources")); }
    } catch (e) { anunciar(tx("No se pudo guardar: ", "Could not save: ") + e.message); }
    b.disabled = false; pintarFavoritos();
  }

  // ── Página «Mi cuenta» (USU-02, 04, 05, 07, 09) ─────────────────────────────────────────────────────
  async function paginaCuenta(raiz) {
    const sin = raiz.querySelector(".sin-sesion"), con = raiz.querySelector(".con-sesion");
    sin.hidden = !!usuario; con.hidden = !usuario;
    if (!usuario) return;
    raiz.querySelector(".cuenta-correo").textContent = usuario.email || "";
    const catalogo = JSON.parse(raiz.querySelector("#catalogo-datos").textContent);    // { recursos: {id: {nombre, url}}, categorias: [[id, nombre]] }

    async function pintarMisRecursos() {
      const [favs, cols] = await Promise.all([api("/rest/v1/favoritos?select=recurso,coleccion&order=creado.desc"), api("/rest/v1/colecciones?select=id,nombre&order=nombre")]);
      const lista = raiz.querySelector(".mis-recursos"); lista.replaceChildren();
      if (!favs.length) { lista.append(el("p", { className: "suave", textContent: tx("Aún no guardaste nada. Pulsa «Guardar» en cualquier recurso.", "Nothing saved yet. Press “Save” on any resource.") })); }
      const grupos = new Map([[null, tx("Sin colección", "No collection")], ...cols.map((c) => [c.id, c.nombre])]);
      for (const [id, nombre] of grupos) {
        const suyos = favs.filter((f) => (f.coleccion || null) === id);
        if (!suyos.length && id === null) continue;
        const ul = el("ul", { className: "lista-recursos" });
        for (const f of suyos) {
          const info = catalogo.recursos[f.recurso] || { nombre: f.recurso, url: "#" };
          const mover = el("select", { "aria-label": tx("Mover a colección", "Move to collection") });
          for (const [cid, cnom] of grupos) mover.append(el("option", { value: cid ?? "", textContent: cnom, selected: (f.coleccion || null) === cid }));
          mover.addEventListener("change", async () => { await api(`/rest/v1/favoritos?recurso=eq.${encodeURIComponent(f.recurso)}`, { metodo: "PATCH", cuerpo: { coleccion: mover.value || null } }); pintarMisRecursos(); });
          const quitar = el("button", { type: "button", className: "boton-texto", textContent: tx("Quitar", "Remove") });
          quitar.addEventListener("click", async () => { await api(`/rest/v1/favoritos?recurso=eq.${encodeURIComponent(f.recurso)}`, { metodo: "DELETE" }); pintarMisRecursos(); });
          ul.append(el("li", {}, el("a", { href: info.url, textContent: info.nombre }), mover, quitar));
        }
        lista.append(el("h3", { textContent: nombre }), suyos.length ? ul : el("p", { className: "suave", textContent: tx("Vacía", "Empty") }));
      }
    }
    raiz.querySelector(".nueva-coleccion").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const campo = ev.target.elements.nombre;
      try { await api("/rest/v1/colecciones", { metodo: "POST", cuerpo: { nombre: campo.value.trim() } }); campo.value = ""; anunciar(tx("Colección creada", "Collection created")); pintarMisRecursos(); }
      catch (e) { anunciar(tx("No se pudo crear: ", "Could not create: ") + e.message); }
    });

    // Avisos por correo (USU-04)
    const fAvisos = raiz.querySelector(".avisos");
    const cajas = fAvisos.querySelector(".avisos-categorias");
    for (const [id, nombre] of catalogo.categorias) cajas.append(el("label", { className: "filtro" }, el("input", { type: "checkbox", name: "cat", value: id }), " " + nombre));
    const [pref] = await api("/rest/v1/avisos_pref?select=activo,categorias,idioma");
    if (pref) {
      fAvisos.elements.activo.checked = pref.activo;
      fAvisos.querySelectorAll("input[name=cat]").forEach((c) => { c.checked = pref.categorias.includes(c.value); });
    }
    fAvisos.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const cats = [...fAvisos.querySelectorAll("input[name=cat]:checked")].map((c) => c.value);
      try { await api(`/rest/v1/avisos_pref?usuario=eq.${usuario.id}`, { metodo: "PATCH", cuerpo: { activo: fAvisos.elements.activo.checked, categorias: cats, idioma: EN ? "en" : "es", cambiado: new Date().toISOString() } });
            anunciar(tx("Preferencias de aviso guardadas", "Alert preferences saved")); }
      catch (e) { anunciar(tx("No se guardó: ", "Not saved: ") + e.message); }
    });

    // Packs Pro (USU-09): la verificación la hace el servidor contra Gumroad.
    const fPro = raiz.querySelector(".pro-licencia");
    async function pintarPro() {
      const lic = await api("/rest/v1/licencias_pro?select=producto,verificada");
      const ul = raiz.querySelector(".mis-pro"); ul.replaceChildren();
      for (const l of lic) {
        const info = catalogo.pro[l.producto] || { nombre: l.producto, url: "#" };
        ul.append(el("li", {}, el("a", { href: info.url, textContent: info.nombre })));
      }
      if (!lic.length) ul.append(el("li", { className: "suave", textContent: tx("Ninguno todavía.", "None yet.") }));
    }
    fPro?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const ok = await api("/rest/v1/rpc/verificar_licencia", { metodo: "POST", cuerpo: { producto: fPro.elements.producto.value, licencia: fPro.elements.licencia.value.trim() } });
        anunciar(ok ? tx("Licencia verificada", "License verified") : tx("Esa licencia no es válida para ese pack", "That license is not valid for that pack"));
        if (ok) { fPro.elements.licencia.value = ""; pintarPro(); }
      } catch (e) { anunciar(tx("No se pudo verificar: ", "Could not verify: ") + e.message); }
    });

    // Borrar mi cuenta (USU-05): confirmación en la propia página, sin ventanas del navegador.
    const borrar = raiz.querySelector(".borrar"), confirmar = raiz.querySelector(".borrar-confirmar");
    borrar.addEventListener("click", () => { confirmar.hidden = false; confirmar.querySelector("button.peligro").focus(); });
    confirmar.querySelector(".cancelar").addEventListener("click", () => { confirmar.hidden = true; borrar.focus(); });
    confirmar.querySelector("button.peligro").addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      try { await api("/rest/v1/rpc/borrar_mi_cuenta", { metodo: "POST", cuerpo: {} }); guardar(null);
            raiz.replaceChildren(el("p", { className: "entrada", textContent: tx("Tu cuenta y todos tus datos se borraron.", "Your account and all your data were deleted.") })); }
      catch (e) { ev.target.disabled = false; anunciar(tx("No se pudo borrar: ", "Could not delete: ") + e.message); }
    });

    await Promise.all([pintarMisRecursos(), fPro ? pintarPro() : null]);
  }

  // ── Peticiones y votos (USU-03) ─────────────────────────────────────────────────────────────────────
  async function paginaPeticiones(raiz) {
    const lista = raiz.querySelector(".ranking");
    async function pintar() {
      const filas = await api("/rest/v1/rpc/peticiones_ranking", { metodo: "POST", cuerpo: {} });
      lista.replaceChildren();
      if (!filas.length) lista.append(el("li", { className: "suave", textContent: tx("Aún no hay peticiones. ¡Sé la primera persona!", "No requests yet. Be the first!") }));
      for (const p of filas) {
        const votar = el("button", { type: "button", className: "voto", "aria-pressed": String(p.yo_vote) },
          el("span", { "aria-hidden": "true", textContent: "▲ " }), el("span", { textContent: String(p.votos) }),
          el("span", { className: "solo-lector", textContent: p.yo_vote ? tx(" votos, quitar mi voto", " votes, remove my vote") : tx(" votos, votar", " votes, vote") }));
        votar.addEventListener("click", async () => {
          if (!usuario) return invitar(tx("Para votar, entra con GitHub o Google.", "To vote, sign in with GitHub or Google."));
          votar.disabled = true;
          try {
            if (p.yo_vote) await api(`/rest/v1/votos?peticion=eq.${p.id}`, { metodo: "DELETE" });
            else await api("/rest/v1/votos", { metodo: "POST", cuerpo: { peticion: p.id } });
            await pintar();
          } catch (e) { votar.disabled = false; anunciar(e.message); }
        });
        const estado = { "en-curso": tx("En curso", "In progress"), hecha: tx("Hecha", "Done") }[p.estado];
        lista.append(el("li", { className: "peticion" }, votar,
          el("div", {}, el("strong", { textContent: p.titulo }), estado ? el("span", { className: "insignia", textContent: " " + estado }) : "",
             p.detalle ? el("p", { textContent: p.detalle }) : "")));
      }
    }
    const f = raiz.querySelector(".nueva-peticion");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!usuario) return invitar(tx("Para pedir un recurso, entra con GitHub o Google.", "To request a resource, sign in with GitHub or Google."));
      try { await api("/rest/v1/peticiones", { metodo: "POST", cuerpo: { titulo: f.elements.titulo.value.trim(), detalle: f.elements.detalle.value.trim() } });
            f.reset(); anunciar(tx("¡Gracias! Tu petición ya está en la lista.", "Thanks! Your request is on the list.")); await pintar(); }
      catch (e) { anunciar(tx("No se pudo enviar: ", "Could not send: ") + e.message); }
    });
    await pintar();
  }

  // ── Avance en guías (USU-08) ─────────────────────────────────────────────────────────────────────────
  async function avance(raiz) {
    const guia = raiz.dataset.guia;
    const marcas = [...raiz.querySelectorAll("input[type=checkbox]")];
    if (!usuario) { marcas.forEach((m) => m.addEventListener("change", () => { m.checked = false; invitar(tx("Para guardar tu avance, entra con GitHub o Google.", "To save your progress, sign in with GitHub or Google.")); })); return; }
    const hechos = new Set((await api(`/rest/v1/avance?select=capitulo&guia=eq.${guia}`)).map((a) => a.capitulo));
    marcas.forEach((m) => {
      m.checked = hechos.has(m.value);
      m.addEventListener("change", async () => {
        try {
          if (m.checked) await api("/rest/v1/avance", { metodo: "POST", cuerpo: { guia, capitulo: m.value } });
          else await api(`/rest/v1/avance?guia=eq.${guia}&capitulo=eq.${m.value}`, { metodo: "DELETE" });
        } catch (e) { m.checked = !m.checked; anunciar(e.message); }
      });
    });
  }

  // ── Arranque ─────────────────────────────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelectorAll(".cuenta [aria-controls]").forEach((b) => b.addEventListener("click", () => abrirMenu(b)));
    document.querySelectorAll("[data-entrar]").forEach((b) => b.addEventListener("click", () => entrar(b.dataset.entrar)));
    document.querySelectorAll("[data-salir]").forEach((b) => b.addEventListener("click", salir));
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") document.querySelectorAll(".cuenta [aria-expanded='true']").forEach((b) => abrirMenu(b)); });
    document.querySelectorAll(".favorito[data-recurso]").forEach((b) => b.addEventListener("click", () => alternarFavorito(b)));
    document.querySelector(".confirmar-baja")?.addEventListener("click", async (ev) => {   // baja desde el correo, sin sesión
      const res = document.querySelector(".resultado-baja");
      const t = new URLSearchParams(location.search).get("t") || "";
      if (!/^[0-9a-f-]{36}$/i.test(t)) { res.textContent = tx("El enlace no es válido. Desactiva los avisos desde Mi cuenta.", "The link is not valid. Turn off alerts from My account."); return; }
      ev.target.disabled = true;
      try {
        const ok = await api("/rest/v1/rpc/baja_avisos", { metodo: "POST", cuerpo: { token: t } });
        res.textContent = ok ? tx("Listo: ya no recibirás avisos.", "Done: you will not get any more alerts.")
                             : tx("Ese enlace ya no sirve. Desactiva los avisos desde Mi cuenta.", "That link no longer works. Turn off alerts from My account.");
      } catch { res.textContent = tx("No se pudo ahora. Inténtalo en un rato.", "It did not work right now. Try again later."); ev.target.disabled = false; }
    });
    try {
      usuario = await cargarUsuario();
      if (usuario) favoritos = new Map((await api("/rest/v1/favoritos?select=recurso,coleccion")).map((f) => [f.recurso, f.coleccion]));
    } catch (e) {
      console.warn("Cuentas no disponibles:", e.message);              // RNF-08: la web sigue igual, sin botones de cuenta
      return;
    }
    pintarCabecera(); pintarFavoritos();
    const c = document.querySelector(".pagina-cuenta"); if (c) paginaCuenta(c).catch((e) => anunciar(e.message));
    const p = document.querySelector(".pagina-peticiones"); if (p) paginaPeticiones(p).catch((e) => anunciar(e.message));
    document.querySelectorAll(".avance[data-guia]").forEach((a) => avance(a).catch((e) => anunciar(e.message)));
  });
})();
