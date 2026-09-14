/** Featured content pools, rotated daily so featured views never open empty.
 *
 * Every trend word is verified against word_year.parquet (rates per million
 * words, 1930-49 vs 2010-25) so each title's claim is true in the data.
 * Every matchup ref is verified against the live corpus: genre and decade
 * keys exist in the signature JSONs, movie ids exist in movies-index.json
 * (the corpus is partial - many famous films are absent - so nothing here
 * is guessed). See docs/superpowers/specs/2026-09-14-homepage-ux-overhaul-design.md */

export const FEATURED: { title: string; words: string[] }[] = [
  // language shifts - greetings, politeness, hedging
  { title: "When 'yes' became 'yeah'", words: ['yeah', 'yes'] },
  { title: "'Hi' caught up with 'hello'", words: ['hi', 'hello'] },
  { title: "How movies stopped saying 'shall'", words: ['gonna', 'shall'] },
  { title: "'Okay' conquered the script", words: ['okay', 'certainly'] },
  { title: 'Monsieur, madame - au revoir', words: ['monsieur', 'madame', 'okay'] },
  { title: "The death of 'sir'", words: ['sir', 'madam', 'mister'] },
  { title: "'Perhaps'? Maybe not", words: ['perhaps', 'maybe'] },
  { title: "Nobody 'ought' anymore", words: ['ought', 'suppose', 'reckon'] },
  { title: 'Contractions won', words: ['gotta', 'wanna'] },
  { title: 'Shakespeare leaves the building', words: ['thee', 'thou', 'thy'] },
  { title: "Howdy out, y'all in", words: ["y'all", 'howdy'] },

  // slang and swearing
  { title: 'Cinema learned to swear', words: ['fucking', 'darling'] },
  { title: "'Shit' replaced 'darn'", words: ['shit', 'darn'] },
  { title: 'Taking names in vain', words: ['god', 'jesus', 'christ', 'hell'] },
  { title: "From 'fellow' to 'dude'", words: ['dude', 'fellow'] },
  { title: "'Bro' is having a moment", words: ['bro', 'chap', 'pal'] },
  { title: 'Everything became awesome', words: ['awesome', 'amazing', 'swell'] },
  { title: 'Wow won; gee and golly lost', words: ['wow', 'gee', 'golly'] },
  { title: 'The intensifier epidemic', words: ['totally', 'literally', 'basically', 'actually'] },
  { title: 'Weird in, silly out', words: ['weird', 'silly'] },
  { title: 'Seriously, whatever', words: ['whatever', 'seriously'] },
  { title: "'Super' replaced 'grand'", words: ['super', 'grand'] },
  { title: 'New ways to say stupid', words: ['fool', 'idiot', 'moron', 'stupid'] },
  { title: 'Good vibes arrived', words: ['energy', 'vibe'] },

  // people and family
  { title: 'Mother and father went casual', words: ['mom', 'dad', 'mother', 'father'] },
  { title: 'Children became kids', words: ['kids', 'children'] },
  { title: 'Relationships got labels', words: ['girlfriend', 'boyfriend', 'relationship'] },
  { title: 'Darling out, sweetie in', words: ['darling', 'sweetie', 'babe'] },
  { title: 'Ladies and gentlemen, goodnight', words: ['lady', 'gentleman'] },
  { title: 'What movies called women', words: ['dame', 'broad', 'chick'] },
  { title: 'The marriage plot faded', words: ['marry', 'wedding', 'divorce'] },
  { title: "Words you couldn't say in 1940", words: ['sex', 'pregnant'] },
  { title: 'We started talking about feelings', words: ['therapy', 'stress', 'anxiety', 'shrink'] },

  // technology
  { title: 'The phone replaced the telegram', words: ['phone', 'telegram'] },
  { title: 'Screens took over the script', words: ['computer', 'tv', 'radio'] },
  { title: "You've got mail", words: ['email', 'letter'] },
  { title: 'The internet reaches the movies', words: ['internet', 'online', 'website'] },
  { title: 'From telegraph to text', words: ['text', 'telegraph'] },
  { title: 'Google became a verb', words: ['google', 'facebook', 'app'] },
  { title: 'Hold the line', words: ['operator', 'voicemail'] },
  { title: 'The typewriter gave way', words: ['typewriter', 'laptop'] },
  { title: 'The icebox became the fridge', words: ['icebox', 'fridge', 'refrigerator'] },

  // genres and eras
  { title: 'The Western rode into the sunset', words: ['sheriff', 'saloon', 'wagon', 'cattle'] },
  { title: 'Horsepower, literally', words: ['horse', 'car'] },
  { title: 'The railroad era ended', words: ['train', 'railroad'] },
  { title: 'The officers left the script', words: ['colonel', 'sergeant', 'lieutenant', 'captain'] },
  { title: 'Cinema went nuclear', words: ['nuclear', 'atomic', 'nuke'] },
  { title: 'Cold War vocabulary', words: ['communist', 'commie', 'reds'] },
  { title: 'The Mafia arrived in the 70s', words: ['mafia', 'godfather'] },
  { title: 'Coppers became cops', words: ['cop', 'copper'] },
  { title: 'Fingerprints gave way to DNA', words: ['dna', 'fingerprints', 'forensics'] },
  { title: 'Movies discovered outer space', words: ['space', 'planet', 'alien'] },
  { title: 'Eyes in the sky', words: ['satellite', 'missile', 'drone'] },
  { title: 'The droids arrive', words: ['robot', 'laser'] },
  { title: 'Hollywood left Europe', words: ['england', 'france', 'paris', 'london'] },

  // life on screen
  { title: 'Cinema discovered drugs', words: ['drugs', 'cocaine', 'heroin', 'weed'] },
  { title: 'From champagne to beer', words: ['champagne', 'whiskey', 'beer'] },
  { title: 'Smoking left the screen', words: ['cigarette', 'cigar'] },
  { title: 'Supper became pizza', words: ['pizza', 'supper'] },
  { title: 'America checked into the motel', words: ['motel', 'hotel'] },
  { title: "A 'picture' became a 'movie'", words: ['movie', 'film', 'picture'] },
]

/** Featured Compare matchups: title + the page's `e=` ref string
 * (movie ids verbatim, decades as d:1980, genres as g:Crime). */
export const MATCHUPS: { title: string; e: string }[] = [
  // genre vs genre
  { title: 'Horror vs Comedy', e: 'g:Horror,g:Comedy' },
  { title: 'Western vs Sci-Fi vs Romance', e: 'g:Western,g:Sci-Fi,g:Romance' },
  { title: 'Shadows vs showtunes', e: 'g:Film-Noir,g:Musical' },
  { title: 'Screams vs swoons', e: 'g:Horror,g:Romance' },
  { title: 'Fact vs fantasy', e: 'g:Documentary,g:Fantasy' },
  { title: 'The future vs the past', e: 'g:Sci-Fi,g:History' },
  { title: 'Love and war', e: 'g:Romance,g:War' },
  { title: 'Cartoons vs nightmares', e: 'g:Animation,g:Horror' },
  { title: 'The two masks', e: 'g:Comedy,g:Drama' },
  { title: 'Crime vs Family', e: 'g:Crime,g:Family' },
  { title: 'Song vs sport', e: 'g:Musical,g:Sport' },
  { title: 'Whodunit vs where to next', e: 'g:Mystery,g:Adventure' },

  // decade vs decade
  { title: 'The 1950s vs the 2000s', e: 'd:1950,d:2000' },
  { title: 'Ninety years apart', e: 'd:1930,d:2020' },
  { title: 'A century of talk', e: 'd:1920,d:2020' },
  { title: 'The 70s vs the 90s', e: 'd:1970,d:1990' },
  { title: 'Neon vs now', e: 'd:1980,d:2010' },
  { title: 'The button-down 50s vs the far-out 60s', e: 'd:1950,d:1960' },
  { title: 'Wartime vs the end of history', e: 'd:1940,d:1990' },
  { title: 'Three acts of cinema', e: 'd:1930,d:1970,d:2010' },
  { title: 'The 60s vs the 2000s', e: 'd:1960,d:2000' },

  // mixed
  { title: 'Cowboys meet the 2010s', e: 'g:Western,d:2010' },
  { title: 'Noir then, cinema now', e: 'g:Film-Noir,d:2010' },
  { title: 'Horror against the 50s', e: 'g:Horror,d:1950' },
  { title: 'Sci-fi vs the decade that invented it', e: 'g:Sci-Fi,d:1950' },

  // movie vs movie
  { title: 'Two crime empires', e: 'tt0068646,tt0086250' }, // The Godfather vs Scarface
  { title: 'The Godfather, then the sequel', e: 'tt0068646,tt0071562' },
  { title: 'Alien vs Aliens', e: 'tt0078748,tt0090605' },
  { title: 'Terminator vs The Matrix', e: 'tt0088247,tt0133093' },
  { title: 'Space opera vs space odyssey', e: 'tt0076759,tt0062622' }, // Star Wars vs 2001
  { title: 'Blade Runner vs The Matrix', e: 'tt0083658,tt0133093' },
  { title: "Tarantino's first decade", e: 'tt0105236,tt0110912' }, // Reservoir Dogs vs Pulp Fiction
  { title: 'Two Christmas classics', e: 'tt0095016,tt0099785' }, // Die Hard vs Home Alone
  { title: 'Trouble at sea', e: 'tt0073195,tt0120338' }, // Jaws vs Titanic
  { title: 'The Shining vs The Exorcist', e: 'tt0081505,tt0070047' },
  { title: 'Same mask, forty years', e: 'tt0077651,tt1502407' }, // Halloween 1978 vs 2018
  { title: 'Psycho vs the shot-for-shot remake', e: 'tt0054215,tt0155975' },
  { title: 'Scream, 1996 and 2022', e: 'tt0117571,tt11245972' },
  { title: 'Two giants of 1939', e: 'tt0032138,tt0031381' }, // Wizard of Oz vs Gone with the Wind
  { title: 'The stockbroker and the nanny', e: 'tt0993846,tt0058331' }, // Wolf of Wall Street vs Mary Poppins
  { title: 'Forrest Gump vs Rain Man', e: 'tt0109830,tt0095953' },
  { title: 'War, three generations', e: 'tt0120815,tt5013056,tt8579674' }, // Saving Private Ryan, Dunkirk, 1917
  { title: 'Vietnam, three ways', e: 'tt0078788,tt0093058,tt0091763' }, // Apocalypse Now, Full Metal Jacket, Platoon
  { title: 'Boxing pictures', e: 'tt0075148,tt0081398' }, // Rocky vs Raging Bull
  { title: 'Musicals, forty years apart', e: 'tt0077631,tt3783958' }, // Grease vs La La Land
  { title: 'Two quotable quests', e: 'tt0093779,tt0071853' }, // Princess Bride vs Holy Grail
  { title: 'Bromance, 2000s edition', e: 'tt0838283,tt0829482' }, // Step Brothers vs Superbad
  { title: 'Serial killers, talked about', e: 'tt0114369,tt0102926' }, // Seven vs Silence of the Lambs
  { title: 'Coen country', e: 'tt0116282,tt0477348' }, // Fargo vs No Country for Old Men
  { title: 'Heists and moles', e: 'tt0113277,tt0407887' }, // Heat vs The Departed
  { title: 'Lost in space, three ways', e: 'tt0816692,tt1454468,tt3659388' }, // Interstellar, Gravity, The Martian
  { title: 'Modern horror, two flavours', e: 'tt5052448,tt7784604' }, // Get Out vs Hereditary
  { title: 'Found footage pioneers', e: 'tt0185937,tt1179904' }, // Blair Witch vs Paranormal Activity
  { title: 'Top Gun vs Maverick', e: 'tt0092099,tt1745960' },
  { title: 'Park vs World', e: 'tt0107290,tt0369610' }, // Jurassic Park vs Jurassic World
  { title: 'DC vs Marvel', e: 'tt0468569,tt0848228' }, // The Dark Knight vs The Avengers
  { title: 'Frozen vs Shrek', e: 'tt2294629,tt0126029' },
  { title: "2001's two fantasy premieres", e: 'tt0241527,tt0120737' }, // Harry Potter vs Fellowship of the Ring
  { title: 'Teen crush vs tear-jerker', e: 'tt0147800,tt0332280' }, // 10 Things vs The Notebook
  { title: 'Richard Curtis, twice', e: 'tt0109831,tt0314331' }, // Four Weddings vs Love Actually
  { title: 'Two cult favourites', e: 'tt0118715,tt0368226' }, // The Big Lebowski vs The Room
  { title: '2000s comedy oddballs', e: 'tt0443453,tt0374900' }, // Borat vs Napoleon Dynamite
  { title: '90s nihilism', e: 'tt0117951,tt0137523' }, // Trainspotting vs Fight Club
  { title: 'Tarantino rewrites history', e: 'tt0361748,tt1853728' }, // Inglourious Basterds vs Django Unchained
  { title: 'Revenge, choreographed', e: 'tt0266697,tt2911666' }, // Kill Bill vs John Wick
  { title: 'Alpine nuns vs Greek islands', e: 'tt0059742,tt0795421' }, // Sound of Music vs Mamma Mia!
  { title: 'Twenty years of web-slinging', e: 'tt0145487,tt10872600' }, // Spider-Man 2002 vs No Way Home
]

/** Today's index into a featured pool of `len` items - rotates once per day. */
export const dayIndex = (len: number) => Math.floor(Date.now() / 86_400_000) % len

/** Next (dir=+1) or previous (dir=-1) featured index, wrapping at both ends. */
export const stepFeatured = (idx: number, dir: number, len: number) => (idx + dir + len) % len
