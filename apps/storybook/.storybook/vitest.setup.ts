import { setProjectAnnotations } from "@storybook/nextjs-vite";
import { beforeAll } from "vitest";

import * as previewAnnotations from "./preview.tsx";

const annotations = setProjectAnnotations([previewAnnotations]);

beforeAll(annotations.beforeAll);
