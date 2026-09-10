import interBoldWoff2 from "@fonts/Inter-Bold.woff2?inline";
import interRegularWoff2 from "@fonts/Inter-Regular.woff2?inline";

export const INTER_FONT_FACE_CSS = `
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${interRegularWoff2}) format("woff2");
}
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(${interBoldWoff2}) format("woff2");
}
`.trim();
