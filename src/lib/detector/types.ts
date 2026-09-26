import type { Detection } from "../types";

export interface DetectorInput {
  image: Uint8Array;
  contentType: string;
  /** Ground truth sent only by the turret simulator. Real cameras never send this. */
  simTruth?: Detection[];
}

export interface Detector {
  name: string;
  detect(input: DetectorInput): Promise<Detection[]>;
}
