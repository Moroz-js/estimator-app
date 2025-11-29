"use client";

import EstimatorApp from "@/components/EstimatorApp";
import { supabase } from "@/lib/supabaseClient";
import type { AppState } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();

  const handleSave = async (state: AppState) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new Error("Session expired, please log in again");
    }

    const user = data.user;

    const { data: created, error: insertError } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: state.project.name || "New Project",
        payload: state,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const projectId = created?.id as string;
    if (!projectId) throw new Error("Failed to create project");

    const { error: memberError } = await supabase
      .from("project_members")
      .insert({
        project_id: projectId,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) throw memberError;

    router.replace(`/project/${projectId}`);
  };

  const handleClose = () => {
    router.replace("/");
  };

  return <EstimatorApp onSave={handleSave} onClose={handleClose} />;
}
