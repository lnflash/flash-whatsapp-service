#!/bin/bash
# Comprehensive test runner for Flash WhatsApp Service
# Executes unit tests, integration tests, and security tests

set -e  # Exit on any error

# Display banner
echo "=================================================="
echo "      Flash WhatsApp Service - Test Runner        "
echo "=================================================="
echo ""

# Config
PROJECT_ROOT=$(pwd)
REPORT_DIR="${PROJECT_ROOT}/test-reports"
LOG_FILE="${REPORT_DIR}/test-run-$(date +%Y%m%d-%H%M%S).log"

# Ensure reports directory exists
mkdir -p ${REPORT_DIR}

# Helper functions
function log_message() {
    echo "[$(date +%H:%M:%S)] $1"
    echo "[$(date +%H:%M:%S)] $1" >> ${LOG_FILE}
}

function run_section() {
    local section_name=$1
    local command=$2
    
    echo ""
    echo "=== Running ${section_name} ==="
    echo ""
    
    log_message "Starting ${section_name}"
    
    start_time=$(date +%s)
    
    if ${command}; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        log_message "Completed ${section_name} successfully in ${duration}s"
        echo ""
        echo "✅ ${section_name} completed successfully in ${duration}s"
        echo ""
        return 0
    else
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        log_message "❌ ${section_name} failed after ${duration}s"
        echo ""
        echo "❌ ${section_name} failed after ${duration}s"
        echo ""
        return 1
    fi
}

# Record start time
TOTAL_START_TIME=$(date +%s)
log_message "Starting test run"

# Step 1: Static Analysis
run_section "TypeScript compilation" "npm run build" || exit 1

# Step 2: Lint checks
run_section "Lint checks" "npm run lint" || exit 1

# Step 3: Unit tests
run_section "Unit tests" "npm test -- --testPathIgnorePatterns='test/(integration|security|regression)'" || exit 1

# Step 4: Integration tests
run_section "Integration tests" "npm test -- --testMatch='**/test/integration/**/*.spec.ts'" || test_failures=$((test_failures+1))

# Step 5: Security tests
run_section "Security tests" "npm test -- --testMatch='**/test/security/**/*.test.ts'" || test_failures=$((test_failures+1))

# Step 6: Run regression tests
run_section "Regression tests" "npm test -- --testMatch='**/test/regression/**/*.spec.ts'" || test_failures=$((test_failures+1))

# Step 7: Generate coverage report
run_section "Coverage report" "npm run test:cov" || echo "Coverage report generation failed but continuing..."

# Record end time and calculate duration
TOTAL_END_TIME=$(date +%s)
TOTAL_DURATION=$((TOTAL_END_TIME - TOTAL_START_TIME))

# Function to format time
format_time() {
    local seconds=$1
    local minutes=$((seconds / 60))
    local hours=$((minutes / 60))
    local days=$((hours / 24))
    
    if [ $days -gt 0 ]; then
        echo "${days}d $((hours % 24))h $((minutes % 60))m $((seconds % 60))s"
    elif [ $hours -gt 0 ]; then
        echo "${hours}h $((minutes % 60))m $((seconds % 60))s"
    elif [ $minutes -gt 0 ]; then
        echo "${minutes}m $((seconds % 60))s"
    else
        echo "${seconds}s"
    fi
}

FORMATTED_DURATION=$(format_time $TOTAL_DURATION)

echo ""
echo "=================================================="
echo "                 Test Run Summary                 "
echo "=================================================="
echo ""
echo "Total test duration: ${FORMATTED_DURATION}"
echo "Log file: ${LOG_FILE}"
echo ""

if [ "${test_failures}" -gt "0" ]; then
    echo "⚠️  Test run completed with ${test_failures} test suite failures"
    log_message "Test run completed with ${test_failures} test suite failures"
    exit 1
else
    echo "✅ All test suites passed successfully!"
    log_message "All test suites passed successfully"
    exit 0
fi