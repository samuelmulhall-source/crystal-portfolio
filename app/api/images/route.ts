import { readdir } from "fs/promises";
import { join }    from "path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const dir   = join(process.cwd(), "public", "Image renders");
    const files = await readdir(dir);
    const images = files
      .filter(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f))
      .map((f, i) => ({
        id:    `img-${i}`,
        path:  `/Image renders/${f}`,
        title: f.replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, "")
               .replace(/[-_]/g, " ")
               .replace(/\b\w/g, c => c.toUpperCase()),
      }));
    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
