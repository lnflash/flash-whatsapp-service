#!/usr/bin/env ts-node

/**
 * Script to manage AI training data
 * Usage: ts-node scripts/manage-ai-training.ts [command] [options]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const KNOWLEDGE_BASE_PATH = path.join(__dirname, '../src/modules/gemini-ai/training/flash-knowledge-base.ts');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function addTrainingExample() {
  const exampleQuestion = await question('Question: ');
  const answer = await question('Answer: ');
  const category = await question('Category (balance/receive/linking/username/general/security/support/troubleshooting): ');
  const keywordsStr = await question('Keywords (comma-separated): ');
  
  const keywords = keywordsStr.split(',').map(k => k.trim());
  
  const newExample = {
    question: exampleQuestion,
    answer: answer,
    category: category,
    keywords: keywords
  };
  
  const confirm = await question('\nAdd this example? (y/n): ');
  
  if (confirm.toLowerCase() === 'y') {
    // Read current file
    const fileContent = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf-8');
    
    // Find the TRAINING_EXAMPLES array
    const insertPosition = fileContent.lastIndexOf('];') - 1;
    
    const newExampleStr = `,
  {
    question: '${exampleQuestion.replace(/'/g, "\\'")}',
    answer: '${answer.replace(/'/g, "\\'")}',
    category: '${category}',
    keywords: [${keywords.map(k => `'${k}'`).join(', ')}]
  }`;
    
    const updatedContent = 
      fileContent.slice(0, insertPosition) + 
      newExampleStr + 
      fileContent.slice(insertPosition);
    
    fs.writeFileSync(KNOWLEDGE_BASE_PATH, updatedContent);
  }
  
  rl.close();
}

async function testAIResponse() {
  const testQuery = await question('Enter test query: ');
  
  // Simple keyword matching simulation
  const { TRAINING_EXAMPLES } = require('../src/modules/gemini-ai/training/flash-knowledge-base');
  
  const queryLower = testQuery.toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  
  const scoredExamples = TRAINING_EXAMPLES.map((example: any) => {
    let score = 0;
    
    example.keywords.forEach((keyword: string) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 2;
      }
    });
    
    queryWords.forEach((word: string) => {
      if (word.length > 3) {
        if (example.question.toLowerCase().includes(word)) {
          score += 1;
        }
        if (example.answer.toLowerCase().includes(word)) {
          score += 0.5;
        }
      }
    });
    
    return { example, score };
  });
  
  const topMatches = scoredExamples
    .filter((item: any) => item.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 3);
  
  rl.close();
}

async function listExamples() {
  const { TRAINING_EXAMPLES } = require('../src/modules/gemini-ai/training/flash-knowledge-base');
  
  const categoryFilter = await question('Filter by category (leave empty for all): ');
  
  const examples = categoryFilter 
    ? TRAINING_EXAMPLES.filter((ex: any) => ex.category === categoryFilter)
    : TRAINING_EXAMPLES;
  
  rl.close();
}

async function main() {
  const command = process.argv[2];
  
  if (!command) {
    process.exit(0);
  }
  
  switch (command) {
    case 'add':
      await addTrainingExample();
      break;
    case 'test':
      await testAIResponse();
      break;
    case 'list':
      await listExamples();
      break;
    default:
      process.exit(1);
  }
}

main().catch(() => {
  // Silently handle errors
});