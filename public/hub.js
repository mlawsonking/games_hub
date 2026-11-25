// Games hub: click-to-play for the one console on a game page. Without this file the Play
// control is a plain link to the game's own site, so nothing needs JavaScript to be seen or played.
(() => {
  "use strict";
  const con = document.querySelector("[data-console]");
  if (!con) return;
  const $ = (sel) => con.querySelector(sel);
  const screen = $("[data-screen]");
  const play = $("[data-play]");
  const btnFs = $("[data-fs]");
  const btnStop = $("[data-stop]");
  const btnExit = $("[data-exit]");
  const state = $("[data-state]");
  const hint = $("[data-hint]");
  const canFull = !!(document.fullscreenEnabled && screen.requestFullscreen);
  let frame = null;

  // The link becomes a button: it starts the game here instead of leaving the page.
  play.setAttribute("role", "button");
  play.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); start(); } });
  play.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let "open in new tab" gestures through
    e.preventDefault();
    start();
  });

  const inFull = () => document.fullscreenElement === screen;
  const exitFull = () => (document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : Promise.resolve());

  function start() {
    if (frame) { frame.focus(); return; }
    frame = document.createElement("iframe");
    frame.className = "frame";
    frame.title = con.dataset.title;
    frame.setAttribute("sandbox", con.dataset.sandbox);
    if (con.dataset.allow) frame.setAttribute("allow", con.dataset.allow);
    frame.referrerPolicy = "no-referrer";
    frame.src = con.dataset.url;
    frame.addEventListener("load", () => { if (frame && !document.hidden) frame.focus(); });
    screen.appendChild(frame);
    con.classList.add("is-on");
    btnStop.hidden = false;
    btnFs.hidden = !canFull;
    hint.hidden = false;
    state.textContent = "On. The game is running in this frame.";
    // Bring the whole console into view: the screen on a phone, screen plus controls elsewhere.
    if (window.matchMedia("(max-width: 47.99rem)").matches) screen.scrollIntoView({ block: "start" });
    else con.scrollIntoView({ block: "nearest" });
    frame.focus();
  }

  function stop() {
    exitFull().then(() => {
      if (!frame) return;
      frame.remove();
      frame = null;
      con.classList.remove("is-on");
      btnStop.hidden = true;
      btnFs.hidden = true;
      hint.hidden = true;
      state.textContent = "Off. The game was stopped and unloaded.";
      play.focus();
    });
  }

  btnStop.addEventListener("click", stop);
  btnFs.addEventListener("click", () => { screen.requestFullscreen().catch(() => {}); });
  btnExit.addEventListener("click", () => { exitFull(); });
  document.addEventListener("fullscreenchange", () => {
    btnExit.hidden = !inFull();
    if (frame) frame.focus();
  });
})();
