/** Deterministic daily quote — same string all day, rotates by calendar day. */
const QUOTES: readonly string[] = [
  'The man who moves a mountain begins by carrying away small stones.',
  'Discipline is choosing between what you want now and what you want most.',
  'Every day is a chance to be better than yesterday.',
  "Don't wish it were easier. Wish you were better.",
  'The only easy day was yesterday.',
  'Success is the sum of small efforts repeated day in and day out.',
  "You don't rise to the level of your goals. You fall to the level of your systems.",
  'Hard choices, easy life. Easy choices, hard life.',
  'The pain you feel today is the strength you feel tomorrow.',
  'Do something today that your future self will thank you for.',
  'Show up when nobody is watching. That is the work.',
  'Comfort is a slow death. Discomfort is the price of growth.',
  'You cannot cheat the grind. It knows how much you have invested.',
  'Winners do the boring work until it stops being boring.',
  'Your habits are voting on the person you are becoming.',
  'Stop negotiating with yourself. Execute.',
  'Excuses make today easy and tomorrow hard.',
  'The gap between who you are and who you want to be is what you do daily.',
  'No one owes you results. You owe yourself effort.',
  'Discipline beats motivation every time.',
  'Small wins stack. Missed days stack too. Choose your stack.',
  'You are not too busy. You are avoiding the hard thing.',
  'Action kills anxiety. Motion beats meditation without movement.',
  'Be the kind of man who does what he said he would do.',
  'Average is a choice. So is excellence.',
  'The mirror does not lie. Your routine wrote what it shows.',
  'Regret lasts longer than discomfort. Train anyway.',
  'One more rep. One more page. One more day. That is how it is won.',
  'Nobody is coming to save your life. Own it.',
  'Finish what you start. Half-built bridges go nowhere.',
]

export function getDailyQuote(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86400000,
  )
  return QUOTES[dayOfYear % QUOTES.length] ?? QUOTES[0]!
}
