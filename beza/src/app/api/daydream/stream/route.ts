import { NextResponse } from "next/server";
import type { DaydreamStreamResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { pipeline_id } = (await req.json()) as { pipeline_id?: string };

    if (!pipeline_id) {
      return NextResponse.json(
        { error: "Missing pipeline_id" },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.daydream.live/v1/streams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAYDREAM_API_KEY ?? ""}`,
      },
      body: JSON.stringify({ pipeline_id }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const data = (await response.json()) as DaydreamStreamResponse;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unknown server error" },
      { status: 500 }
    );
  }
}
