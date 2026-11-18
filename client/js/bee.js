// Honeydle — bee mapping + entrances.
// Depends on: core.js (currentPlay). Loaded after grid.js.

// ------------------------------------------------------------------ reveal
// The bee reacts to the round's points: 175 Bullseye = pure gold,
// 100 One Off = covered head to toe in honey, 90 Razor Close = one drop,
// anything lower = thirsty. Text rounds use their tier points the same way.
// Diamond streak (Luke's rule): a second consecutive Bullseye in the same
// play turns the bee diamond; third+ consecutive Bullseyes stay diamond.
// The streak is the trailing run of exact 175s in currentPlay.results, so
// any sub-175 round resets it and a fresh play starts at zero.
function bullseyeStreak() {
  const results = (currentPlay && currentPlay.results) || [];
  let n = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].points === 175) n++;
    else break;
  }
  return n;
}

// Warm and Close answers (55 and 75 points) are fine, not sick: they get
// the NORMAL bee, gentle pulse entrance. Only Lukewarm (35) and below get
// the thirsty bee. Mapping: 175 gold/diamond (streak rules), 100 honey,
// 90 drop, 75/55 normal, 35/15/5 thirsty.
function beeForPoints(points, streak = 0) {
  if (points >= 175) return streak >= 2 ? "bee-diamond.png" : "bee-golden.png";
  if (points >= 100) return "bee-little-honey.png";
  if (points >= 90) return "bee-drop.png";
  if (points >= 55) return "bee-normal.png";
  return "bee-thirsty.png";
}

// Ruby bee (Luke's rule): finish a run with 900+ total points and the
// results screen shows a ruby bee. Results-screen celebration only — it
// never replaces a per-round reveal bee.
function rubyForScore(score) {
  return score >= 900 ? "bee-ruby.png" : null;
}

// One distinct entrance per tier, applied to the reveal hero (tier name +
// points + bee arrive together). 175 first-in-streak bursts; 175 second+
// in a streak gets the biggest entrance of all, diamond burst + sparkle;
// 100 arrives with a honey splash behind it; 90 pops in fast; anything
// lower pulses gently in.
function beeEntranceFor(points, streak = 0) {
  if (points >= 175) return streak >= 2 ? "bee-entrance-diamond" : "bee-entrance-burst";
  if (points >= 100) return "bee-entrance-honey";
  if (points >= 90) return "bee-entrance-pop";
  return "bee-entrance-gentle";
}
