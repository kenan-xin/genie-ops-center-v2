// xok3.65: in development @openuidev/react-lang 1.0.2 mounts its devtools widget from jsDelivr,
// and that widget's hidden help dialog swallows Escape (xok3.59). react-lang skips the mount when
// this flag is already set, so every core module that loads react-lang imports this file first.
// Never overwrite a set value: `true` means react-lang ran first, and the tests must see that.
// Rule: every core file that imports `@openuidev/react-lang` at run time imports this module first.
// Recheck the key when the pinned react-lang version changes. The key stays inside the check so a
// production build drops all of it.
if (process.env.NODE_ENV !== "production") {
  // SAFETY: a global slot under react-lang's own key; this file only writes it while it is unset.
  const flags = globalThis as Record<symbol, string | boolean | undefined>;

  flags[Symbol.for("openui.devtools.autoMount")] ??= "off by @genie/core";
}
