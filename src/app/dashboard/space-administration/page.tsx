import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { assertSpaceAdmin } from "@/lib/server-utils";
import SpaceAdministrationClient from "./SpaceAdministrationClient";

export default async function SpaceAdministrationPage() {
  const session = await auth();
  if (!session?.user?.id || !(await assertSpaceAdmin(session.user.id))) {
    redirect("/dashboard");
  }

  return <SpaceAdministrationClient />;
}
