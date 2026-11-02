// Ctrl+IA. Sin dependencias; nada de innerHTML ni datos del usuario.
"use strict";
document.documentElement.classList.add("js");

// Tema: «auto» sigue al sistema; «claro» u «oscuro» los elige la persona y se recuerdan en este navegador.
// Se aplica aquí (el script va en <head>) para que no parpadee el tema equivocado al cargar.
const sistemaOscuro = window.matchMedia("(prefers-color-scheme: dark)");
const TEMAS = ["auto", "claro", "oscuro"];
let tema = "auto";
try { tema = TEMAS.includes(localStorage.getItem("ctrlia-tema")) ? localStorage.getItem("ctrlia-tema") : "auto"; } catch { /* sin almacenamiento: auto */ }
const aplicarTema = () => {
  document.documentElement.dataset.tema = tema === "auto" ? (sistemaOscuro.matches ? "oscuro" : "claro") : tema;
};
aplicarTema();
sistemaOscuro.addEventListener("change", aplicarTema);
if (window.top !== window.self) document.documentElement.classList.add("enmarcado");

document.addEventListener("DOMContentLoaded", () => {
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Idioma: la elección guardada (botón ES/EN) o, si no hay, el del navegador (español → es, cualquier otro → en).
  // Los buscadores no se redirigen (Google lo desaconseja: rastrea con el navegador en inglés y perdería las páginas en español).
  const recuerda = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };
  const otroIdioma = document.querySelector("a.idioma");
  otroIdioma?.addEventListener("click", () => recuerda("ctrlia-idioma", otroIdioma.hreflang));
  const bot = navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|preview/i.test(navigator.userAgent);
  const quiere = recuerda("ctrlia-idioma") || (/^es\b/i.test(navigator.languages?.[0] || navigator.language || "") ? "es" : "en");
  if (!bot && otroIdioma && quiere === otroIdioma.hreflang && quiere !== document.documentElement.lang) { location.replace(otroIdioma.href + location.search + location.hash); return; }

  // Portada: el buscador lleva a la biblioteca con la consulta (la CSP no deja enviar formularios: se navega desde aquí)
  const portada = document.querySelector(".portada-busca");
  if (portada) {
    portada.hidden = false;
    portada.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const q = portada.elements.q.value.trim();
      location.href = portada.action + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }

  // «¿Qué quieres resolver hoy?»: eliges un problema y aparece el contenido que lo resuelve
  const chips = [...document.querySelectorAll(".portada .problemas .chip")];
  const fichas = new Map([...document.querySelectorAll(".ficha")].map((f) => [f.id.replace(/^r-/, ""), f]));
  const elegir = (id, foco) => {
    if (!fichas.has(id)) return;
    chips.forEach((c) => {
      const si = c.dataset.id === id;
      c.classList.toggle("activo", si);
      if (si) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current");
    });
    fichas.forEach((f, k) => f.classList.toggle("activa", k === id));
    if (foco) fichas.get(id).querySelector("h3").focus({ preventScroll: true });
  };
  chips.forEach((c) => c.addEventListener("click", (ev) => {
    ev.preventDefault();
    elegir(c.dataset.id, false);
    history.replaceState(null, "", "#r-" + c.dataset.id);
  }));
  const desdeHash = () => {
    let id = "";
    try { id = decodeURIComponent(location.hash.slice(1)).replace(/^r-/, ""); } catch { return; }   // hash mal formado: se ignora
    if (fichas.has(id)) { elegir(id, true); document.getElementById("buscar").scrollIntoView({ behavior: quieto ? "auto" : "smooth" }); }
  };
  window.addEventListener("hashchange", desdeHash);
  if (chips.length) elegir(chips[0].dataset.id, false);
  desdeHash();

  // Reel incrustado: no se descarga nada hasta el clic; entonces se reproduce aquí mismo, con sonido
  document.querySelectorAll(".video-reel .video-play").forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const v = document.createElement("video");
    Object.assign(v, { src: a.href, controls: true, autoplay: true, playsInline: true, preload: "auto", className: "video-reproductor" });
    v.setAttribute("aria-label", a.getAttribute("aria-label"));
    a.replaceWith(v); v.focus();
    v.play().catch(() => {});                                      // si el navegador no deja reproducir solo, quedan los controles
  }));

  // Biblioteca: búsqueda por texto (sin acentos) + un formato + un tema; el estado va en la URL (?q=&formato=&tema=)
  const bib = document.querySelector(".biblioteca");
  if (bib) {
    bib.hidden = false;
    const tarjetas = [...document.querySelectorAll(".coleccion .nota-tarjeta")];
    const caja = bib.querySelector("#busca");
    const res = bib.querySelector(".resultado"), nada = bib.querySelector(".sin-resultados");
    const plano = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");   // igual que plano() en web.py
    const elegido = (g) => bib.querySelector(`input[name="${g}"]:checked`)?.value || "";
    const params = new URLSearchParams(location.search);
    caja.value = params.get("q") || "";
    for (const g of ["formato", "tema"]) {
      const r = [...bib.querySelectorAll(`input[name="${g}"]`)].find((x) => x.value === (params.get(g) || ""));
      if (r) r.checked = true;
    }
    const filtrar = () => {
      const palabras = plano(caja.value).split(/\s+/).filter(Boolean);
      const f = elegido("formato"), te = elegido("tema");
      let n = 0;
      tarjetas.forEach((c) => {
        const si = (!f || c.dataset.formato === f) && (!te || c.dataset.tema === te) && palabras.every((w) => c.dataset.buscar.includes(w));
        c.hidden = !si; n += si;
      });
      res.textContent = res.dataset.plantilla.replace("{n}", n).replace("{total}", tarjetas.length);
      nada.hidden = n > 0;
      const u = new URLSearchParams();
      if (caja.value.trim()) u.set("q", caja.value.trim());
      if (f) u.set("formato", f);
      if (te) u.set("tema", te);
      history.replaceState(null, "", location.pathname + (u.size ? "?" + u : ""));
    };
    caja.addEventListener("input", filtrar);
    bib.querySelectorAll("input[type=radio]").forEach((m) => m.addEventListener("change", filtrar));
    bib.querySelector(".limpiar").addEventListener("click", () => {
      caja.value = ""; bib.querySelectorAll('input[type=radio][value=""]').forEach((m) => { m.checked = true; }); filtrar(); caja.focus();
    });
    filtrar();
  }

  // Checklists: las casillas se recuerdan en este navegador (localStorage, clave por contenido); nada va a ningún servidor
  const lista = document.querySelector("[data-casillas]");
  if (lista) {
    const clave = "ctrlia-casillas-" + lista.dataset.casillas;
    const cajas = [...lista.querySelectorAll("input.casilla")];
    const barra = lista.querySelector(".casillas-barra"), estado = barra.querySelector(".casillas-estado");
    let hechas = [];
    try { hechas = JSON.parse(localStorage.getItem(clave) || "[]"); } catch { /* sin almacenamiento o dato roto: empieza vacío */ }
    cajas.forEach((c) => { c.checked = Array.isArray(hechas) && hechas.includes(c.id); });
    const pintar = () => { estado.textContent = estado.dataset.plantilla.replace("{n}", cajas.filter((c) => c.checked).length).replace("{total}", cajas.length); };
    const guardar = () => {
      try { localStorage.setItem(clave, JSON.stringify(cajas.filter((c) => c.checked).map((c) => c.id))); } catch { /* se marca, pero no se recuerda */ }
      pintar();
    };
    cajas.forEach((c) => c.addEventListener("change", guardar));
    barra.querySelector(".casillas-reiniciar").addEventListener("click", () => { cajas.forEach((c) => { c.checked = false; }); guardar(); cajas[0]?.focus(); });
    barra.hidden = false;
    pintar();
  }

  // Botón de tema: automático → claro → oscuro
  const botonTema = document.querySelector(".tema");
  if (botonTema) {
    const en = document.documentElement.lang === "en";
    const NOMBRE = en ? { auto: "automatic", claro: "light", oscuro: "dark" } : { auto: "automático", claro: "claro", oscuro: "oscuro" };
    const pintar = () => {
      botonTema.dataset.estado = tema;   // el CSS muestra el icono que toca
      botonTema.setAttribute("aria-label", (en ? "Theme: " : "Tema: ") + NOMBRE[tema] + (en ? " (change)" : " (cambiar)"));
      botonTema.title = botonTema.getAttribute("aria-label");
    };
    botonTema.hidden = false; pintar();
    botonTema.addEventListener("click", () => {
      tema = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];
      try { localStorage.setItem("ctrlia-tema", tema); } catch { /* se aplica solo en esta página */ }
      aplicarTema(); pintar();
    });
  }

  // Botón «Copiar» en cada bloque de código; el aviso también llega a los lectores de pantalla
  const ingles = document.documentElement.lang === "en";
  const anuncio = document.createElement("p");
  anuncio.className = "solo-lector"; anuncio.setAttribute("role", "status");
  document.body.append(anuncio);
  document.querySelectorAll("pre").forEach((pre) => {
    const caja = document.createElement("div"), boton = document.createElement("button");
    caja.className = "codigo"; pre.before(caja); caja.append(pre, boton);
    boton.type = "button"; boton.className = "copiar"; boton.textContent = ingles ? "Copy" : "Copiar";
    boton.addEventListener("click", async () => {
      let ok = true;
      try { await navigator.clipboard.writeText(pre.innerText.trimEnd()); } catch { ok = false; }
      boton.textContent = anuncio.textContent = ok ? (ingles ? "Copied" : "Copiado") : (ingles ? "Could not copy" : "No se pudo copiar");
      setTimeout(() => { boton.textContent = ingles ? "Copy" : "Copiar"; anuncio.textContent = ""; }, 2000);
    });
  });

  // El Reel solo corre cuando se ve, y nunca con movimiento reducido
  const video = document.querySelector(".byte-video video");
  if (video && !quieto) {
    new IntersectionObserver((ent) => ent.forEach((x) => (x.isIntersecting ? video.play().catch(() => {}) : video.pause())))
      .observe(video);
  }

  // Entradas escalonadas por sección
  const partes = document.querySelectorAll(
    ".cabecera > *, .destacado, .caja, .byte-texto > *, .byte-video, .faq details");
  const visor = new IntersectionObserver((ent) => ent.forEach((x) => {
    if (x.isIntersecting) { x.target.classList.add("dentro"); visor.unobserve(x.target); }
  }), { rootMargin: "0px 0px -6% 0px" });
  let previo = null, n = 0;
  partes.forEach((el) => {
    const sec = el.closest("section, footer");
    n = sec === previo ? n + 1 : 0; previo = sec;
    el.classList.add("aparece");
    el.style.transitionDelay = Math.min(n, 8) * 60 + "ms";
    visor.observe(el);
  });
  // Contador propio y anónimo: sin cookies ni datos personales; respeta "No rastrear" y GPC
  const contador = document.querySelector('meta[name="ctrlia-visitas"]')?.content;
  if (contador && navigator.doNotTrack !== "1" && !navigator.globalPrivacyControl) {
    const ruta = location.pathname.replace(/index\.html$/, "");
    const avisar = (e, o) => navigator.sendBeacon(contador, JSON.stringify({ p: ruta, e, o }));
    // De dónde llega (solo el tipo de sitio, nunca la dirección completa); dentro de ctrlia.dev no cuenta como origen
    let h = ""; try { h = new URL(document.referrer).hostname; } catch { /* sin referrer: directo */ }
    const o = !h ? "directo" : h === location.hostname ? undefined : /(^|\.)instagram\.com$/.test(h) ? "instagram"
      : /(^|\.)tiktok\.com$/.test(h) ? "tiktok" : /(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h) ? "facebook"
      : /(^|\.)google\./.test(h) ? "google" : /(^|\.)bing\.com$/.test(h) ? "bing" : /(^|\.)github\.com$/.test(h) ? "github"
      : h === "dev.to" ? "devto" : "otro";
    avisar("vista", o);
    document.addEventListener("click", (ev) => {
      const h = ev.target.closest("a[href]")?.hostname || "";
      const e = h === "github.com" ? "clic-github" : h === "dev.to" ? "clic-devto" : "";
      if (e) avisar(e);
    });
  }
});
