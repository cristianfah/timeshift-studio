import type { ToolcraftModelRenderBinding } from "./model-render-binding";

type LazyThreeResource = Readonly<{
  binding: ToolcraftModelRenderBinding<unknown>;
  resource: unknown;
}>;

export type ToolcraftThreeModelBindingLoader = () => Promise<
  ToolcraftModelRenderBinding<unknown>
>;

const loadProductionBinding: ToolcraftThreeModelBindingLoader = async () => {
  const module = await import("./three-model-render-adapter");
  return module.createToolcraftThreeModelRenderAdapter() as
    ToolcraftModelRenderBinding<unknown>;
};

export function createToolcraftLazyThreeModelRenderBinding(
  loadBinding: ToolcraftThreeModelBindingLoader = loadProductionBinding,
): ToolcraftModelRenderBinding<LazyThreeResource> {
  let bindingPromise: Promise<ToolcraftModelRenderBinding<unknown>> | undefined;
  const resolveBinding = () => {
    bindingPromise ??= loadBinding();
    return bindingPromise;
  };

  return {
    create: async (presentation, context) => {
      const binding = await resolveBinding();
      const resource = await binding.create(presentation, context);
      return Object.freeze({ binding, resource });
    },
    dispose: ({ binding, resource }) => binding.dispose(resource),
    disposePreparedPreview: () => {
      void bindingPromise?.then((binding) => binding.disposePreparedPreview?.());
    },
    hitTest: ({ binding, resource }, point) => binding.hitTest(resource, point),
    preparePreview: async (context) => {
      const binding = await resolveBinding();
      await binding.preparePreview?.(context);
    },
    renderExport: ({ binding, resource }, context) =>
      binding.renderExport(resource, context),
    renderPreview: ({ binding, resource }, context) =>
      binding.renderPreview(resource, context),
    update: ({ binding, resource }, presentation, context) =>
      binding.update(resource, presentation, context),
  };
}
