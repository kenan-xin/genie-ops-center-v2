# Design import, 2026-11-02: the Section 7 redesign prototype

Status: imported reference snapshot for the design review `buv3.20`. It is not design approval. The owner reviews the prototype after the run (owner, 2026-11-01). Phases 09 and 10 of the run build it on the branch `feature/section-7-redesign`.

## Why

The design review pass 1 found that the Section 7 screens did not share one page pattern, and that "the chat does not look like a chat" (owner). The prototype gives every Section 7 screen one pattern: a page header with the page name and its main actions, a header strip of figures, the content area, a fixed action bar on phones, and a full-height chat panel after the agent-native references (MIT).

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commits `a4be735` (lists, records, inbox, review) and `56aab9d` (Ask, chat bubble, Dashboards, Slides).

1. The prototype `product/section-7-redesign.prototype.html` was copied to `prototypes/section-7-redesign.prototype.html`, beside the variant D prototype. The two copies are identical.
2. The 25 captures came from a headless Chromium run at 1440 x 900 and 390 x 844, with reduced motion. They were copied to `sections/invoices-and-payments/section-7-redesign/`.
3. The data is the fictional demo pack, with Genie as the seller. No real person's data is shown.

## Screens

Open the prototype in a browser. The switcher at the bottom left changes the screen and the state. A deep link is `?screen=<key>&state=<state>`, and `&chrome=0` hides the switcher.

| Screen key | What it shows | Extra states |
| --- | --- | --- |
| `invoices` | Invoices list with the filters | empty |
| `payments` | Payments list with the filters | empty |
| `invoice` | Invoice record: header strip, actions in the header, history | none |
| `payment` | Payment record | unallocated |
| `inbox` | Documents inbox: Needs you and Done groups, Review button, Uploaded column | failed, empty |
| `review-invoice` | Review: PDF beside the fields, fixed action bar | none |
| `review-payment` | Review with one compact split row per invoice | over |
| `ask` | Ask, result first | empty, streaming, error |
| `bubble` | Chat on a record | none |
| `dashboards` | Dashboard with its chat panel | empty |
| `slides` | Slides editor with its chat panel | none |
| `slides-present` | Slides present mode with keyboard hints | none |

Each screen has `prototype-<key>-1440.png` and `prototype-<key>-390.png`. `prototype-phone-menu-390.png` shows the phone menu on the Invoices list.

## Checks

- axe-core 4.14, WCAG 2.0 and 2.1 A and AA: 0 violations on 24 screen and state pairs at both viewports.
- `impeccable detect`: no finding breaks a token or an accessibility rule.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/section-7-redesign.prototype.html` | Added | `dff02f6facb8e208adf0111f7c31d8e25029d9a461a90592ac378dda18b4fb5b` |
| `sections/invoices-and-payments/section-7-redesign/prototype-ask-1440.png` | Added | `21da32e8594521a2ea145856e792e704039be686095e139c53d3f7d8644dfb58` |
| `sections/invoices-and-payments/section-7-redesign/prototype-ask-390.png` | Added | `7597035ed4603f12c1cf66f15a7f7edb407c7a124716c39cd0dcd73f0e68c5f8` |
| `sections/invoices-and-payments/section-7-redesign/prototype-bubble-1440.png` | Added | `e9cd9bbf57dfcc65e5bfe0ca28336264cab48027d6b9c2a37799fd78932b233e` |
| `sections/invoices-and-payments/section-7-redesign/prototype-bubble-390.png` | Added | `66604437bae1def217df50af3626714726df0efd33cb4e7d8b721084bc0af22d` |
| `sections/invoices-and-payments/section-7-redesign/prototype-dashboards-1440.png` | Added | `42085be992151ffa44c9580b3faa5178461436b3994d1a869d95c39ed05e32af` |
| `sections/invoices-and-payments/section-7-redesign/prototype-dashboards-390.png` | Added | `7556ab9cb95de611e36e83e8086f9c99edb0b8af6e46c6f11ca2c9b0f335d564` |
| `sections/invoices-and-payments/section-7-redesign/prototype-inbox-1440.png` | Added | `c3173d23d48882d07c802df3dbba56ee1d284130e0d02dcf2013e3ea7f8b96ef` |
| `sections/invoices-and-payments/section-7-redesign/prototype-inbox-390.png` | Added | `f5f328d9dca308dfa42f15d166c8733867b55aadd1a503cbcd65f034d757a75e` |
| `sections/invoices-and-payments/section-7-redesign/prototype-invoice-1440.png` | Added | `2d66fb433c06cada3d5992c525707cd64303d490c1bef4a97fe53db7c4268a0f` |
| `sections/invoices-and-payments/section-7-redesign/prototype-invoice-390.png` | Added | `5ffa3119a1b96d8cb887a0a3ae5bf9b60cda02f1aa611ec64f0c50f8bc899806` |
| `sections/invoices-and-payments/section-7-redesign/prototype-invoices-1440.png` | Added | `50a335f75dee5e64ce24587544dc810c44f7400a1f259ba8d28fb55e70b3c4c5` |
| `sections/invoices-and-payments/section-7-redesign/prototype-invoices-390.png` | Added | `1235522382e99222d7bf59ac03a84e4ee45f39e92c1ed42d9611b661bc8a8fb5` |
| `sections/invoices-and-payments/section-7-redesign/prototype-payment-1440.png` | Added | `e5695d6135c1bc1343b9fbc31bf17ae83d5a3b2383591c11e5c73fee7473ae52` |
| `sections/invoices-and-payments/section-7-redesign/prototype-payment-390.png` | Added | `022279aa77ad72def2a909f7e0d909b47e04ccc571d00f647cf169ac48b52eeb` |
| `sections/invoices-and-payments/section-7-redesign/prototype-payments-1440.png` | Added | `ea992f6061bf3c7bae7c0bba0d81a4c43c4b4554248e00b984197a1ba60d01e0` |
| `sections/invoices-and-payments/section-7-redesign/prototype-payments-390.png` | Added | `cfcca00eb86be87d9e1bcf9abc442e5adf63f9b516e5ff44a30ed0a9bb868d4d` |
| `sections/invoices-and-payments/section-7-redesign/prototype-phone-menu-390.png` | Added | `e88200a17a523ee6365e42eb0c7439e55273443d82137594f43ae22366adbd6a` |
| `sections/invoices-and-payments/section-7-redesign/prototype-review-invoice-1440.png` | Added | `a6c52fd69cbd2f92996a67243ef77b567ee8db007f95c5839d3f13a1ec749aa5` |
| `sections/invoices-and-payments/section-7-redesign/prototype-review-invoice-390.png` | Added | `d5ce5e23d1ec2ce958434a6c024c5657e25631fcb0057f98aa276322ccd303ea` |
| `sections/invoices-and-payments/section-7-redesign/prototype-review-payment-1440.png` | Added | `5b89c867c7069762cb4c744ce8f25f9db6d05ea3b6b642c106e2525af593a348` |
| `sections/invoices-and-payments/section-7-redesign/prototype-review-payment-390.png` | Added | `94869ddb57a58c72f088e4637761141f24fc0012a48f22c72639a5edf4f53d9a` |
| `sections/invoices-and-payments/section-7-redesign/prototype-slides-1440.png` | Added | `7faf919f74177408e4e23c5ca0e2b77d6b5bdfead131db3c8430d5d47d4dac69` |
| `sections/invoices-and-payments/section-7-redesign/prototype-slides-390.png` | Added | `3eecd56f1fe4dc7baa71f2fb66ce41a4b7cba852d2b8182a915b42e5d8149980` |
| `sections/invoices-and-payments/section-7-redesign/prototype-slides-present-1440.png` | Added | `0d96450e48d2729abbe80362bc7d391e688f0a7683c121e95845112438e1bb82` |
| `sections/invoices-and-payments/section-7-redesign/prototype-slides-present-390.png` | Added | `0fa923ce0922cb3d794568f96a073c4879995c10d32bd1b3a96803c54d580d16` |

## Limitations

- The owner did not review the prototype yet. Fourteen open design choices wait for that review. Each has the smallest choice that keeps the design system seams open.
- The captures use the system sans font, because Plus Jakarta Sans was not installed on the capture machine. The real face is not verified.
- Each capture shows the default state at viewport size only. The other states are in the prototype.
- The prototype is a single self-contained file with native controls. It does not replace the shadcn and Base UI implementation.
- The section specification `sections/invoices-and-payments/` is not updated. The build phases write the screen rules after the owner review.
