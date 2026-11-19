using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Rebuilds the widened picture with the same layout as before, but smooth.
// Step 1: find the same seams as Widen.cs and remember, for every pixel of
//   the wide picture, which place in the original it shows (a map).
// Step 2: smooth that map, so the stretch is spread out evenly and no
//   streaks or steps are left.
// Step 3: draw the final 3840 x 1080 picture straight from the original
//   with a sharp (bicubic) reading, in one go.
public static class Rewiden
{
    static byte[] ReadPixels(Bitmap bmp, out int stride)
    {
        var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        stride = data.Stride;
        var px = new byte[stride * bmp.Height];
        Marshal.Copy(data.Scan0, px, 0, px.Length);
        bmp.UnlockBits(data);
        return px;
    }

    // the seams of Widen.Run (no protected boxes), as a map: wide x -> input x
    public static float[][] SeamMap(string input, int targetWidth, out int W, out int H)
    {
        var src = new Bitmap(input);
        W = src.Width; H = src.Height;
        int stride;
        var px = ReadPixels(src, out stride);
        src.Dispose();

        int w = W / 2, h = H / 2;
        var lum = new float[h][];
        for (int y = 0; y < h; y++)
        {
            lum[y] = new float[w];
            for (int x = 0; x < w; x++)
            {
                float sum = 0;
                for (int dy = 0; dy < 2; dy++)
                    for (int dx = 0; dx < 2; dx++)
                    {
                        int i = (y * 2 + dy) * stride + (x * 2 + dx) * 3;
                        sum += px[i] * 0.114f + px[i + 1] * 0.587f + px[i + 2] * 0.299f;
                    }
                lum[y][x] = sum / 4;
            }
        }

        var orig = new int[h][];
        var energy = new float[h][];
        for (int y = 0; y < h; y++)
        {
            orig[y] = new int[w];
            for (int x = 0; x < w; x++) orig[y][x] = x;
            energy[y] = new float[w];
        }
        Func<int, int, int, float> energyAt = (y, x, width) =>
        {
            int xl = Math.Max(0, x - 1), xr = Math.Min(width - 1, x + 1);
            int yu = Math.Max(0, y - 1), yd = Math.Min(h - 1, y + 1);
            float e = Math.Abs(lum[y][xr] - lum[y][xl]) + Math.Abs(lum[yd][x] - lum[yu][x]);
            return e;
        };
        int cur = w;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) energy[y][x] = energyAt(y, x, cur);

        int seams = (targetWidth - W) / 2;
        var chosen = new List<int>[h];
        for (int y = 0; y < h; y++) chosen[y] = new List<int>();
        var M = new float[h][];
        var back = new sbyte[h][];
        for (int y = 0; y < h; y++) { M[y] = new float[w]; back[y] = new sbyte[w]; }
        var path = new int[h];

        for (int s = 0; s < seams; s++)
        {
            for (int x = 0; x < cur; x++) M[0][x] = energy[0][x];
            for (int y = 1; y < h; y++)
            {
                var prev = M[y - 1];
                var row = M[y];
                var e = energy[y];
                for (int x = 0; x < cur; x++)
                {
                    float best = prev[x];
                    sbyte dir = 0;
                    if (x > 0 && prev[x - 1] < best) { best = prev[x - 1]; dir = -1; }
                    if (x < cur - 1 && prev[x + 1] < best) { best = prev[x + 1]; dir = 1; }
                    row[x] = e[x] + best;
                    back[y][x] = dir;
                }
            }
            int bx = 0;
            float bv = float.MaxValue;
            for (int x = 0; x < cur; x++) if (M[h - 1][x] < bv) { bv = M[h - 1][x]; bx = x; }
            for (int y = h - 1; y >= 0; y--)
            {
                path[y] = bx;
                if (y > 0) bx += back[y][bx];
            }
            for (int y = 0; y < h; y++)
            {
                int x = path[y];
                chosen[y].Add(orig[y][x]);
                int n = cur - x - 1;
                Array.Copy(lum[y], x + 1, lum[y], x, n);
                Array.Copy(orig[y], x + 1, orig[y], x, n);
                Array.Copy(energy[y], x + 1, energy[y], x, n);
            }
            cur--;
            for (int y = 0; y < h; y++)
            {
                int x = path[y];
                for (int k = Math.Max(0, x - 1); k <= Math.Min(cur - 1, x); k++) energy[y][k] = energyAt(y, k, cur);
                if (x < cur) energy[y][x] += 6f;
                if (x > 0) energy[y][x - 1] += 6f;
            }
        }

        int outW = W + seams * 2;
        var map = new float[H][];
        var counts = new int[w];
        for (int Y = 0; Y < H; Y++)
        {
            int y = Math.Min(h - 1, Y / 2);
            Array.Clear(counts, 0, w);
            foreach (int c in chosen[y]) counts[c]++;
            var row = new float[outW];
            int ox = 0;
            for (int X = 0; X < W; X++)
            {
                row[ox] = X;
                ox++;
                int extra = X / 2 < w ? counts[X / 2] : 0;
                int nx = Math.Min(W - 1, X + 1);
                for (int k = 0; k < extra; k++)
                {
                    float t = (k + 1f) / (extra + 1f);
                    row[ox] = X + t * (nx - X);
                    ox++;
                }
            }
            map[Y] = row;
        }
        return map;
    }

    static float Lookup(float[] row, float x)
    {
        if (x <= 0) return row[0];
        if (x >= row.Length - 1) return row[row.Length - 1];
        int i = (int)x;
        float f = x - i;
        return row[i] * (1 - f) + row[i + 1] * f;
    }

    static void BoxBlur(float[][] a, int r)
    {
        int h = a.Length, w = a[0].Length;
        var tmp = new float[Math.Max(w, h)];
        for (int pass = 0; pass < 3; pass++)
        {
            for (int y = 0; y < h; y++)
            {
                var row = a[y];
                double sum = 0; int n = 0;
                for (int x = -r; x < w; x++)
                {
                    int add = x + r, rem = x - r - 1;
                    if (add < w) { sum += row[add]; n++; }
                    if (rem >= 0) { sum -= row[rem]; n--; }
                    if (x >= 0) tmp[x] = (float)(sum / n);
                }
                Array.Copy(tmp, row, w);
            }
            for (int x = 0; x < w; x++)
            {
                double sum = 0; int n = 0;
                for (int y = -r; y < h; y++)
                {
                    int add = y + r, rem = y - r - 1;
                    if (add < h) { sum += a[add][x]; n++; }
                    if (rem >= 0) { sum -= a[rem][x]; n--; }
                    if (y >= 0) tmp[y] = (float)(sum / n);
                }
                for (int y = 0; y < h; y++) a[y][x] = tmp[y];
            }
        }
    }

    static float Cubic(float p0, float p1, float p2, float p3, float t)
    {
        return p1 + 0.5f * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    }

    // z0: the original stretched 1.05 times, z1: after the first seam pass
    // (both from the earlier run), original: the untouched source picture
    public static string Run(string z0, string z1, string original, string output, int blur, string statsOut)
    {
        int W0, H0, W1, H1;
        var m1 = SeamMap(z0, 4380, out W0, out H0);
        var m2 = SeamMap(z1, 5120, out W1, out H1);
        int H = H0;
        int wideW = m2[0].Length;

        var srcBmp = new Bitmap(original);
        int SW = srcBmp.Width, SH = srcBmp.Height;
        int stride;
        var src = ReadPixels(srcBmp, out stride);
        srcBmp.Dispose();
        float toOriginal = SW / (float)W0;

        // wide x -> x in the original, minus the even part
        float even = SW / (float)wideW;
        var d = new float[H][];
        for (int Y = 0; Y < H; Y++)
        {
            d[Y] = new float[wideW];
            for (int X = 0; X < wideW; X++)
            {
                float inZ0 = Lookup(m1[Y], m2[Y][X]);
                float inOriginal = (inZ0 + 0.5f) * toOriginal - 0.5f;
                d[Y][X] = inOriginal - X * even;
            }
        }
        if (blur > 0) BoxBlur(d, blur);

        // how far the picture is stretched, per area (for the report)
        var report = new System.Text.StringBuilder();
        for (int by = 0; by < 6; by++)
        {
            for (int bx = 0; bx < 12; bx++)
            {
                int Y = (int)((by + 0.5f) * H / 6);
                int Xa = bx * wideW / 12, Xb = (bx + 1) * wideW / 12 - 1;
                float span = (d[Y][Xb] + Xb * even) - (d[Y][Xa] + Xa * even);
                float stretch = (Xb - Xa) / Math.Max(1f, span) * (1080f / 1440f) / (1080f / SH);
                report.Append(stretch.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)).Append(' ');
            }
            report.AppendLine();
        }
        for (int X = wideW - 8; X < wideW; X++) report.Append((d[H / 2][X] + X * even).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)).Append(' ');
        report.AppendLine();
        System.IO.File.WriteAllText(statsOut, report.ToString());

        int OW = 3840, OH = 1080;
        float k = wideW / (float)OW;   // wide pixels per final pixel (4/3)
        var dst = new Bitmap(OW, OH, PixelFormat.Format24bppRgb);
        var dd = dst.LockBits(new Rectangle(0, 0, OW, OH), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
        var outPx = new byte[dd.Stride * OH];
        float[] sub = { 0.25f, 0.75f };
        var col = new float[4];
        for (int y = 0; y < OH; y++)
        {
            for (int x = 0; x < OW; x++)
            {
                float b = 0, g = 0, r = 0;
                foreach (float sy in sub)
                    foreach (float sx in sub)
                    {
                        float Xw = (x + sx) * k - 0.5f;
                        float Yw = (y + sy) * k - 0.5f;
                        int Yi = Math.Max(0, Math.Min(H - 1, (int)Math.Round(Yw)));
                        float u = Lookup(d[Yi], Xw) + Xw * even;
                        // the source file has two grey columns at its right border: stay left of them
                        u = u * (SW - 7f) / (SW + 0.7f);
                        float v = Yw * (SH / (float)H);
                        int ix = (int)Math.Floor(u), iy = (int)Math.Floor(v);
                        float fx = u - ix, fy = v - iy;
                        for (int c = 0; c < 3; c++)
                        {
                            for (int j = 0; j < 4; j++)
                            {
                                int yy = Math.Max(0, Math.Min(SH - 1, iy - 1 + j));
                                int rowAt = yy * stride;
                                float p0 = src[rowAt + Math.Max(0, Math.Min(SW - 1, ix - 1)) * 3 + c];
                                float p1 = src[rowAt + Math.Max(0, Math.Min(SW - 1, ix)) * 3 + c];
                                float p2 = src[rowAt + Math.Max(0, Math.Min(SW - 1, ix + 1)) * 3 + c];
                                float p3 = src[rowAt + Math.Max(0, Math.Min(SW - 1, ix + 2)) * 3 + c];
                                col[j] = Cubic(p0, p1, p2, p3, fx);
                            }
                            float value = Cubic(col[0], col[1], col[2], col[3], fy);
                            if (c == 0) b += value; else if (c == 1) g += value; else r += value;
                        }
                    }
                int o = y * dd.Stride + x * 3;
                outPx[o] = (byte)Math.Max(0, Math.Min(255, b / 4 + 0.5f));
                outPx[o + 1] = (byte)Math.Max(0, Math.Min(255, g / 4 + 0.5f));
                outPx[o + 2] = (byte)Math.Max(0, Math.Min(255, r / 4 + 0.5f));
            }
        }
        Marshal.Copy(outPx, 0, dd.Scan0, outPx.Length);
        dst.UnlockBits(dd);
        dst.Save(output, ImageFormat.Png);
        dst.Dispose();
        return "drawn " + OW + " x " + OH + " from " + SW + " x " + SH + ", wide map " + wideW + " x " + H;
    }
}
