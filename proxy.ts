import { clerkMiddleware } from "@clerk/nextjs/server";

// Our own sign-in/up pages, set here rather than in env vars: they aren't secrets, and
// without them a deploy missing those vars sends people to Clerk's hosted page instead.
export default clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
