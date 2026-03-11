import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 목록 조회
export async function GET() {
  const { data, error } = await supabase
    .from("roster_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data || [] });
}

// 파일 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { fileId } = await request.json();
    if (!fileId) return NextResponse.json({ error: "fileId 필요" }, { status: 400 });

    const { error } = await supabase.from("roster_uploads").delete().eq("id", fileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류" }, { status: 500 });
  }
}