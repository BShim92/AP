const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script id="check-rules">([\s\S]*?)<\/script>/);
assert.ok(script, "The standalone page contains the rules script");
const { rrCheck, gjPlayableAtSpin, gbCheck, mtGoldScore, MTG_MIN_SCORE, ombCheck, spEstimate } = runInNewContext(
  script[1] + "\n({ rrCheck, gjPlayableAtSpin, gbCheck, mtGoldScore, MTG_MIN_SCORE, ombCheck, spEstimate })"
);

function regal(values){
  return rrCheck({ Yellow: 0, Green: 0, Purple: 0, Blue: 0, ...values });
}

test("Regal Riches qualifies at each standalone cutoff with the other meters skipped", () => {
  for (const [meter, cutoff] of [["Yellow", 115], ["Green", 85], ["Purple", 60], ["Blue", 8]]) {
    assert.equal(regal({ [meter]: cutoff - 0.01 }).qualifies, false, meter);
    const result = regal({ [meter]: cutoff });
    assert.equal(result.qualifies, true, meter);
    assert.equal(result.single[0], meter);
  }
});

test("Regal Riches supports the lower pair and the three-meter sum separately", () => {
  assert.equal(regal({ Green: 81, Purple: 56 }).qualifies, true);
  assert.equal(regal({ Green: 81, Purple: 55, Blue: 7 }).qualifies, false);
  assert.equal(regal({ Yellow: 100, Green: 60, Purple: 50 }).qualifies, true);
  assert.equal(regal({ Yellow: 100, Green: 60, Purple: 49, Blue: 7 }).qualifies, false);
});

test("Golden Jungle spin 8 qualifies each chart pattern", () => {
  for (const counts of [
    [1, 1, 1, 0, 0],
    [2, 0, 0, 1, 0],
    [0, 2, 0, 0, 2],
    [1, 1, 0, 2, 0],
    [1, 0, 1, 1, 2],
    [0, 1, 0, 2, 2],
  ]) {
    assert.equal(gjPlayableAtSpin(8, counts), true, counts.join(", "));
  }
});

test("Golden Jungle spin 8 rejects three or more symbols in the wrong places", () => {
  for (const counts of [
    [1, 1, 0, 1, 0],
    [1, 1, 0, 0, 2],
    [0, 0, 0, 2, 2],
    [2, 0, 0, 0, 1],
  ]) {
    assert.equal(gjPlayableAtSpin(8, counts), false, counts.join(", "));
  }
});

test("Golden Jungle estimates use the next chart rule and spin 9 calls for reevaluation", () => {
  assert.equal(gjPlayableAtSpin(3, [1, 0, 0, 0, 0]), false);
  assert.equal(gjPlayableAtSpin(5, [2, 0, 0, 0, 0]), false);
  const counts = [1, 1, 0, 0, 2];
  assert.equal(gjPlayableAtSpin(6, counts), true);
  assert.equal(gjPlayableAtSpin(7, counts), false);
  assert.equal(gjPlayableAtSpin(7, [0, 0, 2, 1, 0]), true);
  assert.equal(gjPlayableAtSpin(9, [2, 2, 2, 2, 2]), false);
});

test("Grand Buddha Link applies the first-symbol exception only to the thin split", () => {
  assert.equal(gbCheck(1, 3, true), "below");
  assert.equal(gbCheck(1, 3, false), "thin");
  assert.equal(gbCheck(2, 1, false), "below");
  assert.equal(gbCheck(2, 2, true), "standard");
  assert.equal(gbCheck(3, 0, true), "standard");
  assert.equal(gbCheck(3, 1, true), "standard");
  assert.equal(gbCheck(2, 3, true), "tight");
});

test("Magic Treasures Gold includes the exact combined score of 24", () => {
  assert.equal(MTG_MIN_SCORE, 24);
  assert.equal(mtGoldScore(24, 5), 24);
  assert.equal(mtGoldScore(14, 42), 24);
  assert.ok(mtGoldScore(14, 41) < MTG_MIN_SCORE);
  assert.ok(mtGoldScore(14, 43) > MTG_MIN_SCORE);
});

test("Ocean Magic Bubble Boost uses each meter's own single and paired cutoff", () => {
  const noBubbles = [0, 0, 0];
  assert.equal(ombCheck([54, 0, 0], noBubbles).match.meters.join(), "Lagoon");
  assert.equal(ombCheck([0, 44, 0], noBubbles).match.meters.join(), "Ocean");
  assert.equal(ombCheck([0, 0, 54], noBubbles).match.meters.join(), "Reef");
  assert.equal(ombCheck([53, 41, 0], noBubbles).match.meters.join(), "Lagoon,Ocean");
  assert.equal(ombCheck([53, 0, 53], noBubbles).match.meters.join(), "Lagoon,Reef");
  assert.equal(ombCheck([0, 41, 53], noBubbles).match.meters.join(), "Ocean,Reef");
  assert.equal(ombCheck([53, 40, 48], noBubbles).match, null);
});

test("Ocean Magic Bubble Boost keeps the asymmetric three-meter cutoffs", () => {
  assert.equal(ombCheck([51, 39, 49], [0, 0, 0]).match.meters.join(), "Lagoon,Ocean,Reef");
  assert.equal(ombCheck([53, 40, 52], [0, 0, 0]).match.meters.join(), "Lagoon,Ocean,Reef");
  assert.equal(ombCheck([49, 39, 51], [0, 0, 0]).match, null);
});

test("Ocean Magic Bubble Boost estimates half a count per matching visible bubble", () => {
  assert.equal(ombCheck([53, 0, 0], [1, 0, 0]).match, null);
  assert.equal(ombCheck([53, 0, 0], [0, 2, 0]).match, null);
  assert.equal(ombCheck([53, 0, 0], [2, 0, 0]).estimated, true);
  assert.equal(ombCheck([54, 0, 0], [2, 0, 0]).estimated, false);
});

function pushEstimate(values){
  return spEstimate({
    coins: 0, prizes: {}, sidePrizes: {}, extraPush: 0, freeSpin: 0,
    uprightJackpot: 0, sideJackpot: 0, phoenixValue: 0, phoenixCloser: false,
    ...values,
  });
}

test("Super Push adds the chart's coin estimate and requires strictly more than 54×", () => {
  const prizes = { Scroll: 1, Gem: 1, Ball: 2 };
  const boundary = pushEstimate({ coins: 74, prizes });
  assert.equal(boundary.score, 54);
  assert.equal(boundary.aboveCutoff, false);
  assert.equal(pushEstimate({ coins: 75, prizes }).aboveCutoff, true);
  assert.equal(pushEstimate({ coins: 0 }).score, 4.375);
});

test("Super Push uses different boundaries for half-value prizes and side jackpot cones", () => {
  const prizes = { Dragon: 1 };
  assert.equal(pushEstimate({ coins: 59, prizes, sidePrizes: prizes }).score, 11.1875);
  assert.equal(pushEstimate({ coins: 60, prizes, sidePrizes: prizes }).score, 14.375);
  const jackpot = { uprightJackpot: 4.5, sideJackpot: 20.25 };
  assert.equal(pushEstimate({ coins: 84, ...jackpot }).score, 14.125);
  assert.equal(pushEstimate({ coins: 85, ...jackpot }).score, 34.4375);
});

test("Super Push boosts combined bonus tokens and uses the closer Phoenix factor", () => {
  assert.equal(pushEstimate({ extraPush: 1 }).score, 20.375);
  const pair = pushEstimate({ extraPush: 1, freeSpin: 1 });
  assert.equal(pair.tokenFactor, 1.5);
  assert.equal(pair.score, 43.375);
  const phoenix = pushEstimate({ extraPush: 1, freeSpin: 1, phoenixCloser: true, phoenixValue: 7.25 });
  assert.equal(phoenix.tokenFactor, 2);
  assert.equal(phoenix.score, 63.625);
});
