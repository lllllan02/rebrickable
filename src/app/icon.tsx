import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <div
          style={{
            color: "#000",
            fontSize: 19,
            fontWeight: 900,
            fontFamily: "Arial Black, Arial, sans-serif",
            lineHeight: 1,
          }}
        >
          R
        </div>
        <div
          style={{
            background: "#ff9000",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 27,
            color: "#000",
            fontSize: 18,
            fontWeight: 900,
            fontFamily: "Arial Black, Arial, sans-serif",
            lineHeight: 1,
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size },
  );
}
