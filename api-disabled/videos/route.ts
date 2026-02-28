import { readdir } from "fs/promises";
import { join }    from "path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const dir   = join(process.cwd(), "public", "Video renders");
    const files = await readdir(dir);
    const videos = files
      .filter(f => /\.(mp4|webm|mov)$/i.test(f))
      .map((f, i) => ({
        id:    `vid-${i}`,
        path:  `/Video renders/${f}`,
        title: f.replace(/\.(mp4|webm|mov)$/i, ""),
      }));
    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json({ videos: [] });
  }
}
