import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { stream_id, prompt, image } = await req.json();
  if (!stream_id || !prompt || !image) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.daydream.live/v1/streams/${stream_id}/prompt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DAYDREAM_API_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          image,
          guidance_scale: 7.5,
          num_inference_steps: 50,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
