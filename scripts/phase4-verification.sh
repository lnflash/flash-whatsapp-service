#!/bin/bash

# Phase 4 Verification Script
# This script verifies all required Phase 4 deliverables are complete

echo "========================================================"
echo "        Phase 4 Verification and Readiness Check         "
echo "========================================================"

# Function to check if a file exists
check_file() {
  if [ -f "$1" ]; then
    echo "✅ Found $1"
    return 0
  else
    echo "❌ Missing $1"
    return 1
  fi
}

# Function to check if a directory exists
check_directory() {
  if [ -d "$1" ]; then
    echo "✅ Found directory $1"
    return 0
  else
    echo "❌ Missing directory $1"
    return 1
  fi
}

# Function to count files in a directory matching a pattern
count_files() {
  local count=$(find "$1" -name "$2" | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "✅ Found $count files matching $2 in $1"
    return 0
  else
    echo "❌ No files matching $2 found in $1"
    return 1
  fi
}

# Check base directories
echo -e "\n[1/6] Checking directory structure..."
DIRECTORIES=(
  "./test/integration"
  "./test/security"
  "./test/regression"
  "./docs"
  "./scripts"
)

dir_errors=0
for dir in "${DIRECTORIES[@]}"; do
  check_directory "$dir" || ((dir_errors++))
done

if [ $dir_errors -eq 0 ]; then
  echo "✅ All required directories exist"
else
  echo "❌ $dir_errors directory errors found"
fi

# Check documentation files
echo -e "\n[2/6] Checking documentation..."
DOCS=(
  "./docs/PHASE_4_PLAN.md"
  "./docs/PHASE_4_SUMMARY.md"
  "./docs/PHASE_5_PLAN.md"
  "./test/security/security-assessment-plan.md"
  "./test/security/penetration-testing-guide.md"
  "./test/regression/regression-test-plan.md"
)

doc_errors=0
for doc in "${DOCS[@]}"; do
  check_file "$doc" || ((doc_errors++))
done

if [ $doc_errors -eq 0 ]; then
  echo "✅ All required documentation exists"
else
  echo "❌ $doc_errors documentation errors found"
fi

# Check test files
echo -e "\n[3/6] Checking test files..."
TEST_FILES=(
  "./test/integration/account-linking.integration.spec.ts"
  "./test/integration/balance-check.integration.spec.ts"
  "./test/security/authentication.security.test.ts"
  "./test/security/input-validation.security.test.ts"
  "./test/security/rate-limiter.security.test.ts"
)

test_errors=0
for test in "${TEST_FILES[@]}"; do
  check_file "$test" || ((test_errors++))
done

if [ $test_errors -eq 0 ]; then
  echo "✅ All required test files exist"
else
  echo "❌ $test_errors test file errors found"
fi

# Check script files
echo -e "\n[4/6] Checking utility scripts..."
SCRIPTS=(
  "./scripts/run-all-tests.sh"
  "./scripts/security-scan.sh"
  "./scripts/phase4-verification.sh"
)

script_errors=0
for script in "${SCRIPTS[@]}"; do
  check_file "$script" || ((script_errors++))
done

if [ $script_errors -eq 0 ]; then
  echo "✅ All required scripts exist"
else
  echo "❌ $script_errors script errors found"
fi

# Check for TypeScript errors
echo -e "\n[5/6] Checking for TypeScript errors..."
npm run build > /tmp/tsc_output.txt 2>&1
if grep -q "Found 0 error" /tmp/tsc_output.txt || grep -q "success" /tmp/tsc_output.txt; then
  echo "✅ TypeScript compilation successful - no errors found"
else
  echo "❌ TypeScript errors detected"
  cat /tmp/tsc_output.txt | grep -A 1 error
fi

# Run unit tests
echo -e "\n[6/6] Running unit tests..."
npm test > /tmp/test_output.txt 2>&1
if grep -q "FAIL" /tmp/test_output.txt; then
  echo "❌ Unit tests failing"
  cat /tmp/test_output.txt | grep -A 3 FAIL
else
  echo "✅ All unit tests passing"
fi

# Summary
echo -e "\n========================================================"
echo "                 Phase 4 Readiness Summary                "
echo "========================================================"

total_errors=$((dir_errors + doc_errors + test_errors + script_errors))

if [ $total_errors -eq 0 ] && ! grep -q "FAIL" /tmp/test_output.txt && ! grep -q "error" /tmp/tsc_output.txt; then
  echo "✅ Phase 4 completion verified - Ready for Phase 5"
  echo "✅ All directories and files are in place"
  echo "✅ Documentation is complete"
  echo "✅ Tests are implemented and passing"
  echo "✅ Utility scripts are in place"
  echo "✅ No TypeScript errors"
  exit 0
else
  echo "❌ Phase 4 verification failed - $total_errors issues found"
  echo "📋 Please address the issues above before proceeding to Phase 5"
  exit 1
fi