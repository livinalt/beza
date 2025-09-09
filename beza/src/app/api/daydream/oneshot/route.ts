import { NextResponse } from "next/server";
import type { DaydreamOneShotResponse } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { prompt, image } = (await req.json()) as {
      prompt?: string;
      image?: string;
    };

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const response = await fetch("https://api.daydream.live/v1/oneshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAYDREAM_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        pipeline: image ? "image-to-image" : "text-to-image",
        model_id: "streamdiffusion",
        params: {
          prompt,
          ...(image ? { image } : {}),
          guidance_scale: 7.5,
          num_inference_steps: 30,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const result = (await response.json()) as DaydreamOneShotResponse;
    return NextResponse.json(result);
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
