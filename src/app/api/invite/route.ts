import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { projectId, email, accessToken } = await req.json();

    if (!projectId || !email) {
      return NextResponse.json({ error: "projectId and email are required" }, { status: 400 });
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

    // Получаем текущего пользователя (приглашающего)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Проверяем права доступа приглашающего
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!member || member.role !== "owner") {
      return NextResponse.json({ error: "Only owner can invite users" }, { status: 403 });
    }

    // Ищем пользователя по email через RPC функцию
    const { data: invitedUserId, error: rpcError } = await supabase
      .rpc("find_user_id_by_email", { user_email: email });
    
    if (rpcError) {
      console.error("RPC error:", rpcError);
      return NextResponse.json({ error: "Ошибка поиска пользователя" }, { status: 500 });
    }

    if (!invitedUserId) {
      return NextResponse.json({ error: "Пользователь с таким email не найден" }, { status: 404 });
    }

    // Проверяем, не добавлен ли уже этот пользователь
    const { data: existingMember } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", invitedUserId)
      .single();

    if (existingMember) {
      return NextResponse.json({ error: "Пользователь уже добавлен в проект" }, { status: 400 });
    }

    // Добавляем пользователя в проект с ролью editor (может редактировать, но не приглашать)
    const { error: insertError } = await supabase
      .from("project_members")
      .insert({
        project_id: projectId,
        user_id: invitedUserId,
        role: "editor",
        invited_by: user.id,
        invited_by_email: user.email,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Пользователь приглашён" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
