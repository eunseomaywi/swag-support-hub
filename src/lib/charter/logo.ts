import type { Region } from "./model";

// Canonical vector paths from the approved Charter reference (512 × 512).
export const LOGO_REGIONS: { id: Region; inks: string[]; path: string }[] = [
  {
    id: "orange",
    inks: ["#F6A62A", "#E8911F", "#FFB440"],
    path: "M72 105C83 103 91 112 92 124c1 18-8 31-5 45 3 14 12 24 3 35-8 10-22 10-29 0-7-10-6-27-5-43 1-18-1-36 5-48 3-5 6-7 11-8ZM75 218c9-2 15 7 14 18-1 10 7 17 2 26-5 9-19 6-22-3-3-8 0-15-1-23-1-9 0-16 7-18Z",
  },
  {
    id: "red",
    inks: ["#FA4338", "#D93535", "#FF655A"],
    path: "M171 44c16-2 26 11 25 29-1 19-9 38-13 55-3 12-10 17-18 22 10 6 13 14 9 25-5 13-20 26-31 41-6 8-10 5-8-8 3-23 2-50 3-72 1-27 0-53 9-73 5-12 13-18 24-19Z",
  },
  {
    id: "green",
    inks: ["#87D34A", "#6DBD39", "#A0DF63"],
    path: "M244 33c13-9 28-4 27 13-2 24-6 48-10 70-3 15-8 23-19 30-8 5-7 10 2 14 12 6 13 15 7 29-6 14-15 23-26 21-12-2-16-16-14-34 2-24 1-45 3-68 2-25 4-49 13-64 4-6 10-9 17-11Z",
  },
  {
    id: "blue",
    inks: ["#526BC8", "#3E58B5", "#7285D6"],
    path: "M320 73c16-4 24 8 22 24-2 18-7 38-10 54-3 15 5 25 0 41-5 16-16 34-28 39-10 4-17-5-15-19 2-15 10-27 6-40-3-11-12-18-9-32 4-19 5-38 12-53 4-8 13-12 22-14Z",
  },
  {
    id: "navy",
    inks: ["#252A49", "#171C38", "#353B60"],
    path: "M83 264c14-13 31-16 49-15 38-1 80-9 128-8 16 0 22 8 20 24l-5 29c-2 13-8 19-21 21l-42 4c-15 1-22 8-29 21-8 15-13 32-11 47 2 13 9 19 19 15 11-4 16-18 19-31 4-17 12-24 25-20l43 13c11 3 15 12 18 24l17 59c4 13-3 22-16 27-43 17-92 21-140 17-39-3-70-11-84-31-12-17-12-38-11-60l2-88c1-22 6-37 19-48ZM182 316c16-8 34-8 47-1 14 8 18 22 13 37-5 16-16 24-26 34-10 11-13 25-22 32-12 9-26 3-34-9-8-12-9-28-5-44 5-22 13-41 27-49Z",
  },
  {
    id: "teal",
    inks: ["#329B78", "#218465", "#50AE8D"],
    path: "M389 325c18-9 41-19 55-15 13 3 17 13 11 24-7 11-27 17-44 24-18 7-34 14-46 11-11-2-13-10-7-20 7-11 19-18 31-24ZM337 369a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  },
];

// Measured from the approved paths with even-odd fill on the canonical 512-square.
export const REGION_AREAS: Record<Region, number> = {
  orange: 1089,
  red: 1680,
  green: 1867,
  blue: 1596,
  navy: 12049,
  teal: 980,
};
export function regionCapacities(total: number): Record<Region, number> {
  const capacities = Object.fromEntries(
    Object.entries(REGION_AREAS).map(([id, area]) => [id, Math.floor((total * area) / 19261)]),
  ) as Record<Region, number>;
  capacities.navy += total - Object.values(capacities).reduce((a, b) => a + b, 0);
  return capacities;
}
