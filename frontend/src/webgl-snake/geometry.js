const sampledPathCache = new Map();

export function sampleSnakePath(pathD, sampleCount = 2600) {
  const cacheKey = `${sampleCount}:${pathD}`;
  const cachedPath = sampledPathCache.get(cacheKey);
  if (cachedPath) return cachedPath;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  const totalLength = path.getTotalLength();
  const points = [];
  const tangentStep = Math.max(0.75, totalLength / sampleCount);

  for (let i = 0; i <= sampleCount; i += 1) {
    const distance = (i / sampleCount) * totalLength;
    const point = path.getPointAtLength(distance);
    const before = path.getPointAtLength(Math.max(0, distance - tangentStep));
    const after = path.getPointAtLength(Math.min(totalLength, distance + tangentStep));
    let tx = after.x - before.x;
    let ty = after.y - before.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;

    points.push({
      x: point.x,
      y: point.y,
      distance,
      u: distance / totalLength,
      tangent: { x: tx, y: ty },
      normal: { x: -ty, y: tx }
    });
  }

  const sampledPath = { totalLength, points };
  sampledPathCache.set(cacheKey, sampledPath);
  return sampledPath;
}

function clonePathPoint(point) {
  return {
    x: point.x,
    y: point.y,
    distance: point.distance,
    u: point.u,
    tangent: { x: point.tangent.x, y: point.tangent.y },
    normal: { x: point.normal.x, y: point.normal.y }
  };
}

function interpolatePathPoint(a, b, u) {
  const span = b.u - a.u || 1;
  const t = Math.max(0, Math.min(1, (u - a.u) / span));
  let tx = a.tangent.x + (b.tangent.x - a.tangent.x) * t;
  let ty = a.tangent.y + (b.tangent.y - a.tangent.y) * t;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;

  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    distance: a.distance + (b.distance - a.distance) * t,
    u,
    tangent: { x: tx, y: ty },
    normal: { x: -ty, y: tx }
  };
}

function pointAtU(points, u) {
  if (u <= points[0].u) return clonePathPoint(points[0]);
  const last = points[points.length - 1];
  if (u >= last.u) return clonePathPoint(last);

  for (let i = 1; i < points.length; i += 1) {
    if (points[i].u >= u) {
      return interpolatePathPoint(points[i - 1], points[i], u);
    }
  }

  return clonePathPoint(last);
}

export function sliceSampledPath(sampledPath, startU = 0, endU = 1) {
  const rangeStart = Math.max(0, Math.min(1, startU));
  const rangeEnd = Math.max(rangeStart + 0.001, Math.min(1, endU));
  const sourcePoints = sampledPath.points;
  const points = [pointAtU(sourcePoints, rangeStart)];

  for (const point of sourcePoints) {
    if (point.u > rangeStart && point.u < rangeEnd) {
      points.push(clonePathPoint(point));
    }
  }

  points.push(pointAtU(sourcePoints, rangeEnd));
  return {
    totalLength: sampledPath.totalLength * (rangeEnd - rangeStart),
    points
  };
}

export function createRibbonGeometry(THREE, sampledPath, tubeWidth, crossSegments = 14) {
  const { points } = sampledPath;
  const grid = [];
  const vertices = [];
  const uvs = [];
  const sides = [];
  const indices = [];

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const row = [];

    for (let j = 0; j <= crossSegments; j += 1) {
      const v = j / crossSegments;
      const side = v - 0.5;
      const index = vertices.length / 3;
      row.push(index);
      vertices.push(point.x + point.normal.x * side * tubeWidth, point.y + point.normal.y * side * tubeWidth, 0);
      uvs.push(point.u, v);
      sides.push(side * 2);
    }

    grid.push(row);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = 0; j < crossSegments; j += 1) {
      const a = grid[i][j];
      const b = grid[i][j + 1];
      const c = grid[i + 1][j];
      const d = grid[i + 1][j + 1];
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("sideCoord", new THREE.Float32BufferAttribute(sides, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRoundCapGeometry(THREE, point, tangent, radius, startCap) {
  const vertices = [point.x, point.y, 0.002];
  const uvs = [0.5, 0.5];
  const indices = [];
  const segments = 48;
  const baseAngle = Math.atan2(tangent.y, tangent.x);
  const angleStart = startCap ? baseAngle + Math.PI / 2 : baseAngle - Math.PI / 2;
  const direction = startCap ? 1 : -1;

  for (let i = 0; i <= segments; i += 1) {
    const angle = angleStart + direction * (i / segments) * Math.PI;
    const x = point.x + Math.cos(angle) * radius;
    const y = point.y + Math.sin(angle) * radius;
    vertices.push(x, y, 0.002);
    uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
  }

  for (let i = 1; i <= segments; i += 1) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createImageCapGeometry(THREE, point, tangent, tubeWidth, texture, startCap) {
  const normal = { x: -tangent.y, y: tangent.x };
  const image = texture.image || { width: 335, height: 852 };
  const across = tubeWidth;
  const length = across * (image.width / image.height) * 1.24;
  const overlap = length * 0.76;
  const centerShift = startCap ? length / 2 - overlap : -length / 2 + overlap;
  const center = {
    x: point.x + tangent.x * centerShift,
    y: point.y + tangent.y * centerShift
  };
  const halfLength = length / 2;
  const halfAcross = across / 2;
  const xAxis = { x: tangent.x, y: tangent.y };
  const yAxis = normal;
  const corners = [
    [-halfLength, -halfAcross, 0, 0],
    [halfLength, -halfAcross, 1, 0],
    [-halfLength, halfAcross, 0, 1],
    [halfLength, halfAcross, 1, 1]
  ];
  const vertices = [];
  const uvs = [];

  for (const [x, y, u, v] of corners) {
    vertices.push(center.x + xAxis.x * x + yAxis.x * y, center.y + xAxis.y * x + yAxis.y * y, 0.004);
    uvs.push(u, v);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.computeBoundingSphere();
  return geometry;
}
