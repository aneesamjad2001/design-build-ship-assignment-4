import { ButtonLink } from "./Button";

/** What a signed-out visitor sees on "/": what Ironlog is, and the two ways in. */
export function Welcome() {
  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col gap-5 py-6">
      <h1 id="welcome-heading" className="font-display text-5xl font-black leading-none">
        Walk in with a plan.
      </h1>
      <p className="text-lg text-muted">
        Pick the body you&apos;re aiming for and get an exact workout, one exercise at a time. Ironlog remembers your
        weights and eases you back in after time away, on any device.
      </p>
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
