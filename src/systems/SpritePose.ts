export interface OpaqueBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fits one opaque pose inside a reference silhouette without stretching it. */
export function fitPoseBounds(pose: OpaqueBounds, reference: OpaqueBounds): OpaqueBounds {
  if (pose.width <= 0 || pose.height <= 0 || reference.width <= 0 || reference.height <= 0)
    return { ...reference };
  const scale = Math.min(reference.width / pose.width, reference.height / pose.height);
  const width = pose.width * scale;
  const height = pose.height * scale;
  return {
    x: reference.x + (reference.width - width) / 2,
    y: reference.y + reference.height - height,
    width,
    height,
  };
}
