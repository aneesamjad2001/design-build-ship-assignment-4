/** Item 1: the parts of a body change training doesn't control, as a few tips. Nothing to log. */
const TIPS = [
  ["Protein at each meal", "Muscle is built from protein. A palm-sized portion (meat, fish, eggs, tofu, beans, Greek yogurt) at most meals covers it for most people."],
  ["Sleep 7+ hours", "Most adults need 7 or more hours. Strength and muscle are built while you recover, and lifting feels harder short on sleep."],
  ["Eat before you train", "Something you like an hour or two before makes a workout feel easier. Training hungry isn't a virtue."],
  ["Give it time", "Strength shows up within weeks. Visible change usually takes months. Showing up matters more than a perfect week."],
];

export function FoodSleepCard() {
  return (
    <section aria-labelledby="food-sleep" className="border border-line bg-surface p-5">
      <h2 id="food-sleep" className="font-display text-3xl font-extrabold">
        Food and sleep
      </h2>
      <p className="mt-1 text-muted">The half of the result that happens outside the gym. Nothing to track.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {TIPS.map(([title, text]) => (
          <li key={title} className="border-l-4 border-ink bg-raised px-4 py-3">
            <p className="font-display text-xl font-extrabold">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        General information, not medical or dietary advice. If you have a health condition, are pregnant, or have a history of disordered eating, talk to a
        doctor or dietitian.
      </p>
    </section>
  );
}
