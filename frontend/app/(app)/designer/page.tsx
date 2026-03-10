import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type ResumeDesign } from "@/lib/design";
import ResumeDesigner from "./ResumeDesigner";

export default async function DesignerPage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("design")
    .eq("id", user.id)
    .single();

  const savedDesign: ResumeDesign | null = profile?.design ?? null;

  return <ResumeDesigner initialDesign={savedDesign} />;
}
