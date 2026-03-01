// assets/js/main.js
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const startVideo = $(".hero__start");
  const endVideo = $(".hero__end");
  const colorEl = $("h1 .color");
  const stonesWrap = $(".stones");
  const stones = stonesWrap ? $$(".stones > div") : [];

  if (
    !startVideo ||
    !endVideo ||
    !colorEl ||
    !stonesWrap ||
    stones.length === 0
  )
    return;

  // ---------- PRELOADER (added) ----------
  const preloader = document.getElementById("preloader");

  const lockPage = (locked) => {
    document.documentElement.classList.toggle("is-loading", locked);
    document.body.classList.toggle("is-loading", locked);
  };

  const extractFirstBgUrl = (...els) => {
    for (const el of els) {
      if (!el) continue;
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") continue;
      // background-image: url("...")  OR image-set(...)
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (m && m[1]) return m[1];
    }
    return null;
  };

  const waitImageUrl = (url) =>
    new Promise((resolve) => {
      if (!url) return resolve(false);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });

  const waitImgEl = (el) =>
    new Promise((resolve) => {
      if (!el) return resolve(false);
      if (el.complete && el.naturalWidth > 0) return resolve(true);
      const done = () => resolve(true);
      el.addEventListener("load", done, { once: true });
      el.addEventListener("error", done, { once: true });
    });

  const waitVideoFirstFrame = (video) =>
    new Promise((resolve) => {
      if (!video) return resolve(false);
      if (video.readyState >= 2) return resolve(true);

      const done = () => resolve(true);
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", done, { once: true });

      try {
        // чуть “подтолкнуть” загрузку первого кадра
        if (!video.preload || video.preload === "none") video.preload = "auto";
        video.load();
      } catch {}
    });

  const hidePreloader = () =>
    new Promise((resolve) => {
      if (!preloader) return resolve();
      preloader.classList.add("is-hidden");

      const t = setTimeout(resolve, 500);
      preloader.addEventListener(
        "transitionend",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function pickStoneColor(stone) {
    const path = stone.querySelector("svg path[fill]");
    const fill = path?.getAttribute("fill");
    if (fill && fill !== "none" && fill !== "transparent") return fill;

    const anyPath = stone.querySelector("svg path");
    if (anyPath) {
      const cs = getComputedStyle(anyPath);
      if (cs.fill && cs.fill !== "none") return cs.fill;
    }
    return "#9CFFF5";
  }

  function setupStableScrambleLayer(el) {
    // превращаем <span class="color">TEXT</span>
    // в <span class="color"><span class="final">TEXT</span><span class="scramble"></span></span>
    const finalText = el.textContent; // сохраняем как есть (с пробелами)
    el.textContent = "";

    const finalSpan = document.createElement("span");
    finalSpan.className = "final";
    finalSpan.textContent = finalText;

    const scrambleSpan = document.createElement("span");
    scrambleSpan.className = "scramble";
    scrambleSpan.textContent = finalText;

    el.append(finalSpan, scrambleSpan);

    return { finalText, finalSpan, scrambleSpan };
  }

  function scrambleText(scrambleSpan, finalText, durationMs, opts = {}) {
    const charset = (
      opts.charset || "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+-/=<>"
    ).split("");
    const keepSpaces = opts.keepSpaces ?? true;

    const len = finalText.length;
    const start = performance.now();
    let rafId = 0;

    const tick = (now) => {
      const t = clamp((now - start) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const locked = Math.floor(eased * len);

      let out = "";
      for (let i = 0; i < len; i++) {
        const ch = finalText[i];

        if (keepSpaces && ch === " ") {
          out += " ";
          continue;
        }

        if (i < locked) out += ch;
        else out += charset[(Math.random() * charset.length) | 0];
      }

      scrambleSpan.textContent = out;

      if (t < 1) rafId = requestAnimationFrame(tick);
      else scrambleSpan.textContent = finalText;
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }

  async function warmUpVideo(video) {
    // прогрев декодера: play -> поймать первый кадр -> pause
    // (всё muted, поэтому autoplay обычно разрешен)
    try {
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.load();

      // дождаться хоть какой-то готовности к воспроизведению
      await new Promise((res) => {
        if (video.readyState >= 2) return res();
        video.addEventListener("loadeddata", res, { once: true });
      });

      // попытка "прогреть" play()
      await video.play();

      // остановим на первом кадре максимально быстро
      const stop = () => {
        try {
          video.pause();
          video.currentTime = 0;
        } catch {}
      };

      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(() => stop());
      } else {
        setTimeout(stop, 0);
      }
    } catch {
      // если браузер не дал play (хотя muted должен дать) — ничего страшного
    }
  }

  function startStonesAfterSwap(totalStonesMs = 1200) {
    stonesWrap.classList.remove("svg-on");
    stones.forEach((s) => s.classList.remove("is-in"));

    const moveDurMs = 700;
    const svgDelayMs = 1000;

    const n = stones.length;
    const flyWindow = Math.max(totalStonesMs, n * 160); // органичное растяжение

    const step = n > 1 ? (flyWindow - moveDurMs) / (n - 1) : 0;

    stones.forEach((stone, i) => {
      setTimeout(() => stone.classList.add("is-in"), i * step);
    });

    const lastFinish = (n > 1 ? (n - 1) * step : 0) + moveDurMs;

    // через 1s после того как последний доехал — показать svg + glow
    setTimeout(
      () => stonesWrap.classList.add("svg-on"),
      lastFinish + svgDelayMs,
    );
  }

  // ---------- init ----------
  stones.forEach((stone) => {
    const color = pickStoneColor(stone);
    stone.style.setProperty("--glow", color);
  });

  // end video держим скрытым
  endVideo.style.opacity = "0";
  endVideo.currentTime = 0;
  try {
    endVideo.pause();
  } catch {}

  // делаем стабильный слой для scramble
  const { finalText, scrambleSpan } = setupStableScrambleLayer(colorEl);

  // ---------- timeline ----------
  async function run() {
    // 1) стартуем первое видео
    try {
      await startVideo.play();
    } catch {}

    // 2) прогреваем второе видео прямо во время первого (убирает "видимую" задержку)
    warmUpVideo(endVideo);

    // 3) ждём длительность первого (если ещё нет — дождёмся метаданных)
    const duration = await new Promise((res) => {
      if (Number.isFinite(startVideo.duration) && startVideo.duration > 0)
        return res(startVideo.duration);
      startVideo.addEventListener(
        "loadedmetadata",
        () => res(startVideo.duration || 5),
        { once: true },
      );
    });

    const totalMs = duration * 1000;

    // 4) scramble ровно на длительность первого видео
    const stopScramble = scrambleText(scrambleSpan, finalText, totalMs, {
      keepSpaces: true,
    });

    // 5) когда первое закончилось — МГНОВЕННО свопаем и только потом запускаем камни
    startVideo.addEventListener(
      "ended",
      async () => {
        try {
          stopScramble();
        } catch {}
        scrambleSpan.textContent = finalText;

        // СВОП: делаем максимально "без паузы"
        // - endVideo уже прогрет
        // - ставим opacity сразу, без длинных анимаций
        startVideo.style.transition = "opacity 1ms linear";
        endVideo.style.transition = "opacity 1ms linear";

        startVideo.style.opacity = "0";
        endVideo.style.opacity = "1";

        // важное: выставляем кадр в 0 и play — должно быть почти мгновенно после warmUp
        try {
          endVideo.currentTime = 0;
        } catch {}

        try {
          await endVideo.play();
        } catch {}

        // Камни стартуют ТОЛЬКО когда появилось второе видео
        // чуть отложим в следующий кадр, чтобы браузер применил opacity
        requestAnimationFrame(() => {
          requestAnimationFrame(() => startStonesAfterSwap(1400));
        });
      },
      { once: true },
    );
  }

  // ---------- Boot with preloader (added) ----------
  async function boot() {
    if (!preloader) {
      run();
      return;
    }

    lockPage(true);

    // пытаемся достать фон из CSS (чтобы не хардкодить путь)
    const bgUrl = extractFirstBgUrl(
      document.querySelector(".home"),
      document.querySelector(".hero"),
      document.querySelector("body"),
    );

    // луна (под разные варианты разметки)
    const moonImg = document.querySelector(".moon img, img.moon, .moon");

    const PRELOADER_MAX_MS = 6500;

    await Promise.race([
      (async () => {
        await Promise.allSettled([
          waitImageUrl(bgUrl),
          waitImgEl(moonImg && moonImg.tagName === "IMG" ? moonImg : null),
          waitVideoFirstFrame(startVideo),
        ]);
      })(),
      new Promise((res) => setTimeout(res, PRELOADER_MAX_MS)),
    ]);

    await hidePreloader();
    lockPage(false);

    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
