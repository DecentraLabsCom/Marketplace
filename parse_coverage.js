const fs = require('fs');

const input = fs.readFileSync('coverage-output.txt', 'utf8');
const lines = input.split('\n');

let inTable = false;
let headerSeen = false;
let results = [];

for (const line of lines) {
  if (line.includes('---|---------|----------|---------|---------|')) {
    if (!headerSeen) {
      headerSeen = true;
      inTable = true;
    } else if (inTable) {
      // reached bottom of table
      inTable = false;
    }
    continue;
  }
  
  if (inTable && line.includes('|') && !line.includes('File') && !line.includes('All files')) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 5) {
      const file = parts[0];
      // Note: handle 'Unknown' or NaN cases by defaulting to 0 or keeping them as strings.
      const stmts = parseFloat(parts[1]);
      const branch = parseFloat(parts[2]);
      const funcs = parseFloat(parts[3]);
      const linesCoverage = parseFloat(parts[4]);
      
      const stmtsVal = isNaN(stmts) ? 100 : stmts;
      const branchVal = isNaN(branch) ? 100 : branch;
      const funcsVal = isNaN(funcs) ? 100 : funcs;
      const linesVal = isNaN(linesCoverage) ? 100 : linesCoverage;
      
      if (stmtsVal < 70 || branchVal < 70 || funcsVal < 70 || linesVal < 70) {
         results.push(`${file.padEnd(35, ' ')} | Stmt: ${stmtsVal.toFixed(2)}% | Branch: ${branchVal.toFixed(2)}% | Funcs: ${funcsVal.toFixed(2)}% | Lines: ${linesVal.toFixed(2)}%`);
      }
    }
  }
}

fs.writeFileSync('below70.txt', results.join('\n'));
