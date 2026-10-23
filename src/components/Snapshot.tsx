import { PESTS } from "@/lib/pests";
import type { Detection } from "@/lib/types";

/** Camera snapshot with the detector's boxes drawn on top, each labelled with the pest and how sure it is. */
export function Snapshot({ capture }: { capture: { image: string | null; detections: Detection[] } }) {
  const alt = `Snapshot with ${capture.detections.map((d) => PESTS[d.pest].label).join(", ") || "no pests"}`;
  return (
    <div className="snap">
      {capture.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/snapshots/${capture.image}`} alt={alt} loading="lazy" />
      ) : (
        <div className="empty">No snapshot saved</div>
      )}
      {capture.detections.map((d, i) => (
        <div
          key={`${capture.image}-${i}`}
          className={`box${d.bbox.y < 0.08 ? " label-in" : ""}${d.bbox.x + d.bbox.w > 0.7 ? " label-r" : ""}`}
          style={{
            left: `${d.bbox.x * 100}%`,
            top: `${d.bbox.y * 100}%`,
            width: `${d.bbox.w * 100}%`,
            height: `${d.bbox.h * 100}%`,
            ["--c" as string]: PESTS[d.pest].color,
          }}
        >
          <span>
            {PESTS[d.pest].label} {Math.round(d.confidence * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
