// Smooth curves through measured keyframes, for motion matched to the
// reference footage. Monotone cubic interpolation (Fritsch–Carlson): it
// passes through every point without overshooting, and is flat at the ends.

export type Keyframes = ReadonlyArray<readonly [time: number, value: number]>

export function keyframeCurve(points: Keyframes) {
  const n = points.length
  const ts = points.map((p) => p[0])
  const vs = points.map((p) => p[1])
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) {
    slopes.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]))
  }
  // Tangents: zero at the ends, so motion eases in and out.
  const tangents = vs.map((_, i) => {
    if (i === 0 || i === n - 1) return 0
    const a = slopes[i - 1]
    const b = slopes[i]
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b)
  })

  return (t: number) => {
    if (t <= ts[0]) return vs[0]
    if (t >= ts[n - 1]) return vs[n - 1]
    let i = 0
    while (t > ts[i + 1]) i++
    const h = ts[i + 1] - ts[i]
    const s = (t - ts[i]) / h
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2 * s3 - 3 * s2 + 1) * vs[i] +
      (s3 - 2 * s2 + s) * h * tangents[i] +
      (-2 * s3 + 3 * s2) * vs[i + 1] +
      (s3 - s2) * h * tangents[i + 1]
    )
  }
}
