/**
 * A problem with what the operator entered or selected. The message is safe to
 * show on the page; anything else is treated as an unexpected failure.
 */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
  }
}
