/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { MODEL_BRANDS, modelBrand } from "@/lib/model-brand";
import { Mark } from "./brand";

/** Canonical local marks, shared with the Ensemble Hub; never an invented vendor identity. */
export function ModelLogo({ model, provider, size = 18, decorative = false }: { model?: string | null; provider?: string | null; size?: number; decorative?: boolean }) {
  const brand = modelBrand(model, provider);
  if (!brand) return <span data-model-brand="ensemble" {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Ensemble Node" })} className="inline-flex shrink-0"><Mark size={size} /></span>;
  const image = `url("/providers/${brand}.svg")`;
  return <span data-model-brand={brand} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": MODEL_BRANDS[brand] })}
    className="inline-block shrink-0 align-middle text-ink"
    style={{ width: size, height: size, backgroundColor: "currentColor", maskImage: image, WebkitMaskImage: image, maskSize: "contain", WebkitMaskSize: "contain", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }} />;
}
