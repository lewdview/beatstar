const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../artifacts/beatstar-vault/src');

function walk(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, files);
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      files.push(filePath);
    }
  }
  return files;
}

const allFiles = walk(srcDir);
console.log(`Scanning ${allFiles.length} files...`);

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Check if file uses AnimatePresence (e.g. <AnimatePresence or AnimatePresence.something)
  const usesAP = content.includes('AnimatePresence');
  if (usesAP) {
    // Check if it imports it
    const importsAP = content.includes('AnimatePresence') && 
                      (content.includes('import') && (content.includes('framer-motion') || content.includes('framer-motion"')));
    
    // Specifically search if "AnimatePresence" is in the import statement
    const hasImportStatement = /import\s+{[^}]*AnimatePresence[^}]*}\s+from\s+['"]framer-motion['"]/g.test(content) || 
                               /import\s+AnimatePresence\s+from/g.test(content);
    
    if (usesAP && !hasImportStatement) {
      console.log(`⚠️ FILE DOES NOT IMPORT ANIMATEPRESENCE CORRECTLY: ${file}`);
      // Let's print the import lines
      const lines = content.split('\n');
      const importLines = lines.filter(l => l.includes('import'));
      console.log('  Current imports:', importLines);
    }
  }
}
console.log('Scan complete.');
