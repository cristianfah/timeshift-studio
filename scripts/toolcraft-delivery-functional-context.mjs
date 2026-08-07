import {
  collectToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-collector.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftProductVerificationContext,
  readToolcraftVerificationImpactInventory,
} from "./toolcraft-verification-impact.mjs";

const defaultDependencies = Object.freeze({
  collectCatalog: collectToolcraftDeliveryCatalog,
  createFunctionalProofModel: createToolcraftFunctionalProofModel,
  createVerificationContext: createToolcraftProductVerificationContext,
  readImpactInventory: readToolcraftVerificationImpactInventory,
});

export async function collectToolcraftDeliveryFunctionalContextCore({
  dependencies,
  projectDir,
}) {
  const catalog = await dependencies.collectCatalog(projectDir);
  const {
    frameworkOwnedPaths,
    graph,
    inputRoles,
    sourceInventory,
  } = await dependencies.createVerificationContext(projectDir);
  const { inventory: verificationImpactInventory } =
    await dependencies.readImpactInventory(projectDir, {
      catalog,
      inputRoles,
    });
  const currentFunctionalProofModel =
    dependencies.createFunctionalProofModel({
      catalog,
      inventory: verificationImpactInventory,
    });
  return Object.freeze({
    catalog,
    currentFunctionalProofModel,
    frameworkOwnedPaths,
    graph,
    inputRoles,
    sourceInventory,
    verificationImpactInventory,
  });
}

export function collectToolcraftDeliveryFunctionalContext(projectDir) {
  return collectToolcraftDeliveryFunctionalContextCore({
    dependencies: defaultDependencies,
    projectDir,
  });
}
