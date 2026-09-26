import { PESTS } from "@/lib/pests";
import type { CaptureRecord } from "@/lib/types";

/** Camera snapshot with the detector's boxes drawn on top. */
export function Snapshot({ capture }: { capture: CaptureRecord }) {
  const alt = `Snapshot with ${capture.detections.map((d) => PESTS[d.pest].label).join(", ") || "no pests"}`;
  return (
    <div className="snap">
      {capture.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/snapshots/${capture.image}`} alt={alt} loading="lazy" />
      ) : (
        <div className="empty">No snapshot saved</div>
      )}
      {capture.detections.map((d) => (
        <div
          key={d.id}
          className="box"
          style={{
            left: `${d.bbox.x * 100}%`,
            top: `${d.bbox.y * 100}%`,
            width: `${d.bbox.w * 100}%`,
            height: `${d.bbox.h * 100}%`,
            ["--c" as string]: PESTS[d.pest].color,
          }}
        >
          <span>{Math.round(d.confidence * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
