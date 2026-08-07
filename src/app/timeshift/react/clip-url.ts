// The current clip's object URL, shared between the preview renderer (which
// owns it) and the export renderer (which the runtime calls outside React).

export const clipUrlRef: { current: string | null } = { current: null };
