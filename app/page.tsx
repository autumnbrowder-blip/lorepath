import { HomeHero } from "@/components/home/HomeHero";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  let isLoggedIn = false;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      isLoggedIn = !!user;
    } catch {
      isLoggedIn = false;
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <HomeHero isLoggedIn={isLoggedIn} />
    </div>
  );
}
