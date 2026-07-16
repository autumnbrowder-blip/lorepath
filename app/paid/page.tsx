import { redirect } from "next/navigation";

/** Legacy route — Beta features are free; send readers to FAQ. */
export default function PaidRedirectPage() {
  redirect("/faq");
}
