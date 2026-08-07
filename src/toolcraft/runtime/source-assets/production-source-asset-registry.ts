import { createToolcraftModelSourceAssetHandler } from "../model-import/model-source-asset-handler";
import type { ToolcraftModelWorkerClient } from "../model-import/worker/model-import-worker-client";
import { toolcraftFileSourceAssetHandler } from "./file-source-asset-handler";
import { toolcraftImageSourceAssetHandler } from "./image-source-asset-handler";
import {
  createToolcraftSourceAssetRegistry,
  type ToolcraftSourceAssetRegistry,
} from "./source-asset-registry";

export function createToolcraftProductionSourceAssetRegistry(
  workerClient: ToolcraftModelWorkerClient,
): ToolcraftSourceAssetRegistry {
  return createToolcraftSourceAssetRegistry([
    createToolcraftModelSourceAssetHandler({ workerClient }),
    toolcraftImageSourceAssetHandler,
    toolcraftFileSourceAssetHandler,
  ]);
}
