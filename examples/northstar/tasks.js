const [task,...args]=process.argv.slice(2);
console.log(`Northstar demo · ${task}`, ...args);
if(task==='fail') {console.error('Intentional failure for testing feedback');process.exitCode=7;}
else if(task==='dev') {
  console.log('Long-running demo. Type into its console, or cancel from Ciupaga to stop.');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',value=>console.log('Input:',value.trim()));
  setInterval(()=>console.log('Still running…'),5000);
}
else console.log('Done.');
