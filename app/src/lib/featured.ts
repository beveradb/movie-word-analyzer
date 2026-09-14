/** Landing charts, rotated daily so featured views never open empty. Every word
 * is a verified riser/faller from the shifts leaderboard. */
export const FEATURED: { title: string; words: string[] }[] = [
  { title: 'The phone replaced the telegram', words: ['phone', 'telegram'] },
  { title: "How movies stopped saying 'shall'", words: ['gonna', 'shall'] },
  { title: 'Screens took over the script', words: ['computer', 'tv', 'radio'] },
  { title: "From 'fellow' to 'dude'", words: ['dude', 'fellow'] },
  { title: 'Cinema learned to swear', words: ['fucking', 'darling'] },
  { title: 'Monsieur, madame - au revoir', words: ['monsieur', 'madame', 'okay'] },
]

/** Today's featured index — rotates once per day. */
export const dayIndex = () => Math.floor(Date.now() / 86_400_000) % FEATURED.length

/** Next (dir=+1) or previous (dir=-1) featured index, wrapping at both ends. */
export const stepFeatured = (idx: number, dir: number, len: number) => (idx + dir + len) % len
