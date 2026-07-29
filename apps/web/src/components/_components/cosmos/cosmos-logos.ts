import type { GraphNode } from "@/lib/graph/types";
import { loadConnectorLogos } from "./connector-logos";

// cosmos sentinel no image for this point (see graphdata.updatepointimageindices)
const NO_POINT_IMAGE_INDEX = -1;

const ATLAS_PIXEL_SIZE = 32;

// atlas order matches connector, logos loader (google_drive, notion)
const ATLAS_SOURCE_TYPES = ["google_drive", "notion"] as const;

export interface CosmosLogoAtlas {
  images: ImageData[];
  sourceTypeToAtlasIndex: ReadonlyMap<string, number>;
}

function imageElementToImageData(
  img: HTMLImageElement,
  size: number,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

// load connector svgs once and convert to cosmos imagedata atlas
export async function loadCosmosConnectorLogoAtlas(): Promise<CosmosLogoAtlas> {
  const logoMap = await loadConnectorLogos();
  const images: ImageData[] = [];
  const sourceTypeToAtlasIndex = new Map<string, number>();

  for (const sourceType of ATLAS_SOURCE_TYPES) {
    const img = logoMap.get(sourceType);
    if (img === undefined) continue;
    const data = imageElementToImageData(img, ATLAS_PIXEL_SIZE);
    if (data === null) continue;
    sourceTypeToAtlasIndex.set(sourceType, images.length);
    images.push(data);
  }

  return { images, sourceTypeToAtlasIndex };
}

export function emptyPointImageIndices(pointCount: number): Float32Array {
  return new Float32Array(pointCount).fill(NO_POINT_IMAGE_INDEX);
}

// assign atlas indices for memory nodes with a known connector sourcetype
// other points get no_point_image_index (, 1)
export function buildPointImageBuffers(
  nodes: readonly GraphNode[],
  sourceTypeToAtlasIndex: ReadonlyMap<string, number>,
): { indices: Float32Array; sizes: Float32Array } {
  const indices = emptyPointImageIndices(nodes.length);
  const sizes = new Float32Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node === undefined) continue;

    // cosmos point size ≈ node.size * 2 logo slightly inset inside the circle
    const pointSize = Math.max(2, node.size * 2);
    sizes[i] = pointSize * 0.7;

    if (node.kind !== "memory" || node.sourceType === null) continue;
    const atlasIndex = sourceTypeToAtlasIndex.get(node.sourceType);
    if (atlasIndex === undefined) continue;
    indices[i] = atlasIndex;
  }

  return { indices, sizes };
}
