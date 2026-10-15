/**
 * On-screen layer for the demo video, injected into every page before it
 * loads (context.addInitScript). It draws chapter title cards, a caption bar,
 * a highlight box with a label, and a visible cursor, because a recorded
 * browser does not show the real mouse. Nothing here changes the app: every
 * element is outside the page's own markup and ignores pointer events.
 *
 * Plain JavaScript loaded with addInitScript({ path }), so no build step or
 * transpiler helper can end up inside the injected code.
 */
(() => {
  const w = window;
  if (w.__demo) return;

  const brand = "#2d6a4f";
  const cream = "#fefae0";
  const ink = "#264653";
  const gold = "#e9c46a";
  const font = '"DM Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif';

  function layer(id, css) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `position:fixed;pointer-events:none;z-index:2147483646;${css}`;
      document.documentElement.appendChild(el);
    }
    return el;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;

  w.__demo = {
    async chapter(title, subtitle, ms) {
      const card = layer(
        "__demo-chapter",
        `inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:${ink};color:${cream};font-family:${font};opacity:0;transition:opacity 450ms ease;`,
      );
      card.innerHTML = "";
      const bar = document.createElement("div");
      bar.style.cssText = `width:72px;height:6px;border-radius:3px;background:${gold};`;
      const h = document.createElement("div");
      h.textContent = title;
      h.style.cssText = "font-size:64px;font-weight:700;letter-spacing:-0.5px;text-align:center;";
      const p = document.createElement("div");
      p.textContent = subtitle;
      p.style.cssText = "font-size:28px;opacity:0.85;max-width:1100px;text-align:center;";
      card.append(bar, h, p);
      card.style.display = "flex";
      await wait(30);
      card.style.opacity = "1";
      await wait(450 + ms);
      card.style.opacity = "0";
      await wait(450);
      card.style.display = "none";
    },
    caption(text) {
      const bar = layer(
        "__demo-caption",
        `left:50%;bottom:40px;transform:translateX(-50%);max-width:1400px;padding:16px 28px;border-radius:16px;background:rgba(38,70,83,0.92);color:${cream};font:500 28px/1.35 ${font};text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.25);transition:opacity 300ms ease;`,
      );
      bar.textContent = text;
      bar.style.opacity = "1";
      bar.style.display = "block";
    },
    clearCaption() {
      const bar = document.getElementById("__demo-caption");
      if (bar) bar.style.opacity = "0";
    },
    highlight(rect, label) {
      const box = layer(
        "__demo-highlight",
        `border:4px solid ${gold};border-radius:14px;box-shadow:0 0 0 9999px rgba(15,29,34,0.35);transition:all 400ms ease;`,
      );
      const pad = 8;
      box.style.left = `${rect.x - pad}px`;
      box.style.top = `${rect.y - pad}px`;
      box.style.width = `${rect.width + pad * 2}px`;
      box.style.height = `${rect.height + pad * 2}px`;
      box.style.display = "block";
      box.innerHTML = "";
      if (label) {
        const tag = document.createElement("div");
        tag.textContent = label;
        const below = rect.y < 90;
        tag.style.cssText = `position:absolute;left:0;${below ? "top:calc(100% + 12px)" : "bottom:calc(100% + 12px)"};padding:8px 14px;border-radius:10px;background:${gold};color:${ink};font:700 22px/1.2 ${font};white-space:nowrap;`;
        box.appendChild(tag);
      }
    },
    clearHighlight() {
      const box = document.getElementById("__demo-highlight");
      if (box) box.style.display = "none";
    },
    async cursorTo(x, y, ms) {
      const cursor = layer(
        "__demo-cursor",
        `left:0;top:0;width:28px;height:28px;z-index:2147483647;transition:transform ${ms}ms cubic-bezier(.4,0,.2,1);`,
      );
      if (!cursor.firstChild) {
        cursor.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.8 6.4z" fill="${ink}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
        cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
        await wait(20);
      }
      cursor.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      cursorX = x;
      cursorY = y;
      await wait(ms);
    },
    ripple() {
      const dot = document.createElement("div");
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = `position:fixed;left:${cursorX - 18}px;top:${cursorY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid ${brand};pointer-events:none;z-index:2147483647;transition:transform 450ms ease, opacity 450ms ease;`;
      document.documentElement.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transform = "scale(1.8)";
        dot.style.opacity = "0";
      });
      setTimeout(() => dot.remove(), 500);
    },
  };
})();
