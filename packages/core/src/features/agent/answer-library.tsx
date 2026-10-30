"use client";

import type { Library } from "@openuidev/react-lang";

import { ANSWER_VIEWS } from "./answer-views.tsx";
import { answerLibrary } from "./catalog.ts";

/** The catalog the renderer draws, with the same names, descriptions and props the prompt holds. */
export const ANSWER_LIBRARY: Library = answerLibrary(ANSWER_VIEWS);
