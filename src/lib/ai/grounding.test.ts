/**
 * Grounding tests.
 *
 *   npx tsx src/lib/ai/grounding.test.ts
 *
 * The copilot's central promise is that the model never states a number it did
 * not read from a Postgres result set. This file is what makes that a checked
 * property rather than a comment in a prompt.
 *
 * Each case states an answer and the numbers that should be flagged. The cases
 * that must NOT flag matter as much as the ones that must: a checker that
 * flags everything trains the user to ignore it, and a checker that flags
 * nothing is worse than not having one.
 */
import { verifyGrounding, type AgentStep } from "./agent";

const step: AgentStep = {
  tool: "overview",
  args: {},
  render: { kind: "line", label: "x" },
  // Totals the model saw in the tool payload but which are NOT in the chart rows.
  numericContext: ["4000", "412", "388", "56.7", "18.8", "300", "291", "-12.4", "1200", "3.1", "3100", "0"],
  rows: [
    { label: "10-01", value: 412, secondary: 300 },
    { label: "10-02", value: 388, secondary: 291 },
  ],
};
const steps = [step];

let pass = 0;
let fail = 0;

function check(answer: string, want: number[]) {
  const got = verifyGrounding(answer, steps);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.error(`  FAIL  "${answer}"\n        flagged ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
}

console.log("grounded — these all came from a result set");
check("Pageviews were 412 yesterday.", []);
check("About 388 visitors that day.", []);
check("Your bounce rate was 56.7%.", []);
check("Dwell averaged 18.8 seconds.", []);
check("Traffic fell 12.4% versus the previous window.", []);      // stored as -12.4
check("Roughly 1.2k sessions happened.", []);                      // magnitude suffix
check("LCP was 3100ms on the homepage.", []);                      // unit suffix
check("Total pageviews reached 4,000.", []);                       // thousands separator
check("Zero events were recorded.", []);

console.log("ungrounded — these did not, and must be caught");
check("Twitter drove 47% of referrals.", [47]);
check("You got 9,999 visitors yesterday.", [9999]);
check("Revenue was $4.2M.", [4200000]);
check("Conversion rate is 3.7%.", [3.7]);
check("Bounce rate improved to 41%.", [41]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);