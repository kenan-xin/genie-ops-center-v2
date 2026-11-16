import {
  iconAlignmentProblems,
  type IconMeasurement,
  measureIconAlignment,
} from "@genie/ui/testing/icon-alignment";
import { expect, test } from "@playwright/test";

import { iconAlignmentFindings } from "./support/icon-alignment.ts";

/**
 * The approved progress prototype `product/agent-progress.prototype.html` at design `b503b2b`,
 * sha256 `2e3d55682edd58523476a61475dd3e64efa03b17b929dede0f632cabe9652cd9`: its style block and the
 * `#conv` markup its `render()` writes for moment 9 and moment 5, copied once. The test never reads
 * `docs/`, because a documentation-only branch could change the prototype under it.
 */
const PROTOTYPE_STYLE = `:root{--fg:#111827;--panel:#f9fafb;--tile:#f3f4f6;--hair:#e5e7eb;--muted:#4b5563;--icon:#6b7280;--idle:#374151;--primary:#2563eb;--ok:#047857;--font:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}html,body{margin:0}
body{font-family:var(--font);color:var(--fg);background:#e9ebef;padding:16px;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer}:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.ctl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 auto 12px;max-width:980px}.ctl .t{font-weight:700;margin-right:6px}
.seg{display:inline-flex;background:#fff;border-radius:10px;padding:3px;gap:2px;border:1px solid var(--hair);flex-wrap:wrap}
.seg button{border:0;background:none;height:32px;padding:0 10px;border-radius:8px;font-weight:600;font-size:.8125rem;color:var(--idle)}
.seg button[aria-pressed=true]{background:var(--fg);color:#fff}
.wrap{display:flex;gap:24px;justify-content:center;align-items:flex-start;flex-wrap:wrap;max-width:980px;margin:0 auto}
.pane{background:#fff;border-radius:12px;box-shadow:0 20px 40px -20px rgb(0 0 0/.35);overflow:hidden;display:flex;flex-direction:column;height:640px}
.pane.w390{width:390px}.pane.w440{width:440px}
.ph{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--hair);font-weight:700}
.ph .st{font-size:.75rem;font-weight:600;color:var(--muted);background:var(--tile);border-radius:999px;padding:2px 8px}
.conv{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:16px}
.me{align-self:flex-end;background:var(--tile);border-radius:12px 12px 4px 12px;padding:8px 12px;font-size:.9375rem;max-width:80%}
/* One icon column: 20 px, then a 10 px gap, then the label edge. */
.tl{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.r{display:grid;grid-template-columns:16px 1fr auto;column-gap:10px;align-items:center;min-height:32px;font-size:.875rem}
.r .lb{min-width:0;color:var(--idle)}.r .tm{font-size:.75rem;color:var(--muted);font-variant-numeric:tabular-nums}
.r.done .gl{color:var(--icon)}
.r.live .lb{color:var(--fg);font-weight:600}
.r.live{row-gap:4px;padding:4px 0 6px}
.sub{grid-column:2/-1;font-size:.75rem;color:var(--muted)}
.bar{display:flex;gap:3px;grid-column:2/-1;max-width:220px}.bar i{flex:1;height:4px;border-radius:2px;background:var(--hair)}.bar i.on{background:var(--primary)}
/* Icons start at the text edge, not centered in their column; -1px offsets the glyph's own side bearing (6wz1.113). */
.ic{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;display:block;margin-left:-1px}
.fold .ic:last-of-type{margin-left:0}
.spin{width:16px;height:16px;margin:0;border-radius:50%;border:2px solid #bfdbfe;border-top-color:var(--primary);animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.shim{background:linear-gradient(90deg,var(--fg) 0%,var(--fg) 40%,#9ca3af 50%,var(--fg) 60%,var(--fg) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;animation:sh 1.6s linear infinite}
@keyframes sh{from{background-position:100% 0}to{background-position:-100% 0}}
.rm .spin{animation:none;border:0;width:16px;height:16px}.rm .spin::before{content:"";display:block;width:16px;height:16px;border-radius:50%;border:2px dashed var(--primary)}
.rm .shim{animation:none;color:var(--fg)!important;background:none}
.fold{display:grid;grid-template-columns:16px auto auto 1fr;column-gap:10px;align-items:center;min-height:32px;font-size:.875rem;color:var(--muted);border:0;background:none;padding:0;text-align:left;border-radius:8px}
.fold:hover{background:rgb(17 24 39/.06)}
.spark{color:var(--primary)}
.ans{font-size:.9375rem;line-height:1.55;margin:0}.ans b{font-weight:700}
.comp{border-top:1px solid var(--hair);padding:12px 16px}
.box{border:1px solid #6b7280;border-radius:12px;padding:10px 12px;min-height:72px;display:flex;flex-direction:column;justify-content:space-between;color:var(--muted);font-size:.875rem}
.box .row{display:flex;justify-content:flex-end}.sq{width:36px;height:36px;border-radius:8px;border:0;background:var(--primary);display:grid;place-items:center}.sq span{width:12px;height:12px;background:#fff;border-radius:2px}
.send{width:36px;height:36px;border-radius:8px;border:0;background:#93c5fd;display:grid;place-items:center;color:#fff}
.side{max-width:420px;background:#fff;border-radius:12px;padding:16px 20px;font-size:.9375rem;line-height:1.55;border:1px solid var(--hair)}
.side h3{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}.side h3:first-child{margin-top:0}.side ul{margin:0;padding-left:18px}
.now{font-weight:700;color:var(--primary)}`;

const MOMENT_9 = `<div class="conv" id="conv"><div class="me">add 4 more slides</div><button class="fold" aria-expanded="false"><span class="spark"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path></svg></span><span>Worked for 24s · 7 steps</span><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg><span></span></button><p class="ans">Added four slides, so the deck now has <b>9 slides</b>. Slides 6 to 9 cover payment behaviour, the largest overdue balances, collections by customer and next steps. Every number was checked against its chart.</p></div>`;

/** Moment 5, with the answer text added as the last child of `#conv`, so the checks have an edge. */
const MOMENT_5 = `<div class="conv" id="conv"><div class="me">add 4 more slides</div><ol class="tl" aria-label="Progress"><li class="r done"><span class="gl"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg></span><span class="lb">Looked up the data</span><span class="tm">1s</span></li><li class="r done"><span class="gl"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg></span><span class="lb">Read the deck</span><span class="tm">1s</span></li><li class="r done"><span class="gl"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg></span><span class="lb">Read Invoices · 4 reads</span><span class="tm">3s</span></li><li class="r live" role="status"><div class="spin" aria-hidden="true"></div><span class="lb shim">Thinking</span><span class="tm">0s</span></li></ol><p class="ans">Added four slides, so the deck now has 9 slides.</p></div>`;

const prototypePage = (conv: string): string =>
  `<!doctype html><html><head><style>${PROTOTYPE_STYLE}</style></head><body><section class="pane w390">${conv}</section></body></html>`;

const starts = (measurement: IconMeasurement) =>
  measurement.relations
    .filter((relation) => relation.rule === "start")
    .map(({ icon, offsetPx, cause }) => ({ icon, offsetPx, cause }));

// T3-a: the owner measured the prototype with the stroke-widened ink box (P07-8): the fold
// sparkle +0.8 and the circle checks -0.2 against the answer text edge, the spinner ring 0.0.
test("the icon check measures the approved progress prototype like the owner @no-screen", async ({
  page,
}) => {
  await page.setContent(prototypePage(MOMENT_9));
  // The fold's 6% hover layer is no visible box, so the hovered fold still measures to the text.
  await page.hover(".fold");
  const answer = await page.evaluate(measureIconAlignment, []);
  const answerFindings = await iconAlignmentFindings(page);

  await page.setContent(prototypePage(MOMENT_5));
  const thinking = await page.evaluate(measureIconAlignment, []);
  const thinkingFindings = await iconAlignmentFindings(page);

  expect({
    answer: starts(answer),
    answerFindings,
    thinking: starts(thinking).map(({ icon, offsetPx }) => ({
      icon,
      offsetPx,
    })),
    thinkingFindings,
  }).toEqual({
    answer: [{ icon: "svg.ic", offsetPx: 0.8, cause: "bearing" }],
    answerFindings: [],
    thinking: [
      { icon: "svg.ic", offsetPx: -0.2 },
      { icon: "svg.ic", offsetPx: -0.2 },
      { icon: "svg.ic", offsetPx: -0.2 },
      { icon: "box 16x16", offsetPx: 0 },
    ],
    thinkingFindings: [],
  });
});

const glyph = (name: string, body: string, extra = ""): string =>
  `<svg class="lucide lucide-${name}${extra}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const SPARKLES =
  '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>';

const CHECK = '<path d="M20 6 9 17l-5-5"/>';

const INFO =
  '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';

const CIRCLE = '<circle cx="12" cy="12" r="10"/>';

const CIRCLE_CHECK =
  '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>';

const PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';

const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

const CHEVRON = '<path d="m9 18 6-6-6-6"/>';

const FILE_TEXT =
  '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>';

const LOADER = '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>';

/**
 * One block per case. Each block scrolls (`overflow: auto`), so it is a column of its own and the
 * column search never reaches the next case. Text is 14 px on 20 px lines unless a case says
 * otherwise. Glyphs are Lucide path data, 16 px, stroke 2 with round caps and joins. A `.box` is a
 * 16 px bordered box, the step node or swatch of a real screen. The `Fixture` font pins the ascent
 * and descent, so a text line's center sits on its line box's center with any local sans font
 * (P07-25); unpinned, the leading splits unevenly and a center moves by 0.5 px between runners.
 */
const CASES = `<!doctype html>
<html>
  <head>
    <style>
      @font-face { font-family: Fixture; src: local("DejaVu Sans"), local("Liberation Sans"), local("Noto Sans Regular"), local("Arial"), local("Helvetica"); ascent-override: 80%; descent-override: 20%; line-gap-override: 0%; }
      body { margin: 0; font: 14px/20px Fixture, sans-serif; color: #111827; }
      p, h2 { margin: 0; }
      button { font: inherit; color: inherit; border: 0; background: none; padding: 0; text-align: left; }
      .case { overflow: auto; padding: 16px; }
      .lucide { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .row { display: flex; align-items: center; gap: 8px; }
      .box { display: block; flex: none; box-sizing: border-box; width: 16px; height: 16px; border: 1px solid #374151; }
      .fold { display: flex; align-items: center; gap: 8px; padding-left: 4px; }
      .tile { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #dbeafe; }
      .tile .lucide { width: 14px; height: 14px; }
      .ring { flex: none; box-sizing: border-box; width: 16px; height: 16px; margin-left: -4px; border: 2px solid #2563eb; border-radius: 50%; }
      .note { display: flex; align-items: flex-start; gap: 10px; padding: 12px; background: #eff6ff; }
      .note .lucide { transform: translateY(2px); }
      .note-row { display: flex; align-items: center; gap: 8px; flex: 1; }
      .action { height: 32px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
      .narrow { width: min-content; }
      .slot { display: flex; justify-content: center; width: 20px; }
      .gutter { display: flex; align-items: flex-start; gap: 12px; }
      .gutter-tile { display: grid; place-items: center; flex: none; box-sizing: border-box; width: 28px; height: 28px; border: 1px solid #d1d5db; border-radius: 8px; }
      .answer { font-size: 16px; line-height: 24px; }
      .answer:first-child { margin-top: 8px; }
      .dialog-head { display: flex; align-items: center; justify-content: space-between; }
      .dialog-head h2 { font-size: 18px; line-height: 28px; }
      .icon-button { display: grid; place-items: center; width: 32px; height: 32px; }
      .menu { width: 200px; padding: 4px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
      .menu-label { padding: 6px 8px; font-size: 12px; line-height: 16px; color: #6b7280; }
      .menu-item { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 8px; }
      .lead { position: relative; left: -1px; }
      .filled { display: inline-flex; align-items: center; gap: 6px; height: 36px; margin-top: 8px; padding: 0 12px; border-radius: 6px; background: #2563eb; color: #fff; }
      table { border-collapse: collapse; }
      th, td { padding: 8px 16px 8px 0; text-align: left; }
      .status { display: inline-flex; align-items: center; gap: 6px; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #047857; }
      .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; text-align: center; }
      .empty-media { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: #f3f4f6; }
      .chevron-row { display: inline-flex; align-items: center; gap: 4px; }
      .alert { display: flex; align-items: flex-start; gap: 10px; margin-top: 8px; padding: 12px; border: 1px solid #fca5a5; border-radius: 8px; background: #fef2f2; }
      .alert .lucide { margin-top: 2px; }
      .alert-title { font-weight: 600; }
      .step { position: relative; display: flex; gap: 12px; }
      .step-node { flex: none; padding-top: 2px; }
      .step-node .box { border-radius: 50%; }
      .step-words { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
      .pill { padding: 0 6px; border-radius: 999px; background: #f3f4f6; font-size: 12px; line-height: 16px; font-weight: 600; }
      .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
      .hidden { display: none; }
      .indent { margin-left: 6px; }
      .spin { animation: spin 1s linear infinite; animation-delay: -0.6s; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .above { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
      .center-column { display: flex; flex-direction: column; align-items: center; }
      .full { width: 100%; }
      .switch { position: relative; display: inline-flex; flex: none; box-sizing: border-box; width: 40px; height: 24px; align-items: center; padding: 2px; border-radius: 999px; background: #2563eb; }
      .switch-thumb { display: block; width: 20px; height: 20px; border-radius: 50%; background: #fff; transform: translateX(16px); }
      .radio { position: relative; display: flex; flex: none; box-sizing: border-box; width: 16px; height: 16px; border: 1px solid #2563eb; border-radius: 50%; background: #2563eb; }
      .radio-indicator { display: flex; width: 16px; height: 16px; align-items: center; justify-content: center; }
      .radio-dot { position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; transform: translate(-50%, -50%); border-radius: 50%; background: #fff; }
      .described { display: flex; align-items: flex-start; gap: 8px; }
      .described .lucide { margin-top: 2px; }
      .media { display: flex; align-items: flex-start; gap: 12px; }
      .media .box { margin-top: 2px; }
      .stack { display: flex; flex-direction: column; }
      .hidden-input { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; white-space: nowrap; clip-path: inset(50%); }
    </style>
  </head>
  <body>
    <div class="case"><button class="fold"><span class="tile">${glyph("sparkles", SPARKLES)}</span>Worked for 38 seconds</button><p>Here is the chart.</p></div>
    <div class="case"><div class="row">${glyph("check", CHECK)}Saved</div><p>Your changes are kept.</p></div>
    <div class="case"><div class="row"><span class="box"></span>Looked up the data</div><div class="row"><span class="ring"></span>Changing the deck</div></div>
    <div class="case"><div class="note">${glyph("info", INFO)}<div class="note-row"><span>Colors changed.</span><button class="action">Undo</button></div></div></div>
    <div class="case"><div class="row"><span class="box"></span><span class="narrow">Two lines</span></div></div>
    <div class="case"><div class="row"><span class="slot"><span class="box"></span></span>Payments</div><p>All open payments.</p></div>
    <div class="case"><div class="gutter"><span class="gutter-tile">${glyph("sparkles", SPARKLES)}</span><div><p class="answer">The deck has 9 slides.</p><p class="answer">Slides 6 to 9 are new.</p><button>Copy</button></div></div></div>
    <div class="case"><div class="dialog-head"><h2>Edit invoice</h2><button class="icon-button" aria-label="Close">${glyph("x", X)}</button></div></div>
    <div class="case"><div class="menu" role="menu"><div class="menu-label">Status</div><div class="menu-item" role="menuitem">${glyph("circle", CIRCLE, " lead")}Draft</div><div class="menu-item" role="menuitem">${glyph("circle", CIRCLE, " lead")}Paid</div></div></div>
    <div class="case"><p>Create the first invoice.</p><button class="filled">${glyph("plus", PLUS)}New invoice</button></div>
    <div class="case"><table><thead><tr><th>Invoice</th><th>Status</th></tr></thead><tbody><tr><td>INV-001</td><td><span class="status"><span class="dot"></span>Paid</span></td></tr><tr><td>INV-002</td><td>Draft</td></tr></tbody></table></div>
    <div class="case"><div class="empty"><div class="empty-media">${glyph("file-text", FILE_TEXT)}</div><div>No invoices yet</div><p>Invoices you create show here.</p></div></div>
    <div class="case"><a class="chevron-row" href="#settings">Settings${glyph("chevron-right", CHEVRON)}</a></div>
    <div class="case"><p>Payment failed twice.</p><div class="alert">${glyph("info", INFO)}<div><div class="alert-title">Card declined</div><div>Ask the customer for another card.</div></div></div></div>
    <div class="case"><p>Steps</p><div class="step"><span class="step-node"><span class="box"></span></span><div class="step-words"><span>Read Invoices</span><span class="pill"><span aria-hidden="true">×3</span><span class="sr-only">3 times</span></span></div></div></div>
    <div class="case"><div class="row">${glyph("x", X, " hidden")}Nothing to close</div><p>The list is empty.</p></div>
    <div class="case" data-allowed><div class="row"><span class="box indent"></span>Legacy row</div><p>Kept as it is.</p></div>
    <div class="case"><div class="row">${glyph("loader-circle", LOADER, " lead spin")}Loading moving</div><p>Waiting for the answer.</p></div>
    <div class="case"><div class="row">${glyph("loader-circle", LOADER, " lead")}Loading still</div><p>Waiting for the answer.</p></div>
    <div class="case"><div class="above">${glyph("circle-check", CIRCLE_CHECK)}<div>Invoices</div></div></div>
    <div class="case"><div class="center-column"><p class="full">Centered column answer.</p><div class="row full"><span class="box indent"></span>Read the deck</div></div></div>
    <div class="case"><div class="row"><span class="switch" role="switch" aria-checked="true" aria-label="Email me" data-checked><span class="switch-thumb"></span></span><input type="checkbox" class="hidden-input" checked aria-hidden="true" tabindex="-1"><span>Email me</span></div><div class="row"><span class="radio" role="radio" aria-checked="true" aria-label="Monthly" data-checked><span class="radio-indicator"><span class="radio-dot"></span></span></span><input type="radio" class="hidden-input" checked aria-hidden="true" tabindex="-1"><span>Monthly</span></div></div>
    <div class="case"><div class="row"><span class="box indent"></span>Monthly report<input type="checkbox" class="hidden-input" aria-hidden="true" tabindex="-1"></div><p>Sent on the first day.</p></div>
    <div class="case"><div class="described" role="menuitem">${glyph("plus", PLUS)}<div><div>Save as view</div><div>Keeps the filters</div></div></div><div class="described" role="menuitem">${glyph("x", X)}<div><div>Delete view</div><div>Undo restores it</div></div></div></div>
    <div class="case"><table><tbody><tr><td><span class="media"><span class="box"></span><span class="stack"><span>Contractors</span><span>Directory group</span></span></span></td></tr></tbody></table></div>
    <div class="case"><div class="media"><span class="stack"><span>Fixture</span><span>Records that prove the module</span></span><span class="box"></span></div></div>
  </body>
</html>`;

const ALLOW = [
  { selector: "[data-allowed]", reason: "The fixture's allowed case." },
];

// T3-b: the problems are exactly the known cases (D1, the Lucide side bearing, E1, E5, a two-line
// label, a centered slot, the 2026-11-07 gutter, a full-width row in a centered column and a row
// that holds a visually hidden input), and the allowed layouts give none: an icon-only button, a
// menu, a filled button, a table, an empty state, a trailing chevron, an alert, a step row with a
// hidden count, a hidden icon, an allow entry, a rotating glyph, a checked switch, a checked
// radio, a list whose labels carry a description under them (P07-33), and a table cell's media and a
// trailing box beside a stack of text blocks (P07-34).
test("the icon check finds each known case and nothing in the allowed layouts @no-screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(CASES);

  const fontPinned = await page.evaluate(async () => {
    await document.fonts.ready;

    return document.fonts.check("14px Fixture");
  });

  const allowed = await page.evaluate(measureIconAlignment, ALLOW);
  const all = await page.evaluate(measureIconAlignment, []);
  const problems = iconAlignmentProblems(allowed.relations);

  const of = (key: string) =>
    allowed.relations
      .filter((relation) => relation.icon === key || relation.row === key)
      .map(({ rule, offsetPx }) => ({ rule, offsetPx }));

  expect({
    fontPinned,
    units: allowed.units,
    problems,
    onlyWithoutAllow: iconAlignmentProblems(all.relations).filter(
      (problem) => !problems.includes(problem)
    ),
    chevron: of("lucide-chevron-right"),
    emptyState: of("tile(lucide-file-text)"),
    above: of("lucide-circle-check"),
    rotating: of("Loading moving"),
    still: of("Loading still"),
  }).toEqual({
    fontPinned: true,
    units: 25,
    problems: [
      'center +10.0 px box: box 16x16 in "Two lines" against text "Two lines"',
      'center -6.0 px box: lucide-info in "Colors changed.Undo" against text "Colors changed."',
      'center -6.0 px box: tile(lucide-sparkles) in "The deck has 9 slides.Slides 6 to 9 are" against text "The deck has 9 slides."',
      'gutter -40.0 px box: tile(lucide-sparkles) in "The deck has 9 slides.Slides 6 to 9 are" against text "The deck has 9 slides."',
      'slot +2.0 px box: box 16x16 in "Payments" against slot 20px',
      'start +2.0 px bearing: lucide-check in "Saved" against text "Your changes are kept."',
      'start +2.0 px box: box 16x16 in "Payments" against text "All open payments."',
      'start +4.0 px box: tile(lucide-sparkles) in "Worked for 38 seconds" against text "Here is the chart."',
      'start +6.0 px box: box 16x16 in "Monthly report" against text "Sent on the first day."',
      'start +6.0 px box: box 16x16 in "Read the deck" against text "Centered column answer."',
      'start -4.0 px box: box 16x16 in "Changing the deck" against icon box 16x16',
    ],
    onlyWithoutAllow: [
      'start +6.0 px box: box 16x16 in "Legacy row" against text "Kept as it is."',
    ],
    chevron: [{ rule: "center", offsetPx: 0 }],
    emptyState: [],
    above: [{ rule: "start", offsetPx: 0.7 }],
    rotating: [
      { rule: "center", offsetPx: 0 },
      { rule: "start", offsetPx: 0.3 },
    ],
    still: [
      { rule: "center", offsetPx: 0 },
      { rule: "start", offsetPx: 0.3 },
    ],
  });
});
