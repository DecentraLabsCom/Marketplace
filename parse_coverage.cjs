const fs = require('fs');

const input = fs.readFileSync('coverage-output.txt', 'utf8');
const lines = input.split('\n');

let results = [];

for (const line of lines) {
  if (!line.includes('|')) continue;
  if (line.includes('---|---')) continue;
  if (line.includes('File') && line.includes('% Stmts')) continue;
  if (line.includes('All files')) continue;

  const rawTokens = line.split('|');
  if (rawTokens.length < 5) continue;

  const file = rawTokens[0].trim();
  if (!file || file.includes('---')) continue;

  const stmtsStr = rawTokens[1].trim();
  const branchStr = rawTokens[2].trim();
  const funcsStr = rawTokens[3].trim();
  const linesStr = rawTokens[4].trim();

  const stmts = parseFloat(stmtsStr);
  const branch = parseFloat(branchStr);
  const funcs = parseFloat(funcsStr);
  const linesCoverage = parseFloat(linesStr);

  // If any are not numbers (like empty dirs), just skip 
  if (isNaN(stmts) || isNaN(branch) || isNaN(funcs) || isNaN(linesCoverage)) continue;

  if (stmts < 70 || branch < 70 || funcs < 70 || linesCoverage < 70) {
     results.push({ file, stmts, branch, funcs, linesCoverage });
  }
}

// Sort by lowest statement coverage
results.sort((a, b) => a.stmts - b.stmts);

const markdown = results.map(r => 
  `| \`${r.file}\` | ${r.stmts.toFixed(2)}% | ${r.branch.toFixed(2)}% | ${r.funcs.toFixed(2)}% | ${r.linesCoverage.toFixed(2)}% |`
);

markdown.unshift("| --- | --- | --- | --- | --- |");
markdown.unshift("| File | Statements | Branch | Functions | Lines |");

fs.writeFileSync('below70.txt', markdown.join('\n'));
