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
  console.log('\n=== Add New Training Example ===\n');
  
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
  
  console.log('\nNew training example:');
  console.log(JSON.stringify(newExample, null, 2));
  
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
    console.log('✅ Training example added successfully!');
  }
  
  rl.close();
}

async function testAIResponse() {
  console.log('\n=== Test AI Response ===\n');
  console.log('This will show what training examples would be used for a query.\n');
  
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
  
  console.log('\nTop matching training examples:');
  topMatches.forEach((match: any, index: number) => {
    console.log(`\n${index + 1}. Score: ${match.score}`);
    console.log(`   Q: ${match.example.question}`);
    console.log(`   A: ${match.example.answer}`);
  });
  
  if (topMatches.length === 0) {
    console.log('\nNo matching training examples found. Consider adding one!');
  }
  
  rl.close();
}

async function listExamples() {
  console.log('\n=== Current Training Examples ===\n');
  
  const { TRAINING_EXAMPLES } = require('../src/modules/gemini-ai/training/flash-knowledge-base');
  
  const categoryFilter = await question('Filter by category (leave empty for all): ');
  
  const examples = categoryFilter 
    ? TRAINING_EXAMPLES.filter((ex: any) => ex.category === categoryFilter)
    : TRAINING_EXAMPLES;
  
  examples.forEach((ex: any, index: number) => {
    console.log(`\n${index + 1}. [${ex.category}]`);
    console.log(`   Q: ${ex.question}`);
    console.log(`   A: ${ex.answer}`);
    console.log(`   Keywords: ${ex.keywords.join(', ')}`);
  });
  
  console.log(`\nTotal examples: ${examples.length}`);
  
  rl.close();
}

async function main() {
  const command = process.argv[2];
  
  console.log('Flash AI Training Manager');
  console.log('========================\n');
  
  if (!command) {
    console.log('Available commands:');
    console.log('  add     - Add a new training example');
    console.log('  test    - Test what examples match a query');
    console.log('  list    - List all training examples');
    console.log('\nUsage: ts-node scripts/manage-ai-training.ts [command]');
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
      console.log(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(console.error);