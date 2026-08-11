export type Accent = "blue" | "pink" | "green" | "orange" | "purple" | "navy";

export const accentBorder: Record<Accent, string> = {
  blue: "border-swag-blue/40 hover:border-swag-blue",
  pink: "border-swag-pink/40 hover:border-swag-pink",
  green: "border-swag-green/40 hover:border-swag-green",
  orange: "border-swag-orange/50 hover:border-swag-orange",
  purple: "border-swag-purple/40 hover:border-swag-purple",
  navy: "border-swag-navy/25 hover:border-swag-navy",
};

export const accentText: Record<Accent, string> = {
  blue: "text-swag-blue",
  pink: "text-swag-pink",
  green: "text-swag-green",
  orange: "text-swag-orange",
  purple: "text-swag-purple",
  navy: "text-swag-navy",
};

export const accentSoftBg: Record<Accent, string> = {
  blue: "bg-swag-blue/8",
  pink: "bg-swag-pink/8",
  green: "bg-swag-green/8",
  orange: "bg-swag-orange/10",
  purple: "bg-swag-purple/8",
  navy: "bg-swag-navy/5",
};