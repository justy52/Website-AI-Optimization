export class UnknownDefinitionVersionError extends Error {
  constructor(definitionName: string, version: string) {
    super(`Unknown ${definitionName} definition version: ${version}.`);
    this.name = "UnknownDefinitionVersionError";
  }
}
