import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { memberId, projectId, accessToken } = await req.json();

    if (!memberId || !projectId) {
      return NextResponse.json({ error: "memberId and projectId are required" }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Создаём серверный Supabase клиент с токеном пользователя
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Проверяем, что текущий пользователь - владелец проекта
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!member || member.role !== "owner") {
      return NextResponse.json({ error: "Only owner can remove members" }, { status: 403 });
    }

    // Проверяем, что удаляемый участник не владелец
    const { data: targetMember } = await supabase
      .from("project_members")
      .select("role, user_id")
      .eq("id", memberId)
      .single();

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMember.role === "owner") {
      return NextResponse.json({ error: "Cannot remove project owner" }, { status: 400 });
    }

    if (targetMember.user_id === user.id) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    // Удаляем участника
    const { error: deleteError } = await supabase
      .from("project_members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
