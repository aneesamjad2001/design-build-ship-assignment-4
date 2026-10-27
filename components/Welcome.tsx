import { ButtonLink } from "./Button";

/** What a signed-out visitor sees on "/": what Ironlog is, and the two ways in. */
export function Welcome() {
  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col gap-5 py-6">
      <h1 id="welcome-heading" className="font-display text-5xl font-black leading-none">
        Walk in with a plan.
      </h1>
      <p className="text-lg text-muted">
        Pick the kind of body you&apos;re aiming for and Ironlog gives you an exact workout, one exercise at a
        time. It remembers your weights, eases you back in after time away, and keeps a library of exercises
        you&apos;ve saved.
      </p>
      <p className="text-muted">Your workouts are tied to your account, so they follow you to any device.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/sign-up" variant="primary" className="w-full sm:w-auto">
          Create an account
        </ButtonLink>
        <ButtonLink href="/sign-in" className="w-full sm:w-auto">
          Sign in
        </ButtonLink>
      </div>
    </section>
  );
}
