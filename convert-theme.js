const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend/src');

const classMap = {
  // Backgrounds
  'bg-slate-900': 'bg-slate-50 dark:bg-slate-900',
  'bg-slate-800': 'bg-white dark:bg-slate-800',
  'bg-slate-700': 'bg-slate-200 dark:bg-slate-700',
  'bg-slate-600': 'bg-slate-300 dark:bg-slate-600',
  
  // Hover backgrounds
  'hover:bg-slate-800': 'hover:bg-slate-100 dark:hover:bg-slate-800',
  'hover:bg-slate-800/50': 'hover:bg-slate-100 dark:hover:bg-slate-800/50',
  'hover:bg-slate-700': 'hover:bg-slate-200 dark:hover:bg-slate-700',
  'hover:bg-slate-600': 'hover:bg-slate-300 dark:hover:bg-slate-600',
  
  // Texts
  'text-slate-400': 'text-slate-500 dark:text-slate-400',
  'text-slate-300': 'text-slate-600 dark:text-slate-300',
  'text-slate-200': 'text-slate-800 dark:text-slate-200',
  'text-slate-100': 'text-slate-900 dark:text-slate-100',
  
  // Borders
  'border-slate-700': 'border-slate-200 dark:border-slate-700',
  'border-slate-700/50': 'border-slate-200 dark:border-slate-700/50',
  'border-slate-600': 'border-slate-300 dark:border-slate-600',
  
  // Divide
  'divide-slate-700': 'divide-slate-200 dark:divide-slate-700',
  'divide-slate-700/50': 'divide-slate-200 dark:divide-slate-700/50',
};

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.vue')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let modified = false;
      
      // We look for class="xxx" or class='xxx' or :class="..."
      // It's safer to just split by spaces and match tokens inside the whole file,
      // but to avoid replacing stuff inside JS, we'll replace specifically the words.
      // However, words might match JS variables if we just do global replace.
      // But Tailwind classes are quite unique.
      
      for (const [oldClass, newClasses] of Object.entries(classMap)) {
        // Look for the exact class word, not part of another word.
        // E.g., `bg-slate-900` but not `dark:bg-slate-900` or `hover:bg-slate-900` (unless it's in the key).
        // To safely replace without touching already converted classes:
        // Negative lookbehind for `dark:` or `hover:` if it's not in the key.
        const regex = new RegExp(`(?<!dark:)(?<!hover:)(?<!focus:)\\b${oldClass.replace(/\//g, '\\/')}\\b`, 'g');
        
        if (oldClass.includes('hover:')) {
            // For hover, just negative lookbehind for dark:
            const hoverRegex = new RegExp(`(?<!dark:)\\b${oldClass.replace(/\//g, '\\/')}\\b`, 'g');
            if (hoverRegex.test(content)) {
              content = content.replace(hoverRegex, newClasses);
              modified = true;
            }
        } else {
            if (regex.test(content)) {
              content = content.replace(regex, newClasses);
              modified = true;
            }
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(dir);
console.log('Conversion terminée.');
