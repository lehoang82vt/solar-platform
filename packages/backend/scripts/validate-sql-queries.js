#!/usr/bin/env node

/**
 * Script để validate SQL queries trong code
 * Kiểm tra các lỗi phổ biến:
 * - Column không tồn tại (address vs customer_address)
 * - contract_value vs total_vnd
 * - current_setting với empty string
 */

const fs = require('fs');
const path = require('path');

const errors = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Check for projects.address (should be customer_address)
    if (line.includes('projects.address') && !line.includes('customer_address')) {
      errors.push({
        file: filePath,
        line: lineNum,
        error: 'projects.address should be projects.customer_address',
        code: line.trim()
      });
    }
    
    // Check for contract_value in SELECT (should use total_vnd)
    if (line.includes('contract_value') && line.includes('SELECT') && !line.includes('total_vnd')) {
      errors.push({
        file: filePath,
        line: lineNum,
        error: 'contract_value in SELECT should use total_vnd',
        code: line.trim()
      });
    }
    
    // Check for current_setting with uuid cast (should use parameter)
    if (line.includes("current_setting('app.current_org_id'") && line.includes('::uuid')) {
      errors.push({
        file: filePath,
        line: lineNum,
        error: 'Should use parameter instead of current_setting to avoid empty string UUID error',
        code: line.trim()
      });
    }
  });
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('dist')) {
      scanDirectory(filePath);
    } else if (file.endsWith('.ts') && file.includes('services')) {
      checkFile(filePath);
    }
  });
}

console.log('Validating SQL queries...\n');

const servicesDir = path.join(__dirname, '../src/services');
scanDirectory(servicesDir);

if (errors.length > 0) {
  console.error(`Found ${errors.length} potential issues:\n`);
  errors.forEach((err, i) => {
    console.error(`${i + 1}. ${err.file}:${err.line}`);
    console.error(`   ${err.error}`);
    console.error(`   ${err.code}\n`);
  });
  process.exit(1);
} else {
  console.log('✓ No SQL validation errors found!');
  process.exit(0);
}
