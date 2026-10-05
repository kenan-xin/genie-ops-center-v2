import { stopEntraStack } from "./stack.ts";

export default async function globalTeardown(): Promise<void> {
  await stopEntraStack();
}
