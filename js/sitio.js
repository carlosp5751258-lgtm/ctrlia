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

  // Aviso «Prefer English?»: solo en páginas en español, con el navegador en inglés y si no se cerró antes
  const recuerda = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };
  const aviso = document.querySelector(".aviso-idioma");
  if (aviso && /^en\b/i.test(navigator.languages?.[0] || navigator.language || "") && !recuerda("ctrlia-aviso-idioma")) aviso.hidden = false;
  aviso?.querySelector(".aviso-cerrar").addEventListener("click", () => { aviso.hidden = true; recuerda("ctrlia-aviso-idioma", "no"); });
  document.querySelectorAll(".idioma, .aviso-idioma a").forEach((a) => a.addEventListener("click", () => recuerda("ctrlia-aviso-idioma", "no")));

  // Buscador: eliges qué quieres resolver y aparece el recurso que lo arregla
  const chips = [...document.querySelectorAll(".portada .chip")];   // solo los del buscador (los de .tipos son enlaces normales)
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

  // Biblioteca: búsqueda por texto (sin acentos) y filtros por tema que se combinan (deben cumplirse todos)
  const bib = document.querySelector(".biblioteca");
  if (bib) {
    bib.hidden = false;
    const tarjetas = [...document.querySelectorAll("#recursos .recurso")];
    const caja = bib.querySelector("#busca"), marcas = [...bib.querySelectorAll(".filtros input")];
    const res = bib.querySelector(".resultado"), nada = bib.querySelector(".sin-resultados");
    const plano = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");   // igual que plano() en web.py
    const filtrar = () => {
      const palabras = plano(caja.value).split(/\s+/).filter(Boolean);
      const elegidas = marcas.filter((m) => m.checked).map((m) => m.value);
      let n = 0;
      tarjetas.forEach((c) => {
        const temas = c.dataset.etiquetas.split(" ");
        const si = elegidas.every((x) => temas.includes(x)) && palabras.every((w) => c.dataset.buscar.includes(w));
        c.hidden = !si; n += si;
      });
      document.querySelectorAll("#recursos .grupo").forEach((g) => { g.hidden = !g.querySelector(".recurso:not([hidden])"); });
      res.textContent = res.dataset.plantilla.replace("{n}", n).replace("{total}", tarjetas.length);
      nada.hidden = n > 0;
    };
    caja.addEventListener("input", filtrar);
    marcas.forEach((m) => m.addEventListener("change", filtrar));
    bib.querySelector(".limpiar").addEventListener("click", () => {
      caja.value = ""; marcas.forEach((m) => { m.checked = false; }); filtrar(); caja.focus();
    });
    filtrar();
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

  // «Nuevo» durante los 14 días siguientes al alta del recurso
  document.querySelectorAll(".nuevo[data-alta]").forEach((n) => {
    const dias = (Date.now() - Date.parse(n.dataset.alta + "T00:00:00Z")) / 864e5;
    n.hidden = !(dias >= 0 && dias < 14);
  });

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
    ".hero-texto > *, .hero-visual, .cabecera > *, .grupo-titulo, .recurso, .chips, .fichas, .caja, .plan, .byte-texto > *, .byte-video, .faq details");
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
      const e = h.endsWith("gumroad.com") ? "clic-gumroad" : h === "github.com" ? "clic-github" : h === "dev.to" ? "clic-devto" : "";
      if (e) avisar(e);
    });
  }
});
