// Renderer technique: why this product draws with WebGL2 and what that costs.

import type { ToolcraftRendererTechnique } from "@/toolcraft/runtime";

export const timeshiftRendererTechnique: ToolcraftRendererTechnique = {
  exportRenderer: "webgl",
  fidelityRisks: [
    "El preview corre a la resolución interna elegida y el export a resolución de salida: un efecto dependiente de píxel puede verse más fino en el archivo final.",
    "Sin WebGL2 el producto no tiene salida; no hay camino Canvas 2D equivalente para los pases temporales.",
  ],
  performanceRisks: [
    "El ring buffer reserva ancho × alto × profundidad × 4 bytes en GPU; una historia larga a resolución alta se acerca al tope de memoria.",
    "Cada efecto de la cadena añade un pase de pantalla completa por frame.",
  ],
  previewExportDifferenceReason:
    "El preview usa la resolución interna del motor para mantener la interacción viva; el export usa la resolución nativa o la elegida en los ajustes.",
  previewRenderer: "webgl",
  productRepresentation: "pixel",
  rendererStrategy: "webgl",
  sourceRepresentation: "mixed",
  whyNotAlternativeStrategies: [
    "Canvas 2D no puede muestrear un historial de fotogramas por píxel sin leer y recomponer el frame en CPU cada vez.",
    "DOM y SVG no representan una transformación por píxel del fotograma.",
    "WebGPU no está disponible de forma estable en los navegadores objetivo del producto.",
  ],
};
