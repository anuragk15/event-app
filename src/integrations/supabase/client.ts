// Local JSON database. Reads and writes data/db.json instead of Supabase.
import { localSupabase } from "@/lib/localDb";

export const supabase = localSupabase as any;
