import { redirect } from "next/navigation";
import { isAuthenticated } from "@/server/session";
import { LoginForm } from "./login-form";

export default async function Login() {
  if (await isAuthenticated()) redirect("/");
  return <main className="login-screen"><div className="login-card"><div className="brand">elina<span>.</span></div><div className="eyebrow">OBSERVABILITY FOR BUILDERS</div><h1>Welcome back</h1><p>Sign in to inspect your traces.</p><LoginForm /></div></main>;
}

