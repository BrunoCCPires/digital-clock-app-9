import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);

// Logging system
interface LogEntry {
  timestamp: string;
  type: 'system' | 'tool' | 'message' | 'error';
  content: string;
  metadata?: any;
}

const logs: LogEntry[] = [];

function log(type: LogEntry['type'], content: string, metadata?: any) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type,
    content,
    metadata
  };
  logs.push(entry);

  const prefix = type === 'error' ? '❌' : type === 'tool' ? '🔧' : type === 'message' ? '💬' : '📝';
  console.log(`${prefix} [${type.toUpperCase()}] ${content}`);
  if (metadata) console.log('   ', JSON.stringify(metadata, null, 2));

  // Append to log file immediately
  fs.appendFileSync('claude-execution.log', JSON.stringify(entry) + '\n');
}

// Tool implementations
class Tools {
  async read(filePath: string): Promise<string> {
    try {
      log('tool', `Reading file: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8');
      log('tool', `Successfully read ${filePath} (${content.length} chars)`);
      return content;
    } catch (error) {
      const msg = `Failed to read ${filePath}: ${error}`;
      log('error', msg);
      return `Error: ${msg}`;
    }
  }

  async write(filePath: string, content: string): Promise<string> {
    try {
      log('tool', `Writing file: ${filePath}`, { contentLength: content.length });
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
      log('tool', `Successfully wrote ${filePath}`);
      return `Successfully wrote ${filePath}`;
    } catch (error) {
      const msg = `Failed to write ${filePath}: ${error}`;
      log('error', msg);
      return `Error: ${msg}`;
    }
  }

  async edit(filePath: string, oldText: string, newText: string): Promise<string> {
    try {
      log('tool', `Editing file: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8');

      if (!content.includes(oldText)) {
        const msg = `Old text not found in ${filePath}`;
        log('error', msg);
        return `Error: ${msg}`;
      }

      const newContent = content.replace(oldText, newText);
      fs.writeFileSync(filePath, newContent, 'utf8');
      log('tool', `Successfully edited ${filePath}`);
      return `Successfully edited ${filePath}`;
    } catch (error) {
      const msg = `Failed to edit ${filePath}: ${error}`;
      log('error', msg);
      return `Error: ${msg}`;
    }
  }

  async bash(command: string): Promise<string> {
    try {
      log('tool', `Executing bash: ${command}`);
      const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
      const output = stdout + stderr;
      log('tool', `Bash completed`, { command, outputLength: output.length });
      return output || 'Command executed successfully';
    } catch (error: any) {
      const msg = `Bash command failed: ${error.message}`;
      log('error', msg, { command });
      return `Error: ${msg}\nOutput: ${error.stdout || ''}\n${error.stderr || ''}`;
    }
  }

  async glob(pattern: string): Promise<string> {
    try {
      log('tool', `Glob pattern: ${pattern}`);
      const { stdout } = await execAsync(`find . -path '${pattern}' -type f 2>/dev/null | head -100`);
      const files = stdout.trim().split('\n').filter(Boolean);
      log('tool', `Found ${files.length} files matching ${pattern}`);
      return files.join('\n');
    } catch (error) {
      const msg = `Glob failed: ${error}`;
      log('error', msg);
      return `Error: ${msg}`;
    }
  }
}

// Main implementation
async function implementFeature() {
  try {
    log('system', 'Starting feature implementation');

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const tools = new Tools();
    const FEATURE_REQUEST = process.env.FEATURE_REQUEST || '';

    if (!FEATURE_REQUEST) {
      log('error', 'No FEATURE_REQUEST provided');
      process.exit(1);
    }

    log('system', `Feature request: ${FEATURE_REQUEST}`);

    // Read CLAUDE.md if it exists
    let claudeMd = '';
    try {
      claudeMd = await tools.read('CLAUDE.md');
      log('system', 'Found and read CLAUDE.md');
    } catch {
      log('system', 'No CLAUDE.md found');
    }

    // Build comprehensive prompt
    const systemPrompt = `You are an expert software engineer implementing features in this repository.

You have access to these tools:
- read(path): Read a file
- write(path, content): Write/create a file
- edit(path, old_text, new_text): Replace text in a file
- bash(command): Run bash commands (use for git, npm, etc)
- glob(pattern): Find files matching a pattern

${claudeMd ? `\n## Project Instructions (CLAUDE.md)\n${claudeMd}\n` : ''}

## Important Guidelines
- ALWAYS read CLAUDE.md first if it exists
- Follow ALL project conventions from CLAUDE.md
- Assume environment variables are always available
- Write production-ready, fully functional code
- Match existing code style and patterns
- Make focused, minimal changes
- For UI: follow existing styling approach, ensure responsive design, add proper loading/error states
- Subscribe.dev: ONLY use if explicitly mentioned in request (phrases: "with subscribe.dev", "using subscribe.dev", etc)

You MUST use the provided tools to make changes. Do not just describe what to do - actually use the tools to implement the feature.`;

    const userPrompt = `Implement this feature: ${FEATURE_REQUEST}

Repository: ${process.env.GITHUB_REPOSITORY || 'unknown'}
Branch: ${process.env.BRANCH_NAME || 'unknown'}

Steps:
1. Read CLAUDE.md if you haven't already (use read tool)
2. Use glob/read to understand the codebase structure
3. Make the necessary changes using write/edit tools
4. Update package.json if adding dependencies (use edit tool)
5. Use bash tool for npm install if needed

Start implementing now using the tools.`;

    // Define tool schemas for Claude
    const toolDefinitions: Anthropic.Tool[] = [
      {
        name: 'read',
        description: 'Read the contents of a file',
        input_schema: {
type: 'object',
properties: {
  path: { type: 'string', description: 'File path to read' }
},
required: ['path']
        }
      },
      {
        name: 'write',
        description: 'Write content to a file (creates directories if needed)',
        input_schema: {
type: 'object',
properties: {
  path: { type: 'string', description: 'File path to write' },
  content: { type: 'string', description: 'Content to write' }
},
required: ['path', 'content']
        }
      },
      {
        name: 'edit',
        description: 'Edit a file by replacing old text with new text',
        input_schema: {
type: 'object',
properties: {
  path: { type: 'string', description: 'File path to edit' },
  old_text: { type: 'string', description: 'Text to replace' },
  new_text: { type: 'string', description: 'Replacement text' }
},
required: ['path', 'old_text', 'new_text']
        }
      },
      {
        name: 'bash',
        description: 'Execute a bash command',
        input_schema: {
type: 'object',
properties: {
  command: { type: 'string', description: 'Bash command to execute' }
},
required: ['command']
        }
      },
      {
        name: 'glob',
        description: 'Find files matching a glob pattern',
        input_schema: {
type: 'object',
properties: {
  pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' }
},
required: ['pattern']
        }
      }
    ];

    // Conversation loop
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userPrompt }
    ];

    let continueLoop = true;
    let iterationCount = 0;
    const MAX_ITERATIONS = 20;

    while (continueLoop && iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      log('system', `Iteration ${iterationCount}/${MAX_ITERATIONS}`);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: toolDefinitions
      });

      log('message', `Claude response (stop_reason: ${response.stop_reason})`);

      // Process response content
      let hasToolUse = false;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
log('message', `Claude: ${block.text.substring(0, 200)}${block.text.length > 200 ? '...' : ''}`);
        } else if (block.type === 'tool_use') {
hasToolUse = true;
log('tool', `Tool call: ${block.name}`, block.input);

let result: string;
try {
  switch (block.name) {
    case 'read':
      result = await tools.read((block.input as any).path);
      break;
    case 'write':
      result = await tools.write((block.input as any).path, (block.input as any).content);
      break;
    case 'edit':
      result = await tools.edit((block.input as any).path, (block.input as any).old_text, (block.input as any).new_text);
      break;
    case 'bash':
      result = await tools.bash((block.input as any).command);
      break;
    case 'glob':
      result = await tools.glob((block.input as any).pattern);
      break;
    default:
      result = `Unknown tool: ${block.name}`;
  }
} catch (error) {
  result = `Tool execution error: ${error}`;
  log('error', result);
}

toolResults.push({
  type: 'tool_result',
  tool_use_id: block.id,
  content: result
});
        }
      }

      // Check if we should continue
      if (response.stop_reason === 'end_turn' || !hasToolUse) {
        continueLoop = false;
        log('system', 'Conversation ended');
      } else {
        // Add assistant message and tool results to conversation
        messages.push({
role: 'assistant',
content: response.content
        });

        if (toolResults.length > 0) {
messages.push({
  role: 'user',
  content: toolResults
});
        }
      }
    }

    if (iterationCount >= MAX_ITERATIONS) {
      log('system', 'Reached maximum iterations');
    }

    log('system', 'Feature implementation completed');

    // Save logs
    fs.writeFileSync('claude-execution.log.json', JSON.stringify({ logs, totalIterations: iterationCount }, null, 2));

    return 0;

  } catch (error: any) {
    log('error', `Fatal error: ${error.message}`, { stack: error.stack });

    // Save error summary
    const errorLogs = logs.filter(l => l.type === 'error');
    const errorSummary = errorLogs.map(l => l.content).join('\n');
    fs.writeFileSync('claude-error-summary.txt', errorSummary);

    // Save all logs
    fs.writeFileSync('claude-execution.log.json', JSON.stringify({ logs, error: error.message }, null, 2));

    return 1;
  }
}

// Run
implementFeature().then(code => {
  process.exit(code);
}).catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
