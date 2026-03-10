import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DEFAULT_DESIGN, type ResumeDesign } from "@/lib/design";
import ResumeDesigner from "./ResumeDesigner";

export default async function DesignerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("design")
    .eq("id", user.id)
    .single();

  const savedDesign: ResumeDesign | null = profile?.design ?? null;

  return <ResumeDesigner initialDesign={savedDesign} />;
}
