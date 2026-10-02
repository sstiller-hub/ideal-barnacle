import { redirect } from "next/navigation"

// There is no standalone PRs screen; per-exercise bests live on Progress.
// Old links and bookmarks land there instead of on a blank page.
export default function PrsPage() {
  redirect("/progress")
}
