# Design import, 2026-11-09: the wave 5 prototypes, variant A of each

Status: imported reference snapshot for S7-43, S7-45, S7-46 and S7-47. The run picked variant A of each prototype on 2026-11-09, without a stop, and the owner reviews the picks at gate G3 (owner, 2026-11-08). It is not design approval. Phase 13 builds the slide editor controls, Phase 14 the presenter window, and Phase 15 the filter bar and the view menu.

## Why

Wave 5 adds position and style per slide element (R-52a), speaker notes with a presenter window (R-55a), and dashboard filters with saved views (R-49, R-49a). Phase W3a of follow-up 11 drew three variants of each screen. Phase 12 critiqued every variant at 1440 x 900 and 390 x 844 and picked one, so that the build phases start from committed design.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, worktree `genie-ops-center-design-prototype-wave-5`, branch `chore/prototype-wave-5`, commit `27b9ccc` (after `9dc8045`).

1. The prototypes `product/slide-editor-controls.prototype.html`, `product/presenter-window.prototype.html` and `product/dashboard-filters.prototype.html` were copied to `prototypes/`. The copies are identical to `27b9ccc`.
2. The 62 variant A captures came from a headless Chromium run at 1440 x 900 and at 390 x 844 with touch, at `27b9ccc`. They were copied to `sections/invoices-and-payments/<prototype>/` as `variant-A-<state>-<width>.png`. The variants B and C captures were not imported, because the run did not pick them.
3. The data is fictional sample data ("Demo Company", "Sample Trading", "Example Supplies"). No real person's data is shown.

## Picks

| Prototype | Pick | Ticket | Why |
| --- | --- | --- | --- |
| Slide editor controls | A, a floating toolbar on the selection | S7-43 | Only A keeps drag and resize on a phone, so the S7-43 end-to-end test runs at both viewports. Its popover toolbar leaves the right side of the deck page to the Slides agent panel. |
| Presenter window | A, the current slide first | S7-45 | It is the presenter layout of PowerPoint, Keynote and Google Slides. Present stays one click, with "Present with notes" in a split button. |
| Dashboard filter bar and view menu | A, the view menu first | S7-46, S7-47 | It reuses the list header's filter triggers, and its Filters sheet on a phone. A panel says in one sentence when a filter does not apply to it. |

Phase 12 fixed three defects in the picks before the import, in `27b9ccc`:

- The slide editor toolbar gained a Position control. It opens a nudge pad and width and height steppers, as a popover on a desktop and as a bottom sheet on a phone. It moves and resizes an element without a drag (WCAG 2.2 SC 2.5.7).
- The slide editor dock on a phone wraps into two rows, so that Border, Position and Edit text show.
- On a phone, the title of the Edit slide sheet in the presenter prototype sits at the left, under the grab bar.

## Open the prototypes

Open each file in a browser. Each file opens variant A when the address has no `?variant=`. The switcher at the bottom (at the top on a phone) changes the variant and the state. A deep link is `?variant=A&state=<state>`. The variants B and C stay in the files as the record of the comparison.

| Prototype | States |
| --- | --- |
| `slide-editor-controls.prototype.html` | `idle`, `selected-text`, `selected-visual`, `moving`, `resizing`, `nudge` (Position open), `add-element`, `background`, `refused`, `undo` |
| `presenter-window.prototype.html` | `presenter`, `last-slide`, `no-notes`, `long-notes`, `audience`, `open-present`, `editor-notes`, `editor-notes-phone`, `notes-cap` |
| `dashboard-filters.prototype.html` | `clear`, `two-set`, `open-date`, `open-select`, `open-multi`, `open-toggle`, `own-range`, `not-applied`, `views`, `view-changed`, `default-view`, `max-fields` |

Each state has `variant-A-<state>-1440.png` and `variant-A-<state>-390.png`.

## Checks

- axe-core 4.14, WCAG 2.0 and 2.1 A and AA plus best practice: 0 violations and no page errors on every variant, state and viewport of the three files.
- `impeccable detect`: one finding per file, `overused-font` (Plus Jakarta Sans). Kept, because the owner keeps the font (DEC-47).
- A Chromium check of the Position control at 1440 and at 390: two taps moved the element 16 units as one Undo entry, and one tap made it 8 units wider as a second entry.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/slide-editor-controls.prototype.html` | Added | `8d13387aa02d770273fccc35772db7a123d0f5f03487b9ab7f466cecdc585cc1` |
| `prototypes/presenter-window.prototype.html` | Added | `e54649f68a8dab1b500f6c42706e33a3971dd5a6b9ce63a3216fb407c057c3fa` |
| `prototypes/dashboard-filters.prototype.html` | Added | `9d6907f0d9d48e816c7ae4beed2988a11bbe98d37469e5b947267cb9b46d0f21` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-add-element-1440.png` | Added | `b13190acd71ce7c49852fc6a0022a1860d57988a48b735a193364f063e1c8e9a` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-add-element-390.png` | Added | `f3c2b4e060b322b5fe3fc506b4eee5f32809dd2843187dd3a6869fcd84eaf070` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-background-1440.png` | Added | `9717cfc79948fc4608e4fa0454cd3ee7ad9e120a4b0bc2b93d267d15dc297524` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-background-390.png` | Added | `105d6b39a4f90137917b213d4d2757751e253ffce3994b194b2523700318b6a4` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-idle-1440.png` | Added | `f62fab8f6e3d9f3471bdc815a9d49f8c47805eb5513af625f844144c15891355` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-idle-390.png` | Added | `ae2d1a7a54caf279d6c8ce143baeaf2325b157b0069b25abe402438c64edee6a` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-moving-1440.png` | Added | `491f08be5e1023b478fcf877b2d151fb6667bf380d91472d508372276b4ba660` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-moving-390.png` | Added | `2de5ecf7f768c989764ef420466ade1a06f1074633c2d56cf2004a0adefe8415` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-nudge-1440.png` | Added | `ca5f4f3560c3fe9a32a6668eccaa02e83180fd97f16d933040be25f002502db7` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-nudge-390.png` | Added | `cb0110da5fa1fdf7097b64a39e8d9c0b9e374487dfdd7df4467ea147485452ca` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-refused-1440.png` | Added | `02fde0a3708f56315b81cd7894895c90d6a1144174b9233cce0c043c0845f4bc` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-refused-390.png` | Added | `334e74564139db0adcc161709d95af03482ff208701dbd95b1993384d199b815` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-resizing-1440.png` | Added | `6733e8ec44c2a6abdf316e89af6293fcef7e09c42a2e5f7da63e260d61809239` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-resizing-390.png` | Added | `bd40ab63303b758ebaa560095dc07fa358d2804781aa75124edf1837803f6e16` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-selected-text-1440.png` | Added | `85ef7430620fb8fb34b01006f7a66e3bd5670023f4f35f1ced1ab5b1e1a19f93` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-selected-text-390.png` | Added | `024c063a713f247a0bb5eb150617f4a2defc7fa26b9feb71107ce93695ad20ca` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-selected-visual-1440.png` | Added | `fc3d2f0378dd00da5e638fde178aa36774ba04d739f7149e4f705c51cc8d67af` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-selected-visual-390.png` | Added | `a57ead4f56519f3eac32b3d9f1abe0ceca263d4885bb08a513b42d6c4ea5a81c` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-undo-1440.png` | Added | `b362d6916adc7697160c1c919ca18ef6808d19293a9c44c58574e362cb9f09b9` |
| `sections/invoices-and-payments/slide-editor-controls/variant-A-undo-390.png` | Added | `3f84bfa1047da3f3d4b6e157abbd606b4e6bb8980221a6a30a07d663653c020a` |
| `sections/invoices-and-payments/presenter-window/variant-A-audience-1440.png` | Added | `d980a2fdc05d903f7e3431c4687d44fd13faa7a01e006c635776f1d57ea073da` |
| `sections/invoices-and-payments/presenter-window/variant-A-audience-390.png` | Added | `63820782832a9fa4f982698110957b27f8a5c69f3bcc4d077a405d2b39972e23` |
| `sections/invoices-and-payments/presenter-window/variant-A-editor-notes-1440.png` | Added | `1c300f6489d6ece8f804f13c98efb58f8ca9b471685e929b575ea5b195296b56` |
| `sections/invoices-and-payments/presenter-window/variant-A-editor-notes-390.png` | Added | `86bd9c6a6aecc3754ff67417c6f08e1b90ce02bfdc0c707539574d1155ba5d35` |
| `sections/invoices-and-payments/presenter-window/variant-A-editor-notes-phone-1440.png` | Added | `621de1cf3371d2f9bcc3235ec6d0e80c927491911ada864cec7384d7f0019583` |
| `sections/invoices-and-payments/presenter-window/variant-A-editor-notes-phone-390.png` | Added | `981e4a9d13f59b5f3bd1c339948f8d07209090ff6e37330e41ed4cda29519a8a` |
| `sections/invoices-and-payments/presenter-window/variant-A-last-slide-1440.png` | Added | `5e73746fd87a7b32e497f372d86f42c7410537964128ef9180710f06b07cf594` |
| `sections/invoices-and-payments/presenter-window/variant-A-last-slide-390.png` | Added | `6d1a75d5f8fe7a9df13f86b558f48e6690eb28eaf2536e2335c48e7fc8c95d4e` |
| `sections/invoices-and-payments/presenter-window/variant-A-long-notes-1440.png` | Added | `8d85fffba48a8874a3b320f717d82ea5184505e8cd563800b1259c91da552a5a` |
| `sections/invoices-and-payments/presenter-window/variant-A-long-notes-390.png` | Added | `c6622523f2fe511f89f1443ccdb0bee0cd2360aa30a2c4fdd6bc9fb449c9e427` |
| `sections/invoices-and-payments/presenter-window/variant-A-no-notes-1440.png` | Added | `7da110ea4d938eef66cddae65a8e9059aae99e0c4fd3e934e1c974d28b319991` |
| `sections/invoices-and-payments/presenter-window/variant-A-no-notes-390.png` | Added | `223a0f87203e34cb59f1ee50ce7c18cb34db6d3266b362b059e41b2f76c533ee` |
| `sections/invoices-and-payments/presenter-window/variant-A-notes-cap-1440.png` | Added | `82f7747a95a4c905aef0035a881ea5e80480ef4eb4637f403bbda9d731a100da` |
| `sections/invoices-and-payments/presenter-window/variant-A-notes-cap-390.png` | Added | `b6e74f485b44a49c83e88017deb036ed885e8add7e12e462775c91449ef07096` |
| `sections/invoices-and-payments/presenter-window/variant-A-open-present-1440.png` | Added | `2c13e3df234aa3d69d57158be0195faf5c172e460d850c6272d96bcc5b05e1a0` |
| `sections/invoices-and-payments/presenter-window/variant-A-open-present-390.png` | Added | `14ff01a6b3381966a0c0974b2386e16d539570ed838895ab0d1d97e2302c5698` |
| `sections/invoices-and-payments/presenter-window/variant-A-presenter-1440.png` | Added | `755e5f267e22261ae44adb733d7f2ec0a9d6969caec1a6030917fd1a909ceee3` |
| `sections/invoices-and-payments/presenter-window/variant-A-presenter-390.png` | Added | `8c6fde28eda56779d998761a21dc56a3e337a135c27b12eb272408eab34ef612` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-clear-1440.png` | Added | `c3089d951545c7793a7d5c303c3173b6f71399b63c6a622533a8e75401bc929e` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-clear-390.png` | Added | `3fc162455366a16d68c19ed35bdf829f5762b2e4367fb1ab7b91116d35e6731d` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-default-view-1440.png` | Added | `81347a458eb1d8cb12a4dbad1d08a2471a96282029829f9c9b0997b893f6bc99` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-default-view-390.png` | Added | `48909b7fd3ae0c41bb906404920956cef0e71c3a2a8f5af7a75d0228d018a132` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-max-fields-1440.png` | Added | `e0994a451a7625e7c39987a9518651bd3d16e7a427b13d563c55c11ca291edc1` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-max-fields-390.png` | Added | `49b6ebc0298f7699b1327327bfede12fba3c525709bd88c6d43425ab114050fe` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-not-applied-1440.png` | Added | `93aaf252cfcb8d71734dd303dfc976df0dcfb94239b6f55e36827b4f454001f2` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-not-applied-390.png` | Added | `2faad00ce30b718ae27bd20ffdfe57da40ff1f2d2a954506719b54a6df2c58cc` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-date-1440.png` | Added | `6a763207db707cdb2f131ba50f80a91a96d9320d104c72d8d4bb3a184de6a2e6` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-date-390.png` | Added | `4bd56349edb6daa0879e287335ea42c3877143eb9886d32153084415a9ba907f` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-multi-1440.png` | Added | `7e133f0d9536a10ed5a448db73147da9031e078b1e835de7d079b139e8f2699e` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-multi-390.png` | Added | `52d20fcdfced6e76cc373a772f77a7e2d1cea2702aeae838bb277114b4eaf93d` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-select-1440.png` | Added | `5a40d2ba8c8b5ce154a4420b824d12a3d4bc84be1606bf45511995bf7b36f91c` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-select-390.png` | Added | `7fb40354d03a32aee3e4802986dddf19323bdb5adb58476a43ed128ff9127fa4` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-toggle-1440.png` | Added | `d347372c1d7a84a7293b1c76e03648d105aba288f400631e42a9f3affa1e5c98` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-open-toggle-390.png` | Added | `bed0dcce516ba71abc0f285fc1fd0eb8323a2e2a0b5f62ec97eb4db512af573e` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-own-range-1440.png` | Added | `c96b9e97c7426d7155607afe49e76cdc82bd5aa92115e276cb9e382fad687716` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-own-range-390.png` | Added | `90d545fd67ea9dd66c947318164bbf54f3c4fd06939e137ec95f2aefce9885fd` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-two-set-1440.png` | Added | `31feadfff636c576942f21d67bd81eed198e27862a81280d7d55baa08fe7e1bf` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-two-set-390.png` | Added | `f540444a44ad0f718b29a6ed3e07dc8eff60b448f768c5cd7e123d352240210d` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-view-changed-1440.png` | Added | `754777a6b530f8f4b9d91b3308a4e2e568da04f90f0b26929b993ed43c500004` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-view-changed-390.png` | Added | `b1c164b619cc7083a220307272e63baafff38deb981edae70b3d9a8bdf62aae4` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-views-1440.png` | Added | `744ca080753129b68b6ed77c4833f30e67c4f963cd437b4ce818e4b9edbcca40` |
| `sections/invoices-and-payments/dashboard-filters/variant-A-views-390.png` | Added | `8d702427b8f62daeab96db601cfb837f5da55a647d1d9844a109f07271fa7743` |

## Limitations and points for the build

- The owner did not review the picks yet. The run picked them without a stop (owner, 2026-11-08), and the owner reviews them at G3.
- All phone evidence comes from an emulated Chromium touch viewport. No gesture ran on a real phone.
- The captures use the system sans font, because Plus Jakarta Sans is not installed on the capture machine.
- The prototypes are single self-contained files with native controls. They do not replace the shadcn and Base UI implementation.
- The slide editor prototype shows Present in the page header on a phone. Since Phase 11, the deck page shows Present in a sticky bottom bar above the Slides agent panel. The build decides how the dock and that bar share the bottom edge.
- The prototypes do not show the surface agent panels of Phase 11. With a panel open at 1440, the filter bar runs out of width sooner, and the build can use the list header's More filters for the triggers that do not fit.
- The presenter window at 390 is for review only. The product presenter needs a second screen.
