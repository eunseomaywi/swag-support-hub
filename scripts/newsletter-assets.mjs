import { readFileSync } from "node:fs";
export const newsletterImagePaths = ["peer-mentoring", "student-voice", "wellbeing-tips"].map(
  (id) => `public/images/activities/newsletter/${id}.png`,
);
export function newsletterAssetsReady() {
  return newsletterImagePaths.every((path) => {
    try {
      const bytes = readFileSync(path);
      return (
        bytes.length > 24 &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.toString("ascii", 12, 16) === "IHDR" &&
        bytes.readUInt32BE(16) > 0 &&
        bytes.readUInt32BE(20) > 0
      );
    } catch {
      return false;
    }
  });
}
