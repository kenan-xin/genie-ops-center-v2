/**
 * A demo seed refused before it wrote anything. The message says what to do first, so the command
 * prints it as it is and exits without a stack.
 */
export class DemoSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedRefused";
  }
}
