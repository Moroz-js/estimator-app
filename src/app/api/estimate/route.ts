// src/app/api/estimate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildWorkbookFromScratch, type Input } from "@/lib/excelBuilder";

export const runtime = "nodejs"; // важно: не "edge", ExcelJS нужен Node

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Input;

    const buffer = await buildWorkbookFromScratch(body);
    const uint8 = new Uint8Array(buffer);

    const projName =
      (body.project?.name || "Project").toString().trim() || "Project";
    const date = (body.project?.date || "").toString();
    const fileName = `${projName.replace(/[\\/:*?"<>|]/g, "_")}_Estimate${
      date ? "_" + date : ""
    }.xlsx`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          fileName
        )}"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 400 }
    );
  }
}
