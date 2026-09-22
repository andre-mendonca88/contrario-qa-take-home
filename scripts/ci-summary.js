// Appends a short markdown summary to $GITHUB_STEP_SUMMARY: coverage headline
// figures and the Playwright pass/fail count, so results are visible on the
// Actions run page without downloading artifacts.
const fs = require('fs');

let out = '## Coverage\n\n| Metric | % |\n| --- | --- |\n';
try {
  const s = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8')).total;
  for (const key of ['statements', 'branches', 'functions', 'lines']) {
    out += `| ${key} | ${s[key].pct}% |\n`;
  }
} catch {
  out += '| _(coverage-summary.json not found)_ | |\n';
}

out += '\n## Playwright\n\n';
try {
  const xml = fs.readFileSync('playwright-report/results.xml', 'utf8');
  const match = xml.match(/<testsuites[^>]*\stests="(\d+)"[^>]*\sfailures="(\d+)"/);
  out += match ? `${match[1]} tests, ${match[2]} failed\n` : '_(results.xml found but could not be parsed)_\n';
} catch {
  out += '_(results.xml not found)_\n';
}

const target = process.env.GITHUB_STEP_SUMMARY;
if (target) {
  fs.appendFileSync(target, out);
} else {
  process.stdout.write(out);
}
