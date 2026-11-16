// Command-line flag parsing for bin/ask.mjs.
import { parseBusinessFlag } from './businesses.mjs';

export function parseArgs(argv) {
  const opts = { businesses: [], live: false, maxCalls: 3, pollInterval: 10, timeout: 600 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--live': opts.live = true; break;
      case '--dry-run': opts.dryRunFlag = true; break;
      case '--business': opts.businesses.push(parseBusinessFlag(next())); break;
      case '--businesses': opts.file = next(); break;
      case '--max-calls': opts.maxCalls = Number(next()); break;
      case '--out': opts.out = next(); break;
      case '--agent-id': opts.agentId = next(); break;
      case '--facts': opts.facts = next(); break;
      case '--poll-interval': opts.pollInterval = Number(next()); break;
      case '--timeout': opts.timeout = Number(next()); break;
      case '--endpoint': opts.endpoint = next(); break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        positional.push(a);
    }
  }
  if (opts.live && opts.dryRunFlag) throw new Error('choose --live or --dry-run, not both');
  if (!Number.isInteger(opts.maxCalls) || opts.maxCalls < 1) throw new Error('--max-calls must be a positive whole number');
  opts.question = positional.join(' ').trim();
  return opts;
}
