const { execSync } = require('child_process');
const fs = require('fs');

try {
  const nodeV = execSync('node -v', { encoding: 'utf8' }).trim();
  const npmV = execSync('npm -v', { encoding: 'utf8' }).trim();
  fs.writeFileSync('_install_log.txt', `node: ${nodeV}\nnpm: ${npmV}\n`);
  
  const result = execSync('npm install', { 
    encoding: 'utf8', 
    cwd: __dirname,
    timeout: 120000 
  });
  fs.appendFileSync('_install_log.txt', 'npm install output:\n' + result + '\nDONE\n');
} catch(e) {
  fs.appendFileSync('_install_log.txt', 'ERROR: ' + e.message + '\n' + (e.stderr || '') + '\n');
}
