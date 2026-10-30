// Ctrl+IA. Sin dependencias; nada de innerHTML ni datos del usuario.
"use strict";
document.documentElement.classList.add("js");
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
  const chips = [...document.querySelectorAll(".chip")];
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
