import { LOGO_REGIONS } from "@/lib/charter/logo";
import { COLOURS } from "@/lib/charter/model";
export function SwagLogoMask() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className="charter-logo-fallback">
      {LOGO_REGIONS.map((region) => (
        <path
          key={region.id}
          d={region.path}
          fill={COLOURS[region.id]}
          fillRule="evenodd"
          opacity=".65"
        />
      ))}
    </svg>
  );
}
