import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { pipeline_id } = await req.json();
  if (!pipeline_id) {
    return NextResponse.json({ error: "Missing pipeline_id" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.daydream.live/v1/streams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAYDREAM_API_KEY}`,
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

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
