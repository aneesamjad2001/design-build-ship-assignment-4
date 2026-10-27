import { ButtonLink } from "./Button";

/** Shown while your training loads from your account. */
export function LoadingState() {
  return (
    <div aria-busy="true" role="status" className="py-16 text-center">
      <p className="text-xl text-muted">Loading your training…</p>
    </div>
  );
}

/** Screens that need a goal first never dead-end: they say why and offer the way. */
export function NeedsProfile({ what }: { what: string }) {
  return (
    <section className="border border-line bg-surface p-6">
      <h1 className="font-display text-4xl font-extrabold">Pick a look first</h1>
      <p className="mt-2 text-muted">
        {what} Pick the kind of body you&apos;re aiming for. It takes one tap and you&apos;ll get today&apos;s workout right away.
      </p>
      <div className="mt-5">
        <ButtonLink href="/" variant="primary">
          Choose my look
        </ButtonLink>
      </div>
    </section>
  );
}

export function SafetyNote() {
  return (
    <p className="text-sm text-muted">
      General training guidance, not medical advice. Start lighter than you think and stop if something hurts.
    </p>
  );
}
